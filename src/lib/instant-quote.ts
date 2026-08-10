// Cotação instantânea do concierge — decisão do dono (09/08): o cliente não espera no
// chat. Quando TODOS os itens da cesta têm preço de vitrine, a Lia publica a cotação na
// hora e o pedido chega ao /ops já pago; a espera fica onde não incomoda (compra/entrega).
//
// A entrega é PELO SITE da própria loja (correção do dono, 09/08: "não é via Uber, é via
// site" — o operador compra no site do varejista e a loja entrega). Logo o frete é POR
// LOJA — "2 lojas = 2 fretes" — e o número certo é o que o SITE daquela loja cobra:
//   1. Política da loja: env `LIA_STORE_FREIGHT_<LOJA>` (ex.: LIA_STORE_FREIGHT_CARREFOUR)
//      com limiar de frete grátis `LIA_STORE_FREE_ABOVE_<LOJA>` sobre o subtotal daquela
//      loja (o site olha o carrinho DELE, então o limiar compara o custo de site, sem
//      markup). Valores calibrados pelo operador com o que os sites cobram de verdade;
//      mudam por env, sem deploy.
//   2. Sem política configurada: tarifa padrão `LIA_FREIGHT_DEFAULT`.
//
// Linha livre (item sem preço) NUNCA entra aqui: não se cobra o que não tem preço.
export type InstantQuoteItem = {
  qty: number;
  unitPrice: number;
  storeKey?: string;
  storeLabel?: string;
};

export type StoreFreight = {
  storeKey: string;
  storeLabel: string;
  subtotal: number;
  fee: number;
  // De onde saiu o número — política configurada da loja ("loja", incluindo frete
  // grátis por limiar) ou tarifa padrão ("padrao"). Vai pra nota do /ops.
  source: "loja" | "padrao";
};

