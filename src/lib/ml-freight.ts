// Frete + prazo AO VIVO por ANÚNCIO do Mercado Livre (pedido do dono, 17/08: "pensa que
// eu tô comprando uma mochila, no app aparece 10,99 entrega até amanhã, grátis a partir
// de depois de amanhã — ele tem que saber isso direto").
//
// No ML o frete é do ANÚNCIO + do CEP, não da loja: não existe política de site pra
// tabelar (era o R$18 de tarifa padrão, que o dono reprovou). A fonte certa é a MESMA que
// o app do ML usa, e ela é PÚBLICA:
//
//   GET api.mercadolibre.com/items/<MLB...>/shipping_options?zip_code=<CEP>
//
// Verificado ao vivo em 17/08 SEM TOKEN NENHUM: HTTP 200 em ~0,35s (3 medidas: 0,43/0,36/
// 0,31), custo real por CEP e data por opção — Av. Paulista devolveu padrão R$14,99
// (chega 25/08) e Sedex R$25,99 (chega 20/08); o mesmo anúncio em Campinas devolveu
// R$14,99. Não confundir com o resto da API do ML, que exige app registrado: `/items/<id>`
// e `/products/<id>` respondem 403 PolicyAgent, `/sites/MLB/search` 403 — só
// `shipping_options` está aberto, e é justamente o número que faltava.
//
// Limite conhecido: o endpoint precisa do id do ANÚNCIO (listing). Link de CATÁLOGO
// (`/p/MLB...`, `/up/MLBU...`) carrega id de PRODUTO, e a rota pública que mapeia produto
// → anúncio é bloqueada (403). Sem id de anúncio, `mlItemIdFrom` devolve null e o pedido
// segue a regra conservadora de sempre: anúncio que declara frete grátis fecha na hora,
// o resto vai pra cotação do operador. Nunca se cobra frete chutado.

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type MlFreightOutcome =
  // Frete real daquele anúncio pra aquele CEP (`fee` 0 = anúncio entrega grátis).
  | { kind: "ok"; fee: number; estimate?: string }
  // O ML respondeu que não entrega nesse CEP, ou o anúncio está sem estoque: nos dois
  // casos não há número pra cobrar — quem chama manda pro operador.
  | { kind: "no-delivery" }
  // Não deu pra saber (timeout, id de catálogo, resposta estranha, teto de sanidade).
  | { kind: "unavailable" };

type MlShippingOption = {
  cost?: number;
  list_cost?: number;
  shipping_option_type?: string;
  shipping_method_type?: string;
  display?: string;
  estimated_delivery_time?: { date?: string; type?: string };
};

type MlShippingResponse = { options?: MlShippingOption[] };

export function mlFreightEnabled(): boolean {
  return process.env.LIA_ML_LIVE_FREIGHT_OFF !== "true";
}

function timeoutMs(): number {
  const value = Number(process.env.LIA_ML_FREIGHT_TIMEOUT_MS);
  // 3000ms: a medição real ficou em ~0,35s, então isto é folga de rede — e é o teto de
  // espera extra no fechamento da lista (as consultas correm em paralelo).
  return Number.isFinite(value) && value >= 500 ? value : 3000;
}

// Teto de sanidade, igual ao do frete VTEX ao vivo: acima disso é melhor o operador olhar
// do que cobrar automático.
function maxFee(): number {
  const value = Number(process.env.LIA_ML_FREIGHT_MAX);
  return Number.isFinite(value) && value > 0 ? value : 150;
}

// Id do ANÚNCIO a partir do link do próprio anúncio. O formato do link é quem diz o que
// ele é (não o número): `produto.mercadolivre.com.br/MLB-123456789-slug` é anúncio;
// `/p/MLB123` e `/up/MLBU123` são catálogo e só servem quando o link ainda carrega o
// anúncio vencedor em `wid`/`item_id` (é o que o ML põe nos links da busca).
export function mlItemIdFrom(item: { productUrl?: string }): string | null {
  const raw = (item.productUrl ?? "").trim();
  if (!raw) return null;

  // `wid=MLB123` / `item_id=MLB123` / `pdp_filters=item_id:MLB123` — vale até em link de
  // catálogo, porque aponta o anúncio vencedor.
  const winner = raw.match(/(?:wid|item_id)(?:=|%3A|:)(MLB-?\d{6,})/i)?.[1];
  if (winner) return winner.replace("-", "").toUpperCase();

  // Link direto de anúncio: /MLB-123456789-titulo
  const listing = raw.match(/\/(MLB-\d{6,})/i)?.[1];
  if (listing) return listing.replace("-", "").toUpperCase();

  return null;
}

