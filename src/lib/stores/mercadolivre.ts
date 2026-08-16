import { prisma } from "@/lib/prisma";
import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";
import { runApifyActor } from "@/lib/adapters/suppliers";
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
export function deliveryLabelFrom(envio: string | undefined): string | undefined {
  const raw = (envio ?? "").trim();
  if (!raw) return undefined;
  const n = raw.toLowerCase();
  if (n.includes("hoje")) return "chega hoje";
  if (n.includes("amanha") || n.includes("amanhã")) return "chega amanhã";
  const days = n.match(/(\d+)\s*dias?/)?.[1];
  if (days) return `chega em ${days} dias`;
  if (n.includes("gratis") || n.includes("grátis")) return "frete grátis";
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
  envio?: string;
  idPublicacao?: string;
  SKU?: string;
};

// "18,68" → 18.68. Preço quebrado ou zero é anúncio inválido pra nós (o operador não
// consegue comprar por um preço que não existe) — vira null e o item é descartado.
function parsePrice(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const raw = (value ?? "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toCatalogItem(raw: ApifyMlItem): CatalogItem | null {
  const name = (raw.eTituloProduto ?? "").trim();
  const unitPrice = parsePrice(raw.novoPreco);
  const productUrl = (raw.zProdutoLink ?? "").trim();
  if (!name || unitPrice == null || !productUrl) return null;
  // Anúncio patrocinado é publicidade, não a melhor opção — fica de fora.
  if ((raw.patrocinado ?? "").trim()) return null;
  if (raw.is_inStock === false) return null;
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
    imageUrl: (raw.imagemLink ?? "").trim() || undefined,
    productUrl
  };
}

async function cachedItems(queryKey: string): Promise<CatalogItem[] | null> {
  try {
    const row = await prisma.searchCache.findUnique({ where: { queryKey } });
    if (!row) return null;
    if (Date.now() - new Date(row.updatedAt).getTime() > CACHE_TTL_MS) return null;
    return row.items as unknown as CatalogItem[];
  } catch (error) {
    console.warn("[ml:cache:read-failed]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function storeItems(queryKey: string, query: string, items: CatalogItem[]) {
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

// Busca ao vivo no ML (com cache). NUNCA lança: qualquer falha vira lista vazia e o
// fluxo segue exatamente como se o ML não existisse.
export async function searchMercadoLivre(query: string, limit = 4): Promise<CatalogItem[]> {
  if (!mercadoLivreEnabled()) return [];
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return [];
  const queryKey = `ml:${normalized}`;

  const cached = await cachedItems(queryKey);
  if (cached) return rankCatalog(query, cached, limit);

  try {
    const token = process.env.APIFY_API_TOKEN!;
    const items = await runApifyActor(
      ACTOR.replace("/", "~"),
      token,
      { keyword: normalized, search: normalized, query: normalized, maxItems: 24, scrapeOfertas: false },
      Number(process.env.LIA_ML_MAX_WAIT_MS ?? 40000)
    );
    if (!items?.length) return [];
    // GUARDA ANVISA: o ML vende medicamento — a vitrine ao vivo passa pelo mesmo filtro
    // de runtime das farmácias. Sem isto, uma busca por "dipirona" traria anúncio real
    // e a Lia venderia remédio (proibido; o produto recusa por lei desde o começo).
    const catalog = withoutMedicine(
      (items as unknown as ApifyMlItem[])
        .map(toCatalogItem)
        .filter((item): item is CatalogItem => Boolean(item))
    ).slice(0, 24);
    if (!catalog.length) return [];
    await storeItems(queryKey, normalized, catalog);
    return rankCatalog(query, catalog, limit);
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
