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

// Uma alternativa de entrega: quanto custa e quando chega. `isoDate` fica pra ordenar
// datas sem ambiguidade de virada de ano; `estimate` é o rótulo curto ("25/08").
export type MlFreightOption = { fee: number; estimate?: string; isoDate?: string };

export type MlFreightOutcome =
  // Frete real daquele anúncio pra aquele CEP (`fee` 0 = anúncio entrega grátis).
  // `faster` só existe quando o anúncio oferece uma opção que chega ANTES pagando MAIS —
  // é o trade-off que o cliente escolhe com botão (pedido do dono, 17/08).
  | { kind: "ok"; fee: number; estimate?: string; isoDate?: string; faster?: MlFreightOption }
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

// Opções que servem ao concierge: entrega no ENDEREÇO (ponto de retirada não serve — quem
// recebe é o cliente, em casa) e com custo numérico.
function homeDeliveryOptions(options: MlShippingOption[]): MlShippingOption[] {
  return options.filter(
    (option) =>
      typeof option.cost === "number" &&
      Number.isFinite(option.cost) &&
      option.cost >= 0 &&
      (option.shipping_option_type ?? "address") === "address"
  );
}

// "2026-08-20T00:00:00-03:00" → "2026-08-20" (ordenável como texto).
function isoDay(option: MlShippingOption): string | undefined {
  return option.estimated_delivery_time?.date?.slice(0, 10) || undefined;
}

// A opção padrão da cotação: a mais barata; empate no preço, a que chega antes.
function cheapest(options: MlShippingOption[]): MlShippingOption | null {
  if (!options.length) return null;
  return options.reduce((best, option) => {
    if (option.cost! !== best.cost!) return option.cost! < best.cost! ? option : best;
    const a = isoDay(option);
    const b = isoDay(best);
    if (a && b && a !== b) return a < b ? option : best;
    return best;
  });
}

// Classes de envio do ML: "slow" é o econômico (o grátis costuma ser slow); as demais
// são as expressas. É o sinal que sobrevive quando a consulta ANÔNIMA achata as datas.
const EXPRESS_CLASSES = new Set(["standard", "next_day", "same_day", "express"]);

// A alternativa "chega antes pagando mais". Regra 1 (dados completos): chega ANTES e
// custa MAIS. Regra 2 (caso QTNL2T, 23/08): a consulta anônima às vezes devolve a MESMA
// data pro grátis-lento e pro expresso pago — mas na compra real o expresso chega dias
// antes. Quando a base é grátis/lenta e existe classe expressa mais cara com data igual
// (nunca posterior), a escolha é oferecida SEM data no lado rápido (prometer data que a
// consulta não deu é proibido; a classe é do anúncio, o preço é real).
function fasterThan(options: MlShippingOption[], base: MlShippingOption): MlShippingOption | null {
  const baseDay = isoDay(base);
  if (baseDay) {
    const earlier = options.filter((option) => {
      const day = isoDay(option);
      return Boolean(day) && day! < baseDay && option.cost! > base.cost!;
    });
    if (earlier.length) {
      return earlier.reduce((best, option) => {
        const a = isoDay(option)!;
        const b = isoDay(best)!;
        if (a !== b) return a < b ? option : best;
        return option.cost! < best.cost! ? option : best;
      });
    }
  }
  // Regra 2: só a partir de base grátis ou lenta — expresso × expresso sem gap de data
  // não é escolha, é o mesmo serviço mais caro.
  const baseIsSlow = base.cost === 0 || (base.shipping_method_type ?? "") === "slow";
  if (!baseIsSlow) return null;
  const expressPaid = options.filter((option) => {
    if (!(option.cost! > base.cost!)) return false;
    if (!EXPRESS_CLASSES.has(option.shipping_method_type ?? "")) return false;
    const day = isoDay(option);
    // Data posterior à da base nunca é "mais rápido"; sem data ou empate, a classe decide.
    return !baseDay || !day || day <= baseDay;
  });
  if (!expressPaid.length) return null;
  const picked = expressPaid.reduce((best, option) => {
    const a = isoDay(option) ?? "9999";
    const b = isoDay(best) ?? "9999";
    if (a !== b) return a < b ? option : best;
    return option.cost! < best.cost! ? option : best;
  });
  // Sem gap de data comprovado, o lado rápido sai SEM promessa de data — o botão e a
  // copy já lidam com estimate ausente ("sem data publicada").
  return { ...picked, estimated_delivery_time: undefined };
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

    const home = homeDeliveryOptions(options);
    const chosen = cheapest(home);
    if (!chosen) return { kind: "no-delivery" };

    const fee = roundMoney(chosen.cost!);
    if (fee > maxFee()) {
      console.warn("[ml:freight:above-cap]", itemId, fee);
      return { kind: "unavailable" };
    }

    // A opção rápida também respeita o teto: acima dele não se oferece o que não se cobra.
    const quicker = fasterThan(home, chosen);
    const quickerFee = quicker ? roundMoney(quicker.cost!) : null;
    return {
      kind: "ok",
      fee,
      estimate: estimateLabel(chosen),
      isoDate: isoDay(chosen),
      ...(quicker && quickerFee != null && quickerFee <= maxFee()
        ? { faster: { fee: quickerFee, estimate: estimateLabel(quicker), isoDate: isoDay(quicker) } }
        : {})
    };
  } catch (error) {
    console.warn("[ml:freight:failed]", itemId, error instanceof Error ? error.message : error);
    return { kind: "unavailable" };
  }
}

