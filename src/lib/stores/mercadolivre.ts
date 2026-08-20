import { prisma } from "@/lib/prisma";
import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch } from "./types";
import { runApifyActor } from "@/lib/adapters/suppliers";
import { getMercadoLivreAccessToken } from "@/lib/mercadolivre-oauth";
import { withoutMedicine } from "./anvisa";

// Mercado Livre como VITRINE DE CAUDA LONGA (decisão do dono, 16/08/2026).
//
// Por que voltou: o produto é concierge MANUAL — quem compra é o operador. O motivo
// histórico de abandonar o ML era automatizar o checkout (sem API de comprador, robô =
// banimento); com compra manual esse bloqueio não existe. E os 7 ciclos de teste real
// mostraram que as recusas recorrentes eram exatamente cauda longa (cabo USB-C,
// camiseta, lancheira) — coisas que as 18 vitrines raspadas não têm e o ML tem.
//
// Papel no registry (deliberadamente estreito):
//   • lojas locais = o "hoje" (mercado, fresco, pet, farmácia);
//   • ML = todo o resto, com o PRAZO DO PRÓPRIO ANÚNCIO ("chega hoje/amanhã", que o
//     actor devolve no campo `envio`) em vez de promessa no escuro.
//
// Reversível por env (pedido do dono): `LIA_ENABLE_MERCADOLIVRE=true` liga; qualquer
// outro valor (ou ausência) desliga e nada no fluxo muda. Sem deploy pra voltar atrás.
//
// Latência medida em 16/08 no actor real: 22,7s (cabo usb-c) e 25,1s (camiseta), 48
// itens cada, ~R$0,03/busca. Por isso: SearchCache persistente (o `searchItems` só
// espera a rede na busca FRIA) e o chamador avisa o cliente antes de esperar.
const ACTOR = process.env.APIFY_MERCADO_LIVRE_ACTOR ?? "karamelo/mercadolivre-scraper-brasil-portugues";
const CACHE_TTL_MS = Number(process.env.LIA_ML_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);

export function mercadoLivreEnabled(): boolean {
  return process.env.LIA_ENABLE_MERCADOLIVRE === "true" && Boolean(process.env.APIFY_API_TOKEN);
}

// Formas que o actor usa para dizer o prazo. Guardamos a frase do anúncio como veio
// (é a promessa da PRÓPRIA loja) e derivamos só um rótulo curto pro card.
// O slot do card é PRAZO DE ENTREGA (reclamação do dono, 17/08: "tá vindo frete grátis
// mas é pra vir prazo"): "Frete grátis" sem data não entra — anúncio sem prazo publicado
// sai sem rótulo, e o prazo oficial é o da cotação do operador. Nunca inventamos data.
export function deliveryLabelFrom(envio: string | undefined): string | undefined {
  const raw = (envio ?? "").trim();
  if (!raw) return undefined;
  const n = raw.toLowerCase();
  if (n.includes("hoje")) return "chega hoje";
  if (n.includes("amanha") || n.includes("amanhã")) return "chega amanhã";
  const days = n.match(/(\d+)\s*dias?/)?.[1];
  if (days) return `chega em ${days} dias`;
  return undefined;
}

type ApifyMlItem = {
  eTituloProduto?: string;
  novoPreco?: string | number;
  imagemLink?: string;
  zProdutoLink?: string;
  produtoMarca?: string;
  patrocinado?: string;
  is_inStock?: boolean | null;
  eCompraInternacional?: boolean | string | null;
  enviadoDe?: string;
  envio?: string;
  freteGratis?: boolean | null;
  idPublicacao?: string;
  SKU?: string;
  // Sinais de POPULARIDADE que o ML publica no resultado. Sem eles, a vitrine ordenava
  // só por semelhança de texto e subia anúncio obscuro com zero venda — foi o "trouxe
  // umas coisas estranhas" do 1º teste real (16/08).
  quantidadeVendida?: number | string | null;
  numeroAvaliacoes?: number | string | null;
  produtoReviews?: number | string | null;
  posicaoItem?: number | null;
  lojaOficial?: boolean | null;
};