export type InstantFreights = {
  freights: StoreFreight[];
  totalFee: number;
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function envKey(storeKey: string): string {
  return storeKey.replace(/[^a-z0-9]/gi, "_").toUpperCase();
}

export function instantQuoteEnabled(): boolean {
  return process.env.LIA_INSTANT_QUOTE !== "false";
}

// Elegível = cesta não-vazia onde TODO item veio da vitrine com preço real. O storeKey
// "concierge" marca linha livre (sem preço) e derruba a elegibilidade.
export function instantQuoteEligible(items: InstantQuoteItem[], conciergeStoreKey: string): boolean {
  if (!instantQuoteEnabled() || !items.length) return false;
  return items.every((item) => item.unitPrice > 0 && item.storeKey && item.storeKey !== conciergeStoreKey);
}

// Políticas de frete PESQUISADAS dos sites (SP capital, CEP 01310-100, 10/08/2026) —
// semente em código para a cotação nascer precisa. Env sobrepõe campo a campo sem
// deploy (LIA_STORE_FREIGHT_<LOJA> / LIA_STORE_FREE_ABOVE_<LOJA>). freeAbove compara
// com o subtotal de CUSTO daquela loja (é o carrinho que o site enxerga).
//
// Fonte A = simulação REAL no checkout (VTEX orderForms/simulation): fee exato da
// entrega padrão; freeAbove = MENOR carrinho observado com frete zerado (conservador —
// nunca cobra a menos; o site pode zerar um pouco antes, e a diferença vira margem).
// Fonte B = política publicada no site (fee com "ESTIMADO" precisa de conferência).
export const SEED_STORE_FREIGHT: Record<string, { fee: number; freeAbove?: number }> = {
  // — Fonte A: simulação real —
  paguemenos: { fee: 4.9, freeAbove: 174 }, // Econômica 1d útil · pago a R$115,60, grátis a R$173,40 (política provável: R$149)
  drogariasp: { fee: 6.9, freeAbove: 240 }, // NORMAL 1d útil · pago a R$147,95, grátis a R$239,58 (provável: R$199)
  cobasi: { fee: 7.9, freeAbove: 234 }, // Econômica 1d útil · pago a R$175,50, grátis a R$234 (provável: R$199)
  oba: { fee: 9.9 }, // Convencional no MESMO dia · sem frete grátis observado até R$97
  swift: { fee: 15.9, freeAbove: 400 }, // 1d útil · pago a R$299,40, grátis a R$399,20 (provável: R$349–399)
  divvino: { fee: 15.9, freeAbove: 600 }, // NORMAL 5d úteis · pago a R$479,60, grátis a R$599,50
  kopenhagen: { fee: 15.9, freeAbove: 118 }, // RÁPIDA 1d útil · pago a R$98, grátis a R$117,60 (provável: R$99)
  rihappy: { fee: 18, freeAbove: 420 }, // até 2 dias · pago a R$342,93, grátis a R$419,97 (provável: R$399)
  // — Fonte B: política publicada (fee ESTIMADO — o site só mostra no checkout) —
  carrefour: { fee: 14.9, freeAbove: 349 }, // mercado: mínimo R$30, grátis > R$349 (FAQ oficial); fee varia por CEP/agenda
  petz: { fee: 9.9, freeAbove: 119 }, // grátis SP capital > R$119,01 (política oficial); fee típico VTEX pet
  boticario: { fee: 14.9, freeAbove: 229 } // grátis site R$199–229 (conservador: 229); fee varia por CEP
  // imigrantes (frete dinâmico por distância), naturaldaterra, kalunga, decathlon,
  // cacaushow, giulianaflores, drogaraia: sem dado confiável → tarifa padrão até
  // calibrar por env.
};

// Frete de UMA loja segundo a política do site dela: env → semente pesquisada → tarifa
// padrão. Zerado quando o subtotal (custo de site) passa do limiar de frete grátis.
export function storeFreight(storeKey: string, storeLabel: string, subtotal: number): StoreFreight {
  const key = envKey(storeKey);
  const configured = process.env[`LIA_STORE_FREIGHT_${key}`];
  const envFee = Number(configured);
  const seed = SEED_STORE_FREIGHT[storeKey];
  const hasEnvFee = configured !== undefined && Number.isFinite(envFee) && envFee >= 0;
  if (hasEnvFee || seed) {
    const fee = hasEnvFee ? envFee : seed!.fee;
    const envFreeAbove = Number(process.env[`LIA_STORE_FREE_ABOVE_${key}`]);
    const freeAbove = Number.isFinite(envFreeAbove) && envFreeAbove > 0 ? envFreeAbove : seed?.freeAbove;
    const free = freeAbove != null && freeAbove > 0 && subtotal >= freeAbove;
    return { storeKey, storeLabel, subtotal, fee: free ? 0 : Math.round(fee * 100) / 100, source: "loja" };
  }
  return { storeKey, storeLabel, subtotal, fee: envNumber("LIA_FREIGHT_DEFAULT", 18), source: "padrao" };
}

export function computeStoreFreights(items: InstantQuoteItem[]): InstantFreights {
  const stores = new Map<string, { label: string; subtotal: number }>();
  for (const item of items) {
    if (!item.storeKey) continue;
    const entry = stores.get(item.storeKey) ?? { label: item.storeLabel ?? item.storeKey, subtotal: 0 };
    entry.subtotal += item.unitPrice * item.qty;
    stores.set(item.storeKey, entry);
  }
  const freights: StoreFreight[] = [];
  for (const [storeKey, { label, subtotal }] of stores) {
    freights.push(storeFreight(storeKey, label, Math.round(subtotal * 100) / 100));
  }
  return {
    freights,
    totalFee: Math.round(freights.reduce((sum, f) => sum + f.fee, 0) * 100) / 100
  };
}

// Linha humana do frete pra nota do /ops: o operador enxerga de onde saiu cada número
// ("padrão" grita que falta calibrar a política daquela loja).
export function freightBreakdownLabel(freights: StoreFreight[]): string {
  return freights
    .map((f) => {
      const valor = f.fee === 0 ? "grátis" : `R$${f.fee.toFixed(2).replace(".", ",")}`;
      return `${f.storeLabel} ${valor}${f.source === "padrao" ? " (tarifa padrão)" : ""}`;
    })
    .join(" + ");
}