// "2026-08-20T00:00:00-03:00" → "20/08". Data é o que o ML promete pra AQUELE CEP; nunca
// inventamos prazo (regra antiga do projeto).
function estimateLabel(option: MlShippingOption): string | undefined {
  const date = option.estimated_delivery_time?.date;
  const match = (date ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return `${match[3]}/${match[2]}`;
}

// Entre as opções, a que o OPERADOR vai escolher: entrega no endereço (não em ponto de
// retirada) e a mais barata. Cobrar a mais barata nunca cobra a menos do que o operador
// paga se ele subir pra uma opção mais rápida — essa diferença é decisão dele, não do
// cliente.
function cheapestHomeDelivery(options: MlShippingOption[]): MlShippingOption | null {
  const home = options.filter(
    (option) =>
      typeof option.cost === "number" &&
      Number.isFinite(option.cost) &&
      option.cost >= 0 &&
      // `address` = entrega no endereço. Ponto de retirada (`pickup`) não serve pro
      // concierge: quem recebe é o cliente, em casa.
      (option.shipping_option_type ?? "address") === "address"
  );
  if (!home.length) return null;
  return home.reduce((best, option) => (option.cost! < best.cost! ? option : best));
}

function normalizeCep(cep: string): string | null {
  const digits = (cep ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

// Consulta o frete real do anúncio. NUNCA lança: qualquer falha vira `unavailable` e quem
// chama cai na regra conservadora (operador cota à mão).
export async function mlItemFreight(itemId: string, cep: string): Promise<MlFreightOutcome> {
  if (!mlFreightEnabled()) return { kind: "unavailable" };
  const zip = normalizeCep(cep);
  if (!zip || !/^MLB\d{6,}$/i.test(itemId)) return { kind: "unavailable" };

  try {
    const url = `https://api.mercadolibre.com/items/${itemId.toUpperCase()}/shipping_options?zip_code=${zip}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs())
    });

    // 404 do endpoint é resposta de negócio, não erro de rede: anúncio sem estoque ou que
    // não atende o CEP ("stock out for all requested products"). Não há frete a cobrar.
    if (response.status === 404) return { kind: "no-delivery" };
    if (!response.ok) {
      console.warn("[ml:freight:http]", itemId, response.status);
      return { kind: "unavailable" };
    }

    const payload = (await response.json()) as MlShippingResponse;
    const options = Array.isArray(payload.options) ? payload.options : [];
    // Respondeu sem nenhuma opção = o ML não entrega nesse CEP.
    if (!options.length) return { kind: "no-delivery" };

    const chosen = cheapestHomeDelivery(options);
    if (!chosen) return { kind: "no-delivery" };

    const fee = roundMoney(chosen.cost!);
    if (fee > maxFee()) {
      console.warn("[ml:freight:above-cap]", itemId, fee);
      return { kind: "unavailable" };
    }
    return { kind: "ok", fee, estimate: estimateLabel(chosen) };
  } catch (error) {
    console.warn("[ml:freight:failed]", itemId, error instanceof Error ? error.message : error);
    return { kind: "unavailable" };
  }
}

export type MlFreightItem = { qty: number; productUrl?: string; freeShipping?: boolean };

export type MlBasketFreight =
  // Soma do frete de cada anúncio (no ML cada anúncio é um checkout próprio, então dois
  // anúncios = dois fretes) + a data mais distante, que é quando a cesta toda chega.
  | { kind: "ok"; fee: number; estimate?: string }
  | { kind: "manual"; reason: string };

// Frete da parte-ML da cesta. Exige sucesso em TODOS os anúncios: um item sem número
// derruba a cotação automática inteira (metade chutada seria o mesmo erro do R$18).
export async function mlBasketFreight(items: MlFreightItem[], cep: string): Promise<MlBasketFreight> {
  if (!items.length) return { kind: "manual", reason: "sem itens do Mercado Livre" };

  const outcomes = await Promise.all(
    items.map(async (item) => {
      const itemId = mlItemIdFrom(item);
      if (!itemId) return { item, itemId: null, outcome: { kind: "unavailable" } as MlFreightOutcome };
      return { item, itemId, outcome: await mlItemFreight(itemId, cep) };
    })
  );

  let fee = 0;
  const estimates: string[] = [];
  for (const { item, itemId, outcome } of outcomes) {
    if (outcome.kind === "ok") {
      // Cada unidade do MESMO anúncio costuma ir na mesma remessa — o frete do anúncio é
      // por remessa, não por unidade. Multiplicar por qty inflaria a cobrança.
      fee += outcome.fee;
      if (outcome.estimate) estimates.push(outcome.estimate);
      continue;
    }
    if (outcome.kind === "no-delivery") {
      return { kind: "manual", reason: `anúncio ${itemId ?? "sem id"} sem entrega/estoque pro CEP` };
    }
    // Sem número: o anúncio que DECLARA frete grátis ainda fecha na hora (regra de 17/08,
    // conservadora — grátis nunca cobra a menos). O resto vai pro operador.
    if (item.freeShipping === true) continue;
    return { kind: "manual", reason: itemId ? `frete do anúncio ${itemId} indisponível` : "link sem id de anúncio (catálogo)" };
  }

  return {
    kind: "ok",
    fee: roundMoney(fee),
    // A cesta chega quando o ÚLTIMO item chega.
    estimate: estimates.length ? estimates.sort((a, b) => mlDateOrder(a) - mlDateOrder(b)).pop() : undefined
  };
}

// "25/08" → 825 (mês*100+dia) só pra ordenar datas do mesmo ano-corrente.
function mlDateOrder(label: string): number {
  const [day, month] = label.split("/").map(Number);
  return (month ?? 0) * 100 + (day ?? 0);
}