type OfficialMlItem = {
  id?: string;
  title?: string;
  price?: number;
  thumbnail?: string;
  permalink?: string;
  shipping?: { free_shipping?: boolean };
  seller?: { nickname?: string };
};

type OfficialMlSearchResponse = { results?: OfficialMlItem[] };

// Item do ML guarda os sinais junto (sobrevive ao cache, que serializa o objeto).
type MlCatalogItem = CatalogItem & { mlTrust?: number; mlPosition?: number };

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Quanto o MERCADO confia neste anúncio: vendas e avaliações em escala log (a diferença
// entre 100 e 100.000 vendas importa, mas não pode esmagar a relevância), nota acima de
// 4 como bônus pequeno e loja oficial como desempate. Anúncio sem venda e sem avaliação
// fica com 0 e vai para o fim da lista — que é exatamente onde ele deve estar.
function trustScore(raw: ApifyMlItem): number {
  const sold = toNumber(raw.quantidadeVendida);
  const reviews = toNumber(raw.numeroAvaliacoes);
  const rating = toNumber(raw.produtoReviews);
  const soldPoints = sold > 0 ? Math.log10(1 + sold) : 0;
  const reviewPoints = reviews > 0 ? Math.log10(1 + reviews) : 0;
  const ratingPoints = rating >= 4 ? (rating - 4) * 2 : 0;
  const officialPoints = raw.lojaOficial ? 1 : 0;
  return Math.round((soldPoints + reviewPoints + ratingPoints + officialPoints) * 100) / 100;
}

// "18,68" → 18.68. Preço quebrado ou zero é anúncio inválido pra nós (o operador não
// consegue comprar por um preço que não existe) — vira null e o item é descartado.
function parsePrice(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const raw = (value ?? "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// O CDN do ML entrega .webp por padrão — e a Meta RECUSA WebP no card
// ("131053 — WebP image uploads are not currently supported", caso real 16/08: os 3
// cards de camiseta foram descartados e a conversa ficou presa esperando escolha).
// O mesmo arquivo existe em JPG trocando a extensão (verificado: 206 image/jpeg), do
// mesmo jeito que o Boticário força f_jpg no Cloudinary por causa do AVIF.
export function mlImageAsJpg(url: string | undefined): string | undefined {
  const raw = (url ?? "").trim();
  if (!raw) return undefined;
  return raw.replace(/\.webp(\?|$)/i, ".jpg$1");
}

function toCatalogItem(raw: ApifyMlItem): MlCatalogItem | null {
  const name = (raw.eTituloProduto ?? "").trim();
  const unitPrice = parsePrice(raw.novoPreco);
  const productUrl = (raw.zProdutoLink ?? "").trim();
  if (!name || unitPrice == null || !productUrl) return null;
  // Anúncio patrocinado é publicidade, não a melhor opção — fica de fora.
  if ((raw.patrocinado ?? "").trim()) return null;
  if (raw.is_inStock === false) return null;
  // Compra internacional ("enviado da China") leva SEMANAS — incompatível com um
  // concierge de entrega em dias. Fora, sempre (17/08).
  if (raw.eCompraInternacional === true || raw.eCompraInternacional === "true") return null;
  if (/china|internacional/i.test(raw.enviadoDe ?? "")) return null;
  const id = (raw.idPublicacao ?? raw.SKU ?? productUrl.split("/").pop() ?? name).toString().replace(/\W+/g, "").slice(0, 40);
  const delivery = deliveryLabelFrom(raw.envio);
  return {
    sku: `ml-${id}`,
    name,
    brand: (raw.produtoMarca ?? "").trim() || undefined,
    unitPrice,
    // O prazo do anúncio viaja como categoria: é o que a copy mostra no card e o que o
    // operador confere ao comprar. Nunca inventamos prazo para item de ML.
    category: delivery,
    imageUrl: mlImageAsJpg(raw.imagemLink),
    productUrl,
    // O anúncio é a autoridade do próprio frete (o texto de envio diz "Chegará GRÁTIS").
    ...(raw.freteGratis === true || /gratis|grátis/i.test(raw.envio ?? "") ? { freeShipping: true } : {}),
    mlTrust: trustScore(raw),
    mlPosition: typeof raw.posicaoItem === "number" ? raw.posicaoItem : 999
  };
}

// Ranking da vitrine ML: relevância manda (quem pediu "camiseta do corinthians" quer o
// Corinthians, não a polo mais vendida); no empate, anúncio com PRAZO PUBLICADO ("chega
// hoje/amanhã", em `category`) vem antes do sem prazo — o card existe pra responder
// "quando chega" (dono, 17/08) — e só então vendas/avaliações e a ordem do próprio ML.
export function rankMercadoLivre<T extends MlCatalogItem>(query: string, items: T[], limit: number): T[] {
  return items
    .map((item) => ({ item, score: scoreCatalogMatch(query, item) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(Boolean(b.item.category)) - Number(Boolean(a.item.category)) ||
        (b.item.mlTrust ?? 0) - (a.item.mlTrust ?? 0) ||
        (a.item.mlPosition ?? 999) - (b.item.mlPosition ?? 999) ||
        a.item.unitPrice - b.item.unitPrice
    )
    .slice(0, limit)
    .map((entry) => entry.item);
}

async function cachedItems(queryKey: string): Promise<MlCatalogItem[] | null> {
  try {
    const row = await prisma.searchCache.findUnique({ where: { queryKey } });
    if (!row) return null;
    if (Date.now() - new Date(row.updatedAt).getTime() > CACHE_TTL_MS) return null;
    return row.items as unknown as MlCatalogItem[];
  } catch (error) {
    console.warn("[ml:cache:read-failed]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function storeItems(queryKey: string, query: string, items: MlCatalogItem[]) {
  try {
    await prisma.searchCache.upsert({
      where: { queryKey },
      create: { queryKey, query, source: "mercado_livre", items: items as unknown as object },
      update: { items: items as unknown as object }
    });
  } catch (error) {
    console.warn("[ml:cache:write-failed]", error instanceof Error ? error.message : error);
  }
}

// The official endpoint returns in around a second when the operator has linked
// a DevCenter application. Apify remains the resilient fallback: a 401, 403,
// timeout or empty response must never turn a valid long-tail request into a refusal.
// Depois de um 401/403 (token morto — o env legado tem 55 dias e o token do ML dura
// 6h), a rota oficial fica de castigo por 10 min: cada tentativa custava 4s de timeout
// em TODA busca fria (caso real 19/08) para um erro garantido.
let officialAuthFailedAt = 0;

async function searchMercadoLivreOfficial(query: string, limit: number): Promise<MlCatalogItem[]> {
  if (Date.now() - officialAuthFailedAt < 10 * 60 * 1000) return [];
  const token = await getMercadoLivreAccessToken();
  if (!token) return [];
  try {
    const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(Math.max(limit * 4, 12)));
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "lia/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) {
      console.warn("[mercado-livre:official-search]", response.status);
      if (response.status === 401 || response.status === 403) officialAuthFailedAt = Date.now();
      return [];
    }
    const payload = (await response.json()) as OfficialMlSearchResponse;
    const catalog = withoutMedicine(
      (payload.results ?? []).flatMap((raw): MlCatalogItem[] => {
        if (!raw.id || !raw.title || !raw.price || !raw.permalink) return [];
        return [{
          sku: `ml-${raw.id}`,
          name: raw.title,
          brand: raw.seller?.nickname,
          unitPrice: raw.price,
          imageUrl: mlImageAsJpg(raw.thumbnail),
          productUrl: raw.permalink,
          ...(raw.shipping?.free_shipping ? { freeShipping: true } : {}),
          mlPosition: 999
        }];
      })
    );
    return rankMercadoLivre(query, catalog, limit);
  } catch (error) {
    console.warn("[mercado-livre:official-search:error]", error instanceof Error ? error.message : error);
    return [];
  }
}

// Buscas frias IDÊNTICAS em voo compartilham UM run do actor (o prefetch dispara a
// mesma query que a busca real vai pedir segundos depois; sem isto seriam dois runs
// pagos e o segundo ainda esperaria do zero).
const inflight = new Map<string, Promise<MlCatalogItem[]>>();

// Começa a busca fria AGORA, sem esperar o resultado. O chamador segue o fluxo (IA,
// vitrines locais) e quando `searchItems` rodar de verdade, o run já está no meio do
// caminho — a espera percebida cai da soma (IA + ML) para o máximo dos dois.
export function prefetchMercadoLivre(query: string): void {
  void searchMercadoLivre(query, 4).catch(() => {});
}

// Busca ao vivo no ML (com cache). NUNCA lança: qualquer falha vira lista vazia e o
// fluxo segue exatamente como se o ML não existisse.
export async function searchMercadoLivre(query: string, limit = 4): Promise<MlCatalogItem[]> {
  if (!mercadoLivreEnabled()) return [];
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return [];
  // v2 (17/08): invalida o cache anterior — itens antigos carregavam "frete grátis" no
  // slot de prazo e anúncios internacionais que agora são descartados na entrada.
  const queryKey = `ml:v2:${normalized}`;

  const cached = await cachedItems(queryKey);
  if (cached) return rankMercadoLivre(query, cached, limit);

  const official = await searchMercadoLivreOfficial(query, limit);
  if (official.length) {
    await storeItems(queryKey, normalized, official);
    return official;
  }

  let run = inflight.get(queryKey);
  if (!run) {
    run = coldSearch(queryKey, normalized).finally(() => inflight.delete(queryKey));
    inflight.set(queryKey, run);
  }
  return rankMercadoLivre(query, await run, limit);
}

async function coldSearch(queryKey: string, normalized: string): Promise<MlCatalogItem[]> {
  try {
    const token = process.env.APIFY_API_TOKEN!;
    const items = await runApifyActor(
      ACTOR.replace("/", "~"),
      token,
      { keyword: normalized, search: normalized, query: normalized, maxItems: 24, scrapeOfertas: false },
      {
        maxWaitMs: Number(process.env.LIA_ML_MAX_WAIT_MS ?? 40000),
        // 4GB derruba o run de ~28,5s para ~21s (medido 17/08; 8GB só dá mais ~1s).
        // Actor pay-per-event: o compute extra é conta do desenvolvedor, não nossa.
        memoryMbytes: Number(process.env.LIA_ML_MEMORY_MB ?? 4096)
      }
    );
    if (!items?.length) return [];
    // GUARDA ANVISA: o ML vende medicamento — a vitrine ao vivo passa pelo mesmo filtro
    // de runtime das farmácias. Sem isto, uma busca por "dipirona" traria anúncio real
    // e a Lia venderia remédio (proibido; o produto recusa por lei desde o começo).
    const catalog = withoutMedicine(
      (items as unknown as ApifyMlItem[])
        .map(toCatalogItem)
        .filter((item): item is MlCatalogItem => Boolean(item))
    ).slice(0, 24);
    if (!catalog.length) return [];
    await storeItems(queryKey, normalized, catalog);
    return catalog;
  } catch (error) {
    console.warn("[ml:search:failed]", error instanceof Error ? error.message : error);
    return [];
  }
}

export const mercadoLivreStore: StoreConnector = {
  key: "mercadolivre",
  label: "Mercado Livre",
  // Sem mínimo: cada anúncio é um checkout próprio no ML.
  minOrder: Number(process.env.LIA_MERCADOLIVRE_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return searchMercadoLivre(query, limit);
  },
  // Vitrine ao vivo não tem catálogo estático — o /ops e os testes de roster leem daqui.
  listCatalog() {
    return [];
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string) {
    return `Pedido Mercado Livre nº ${orderNumber}: o operador compra no anúncio (link no /ops) com entrega no endereço do cliente; prazo é o do próprio anúncio.`;
  }
};