export type MlFreightItem = { qty: number; productUrl?: string; freeShipping?: boolean };

export type MlBasketFreight =
  // Soma do frete de cada anúncio (no ML cada anúncio é um checkout próprio, então dois
  // anúncios = dois fretes) + a data mais distante, que é quando a cesta toda chega.
  // `faster` presente = existe escolha real pro cliente (chega antes, custa mais).
  | { kind: "ok"; fee: number; estimate?: string; faster?: MlFreightOption }
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
  const days: (string | undefined)[] = [];
  // Cesta na versão RÁPIDA: cada anúncio na opção que chega antes (quem não tem, fica na
  // dele). `hasChoice` evita oferecer "escolha" quando as duas versões são idênticas.
  let fastFee = 0;
  const fastDays: (string | undefined)[] = [];
  let hasChoice = false;
  let fastHasUnknownDate = false;

  for (const { item, itemId, outcome } of outcomes) {
    if (outcome.kind === "ok") {
      // Anúncio que ESTAMPA "Chegará grátis" nunca vira frete cobrado, mesmo quando a
      // consulta devolve um valor: a consulta é feita como comprador anônimo (nível 1) e
      // a conta do operador tem benefício de frete, então cobrar por cima do "grátis" que
      // o cliente vê no ML seria a taxa fantasma reprovada em 17/08. A diferença, se
      // existir, é conta nossa — é o mesmo risco já aceito quando a flag foi criada.
      // Cada unidade do MESMO anúncio vai na mesma remessa: o frete é por remessa, não por
      // unidade, então qty não multiplica.
      fee += item.freeShipping === true ? 0 : outcome.fee;
      // A data continua sendo a real daquele CEP (é o dado que o cliente quer).
      days.push(outcome.isoDate);
      // Versão rápida: paga a opção que chega antes NESTE anúncio, se houver. Aqui o
      // "grátis declarado" não isenta — o cliente está escolhendo pagar pra chegar antes.
      fastFee += outcome.faster ? outcome.faster.fee : item.freeShipping === true ? 0 : outcome.fee;
      if (outcome.faster) {
        // Rápida por CLASSE (sem gap de data comprovado) vem sem isoDate — e a cesta
        // rápida inteira fica SEM data: recair na data da barata prometeria o que a
        // consulta não deu (o furo do QTNL2T, 23/08).
        fastDays.push(outcome.faster.isoDate);
        if (!outcome.faster.isoDate) fastHasUnknownDate = true;
        hasChoice = true;
      } else {
        fastDays.push(outcome.isoDate);
      }
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
    estimate: latestLabel(days),
    ...(hasChoice
      ? {
          faster: {
            fee: roundMoney(fastFee),
            estimate: fastHasUnknownDate ? undefined : latestLabel(fastDays),
            isoDate: fastHasUnknownDate ? undefined : latestIso(fastDays)
          }
        }
      : {})
  };
}

// A data da cesta é a do item que chega POR ÚLTIMO (ordenação por ISO, sem confusão de
// virada de ano).
function latestIso(days: (string | undefined)[]): string | undefined {
  const known = days.filter((day): day is string => Boolean(day));
  return known.length ? known.sort().pop() : undefined;
}

// "2026-08-25" → "25/08".
function latestLabel(days: (string | undefined)[]): string | undefined {
  const iso = latestIso(days);
  if (!iso) return undefined;
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}
