// Cotação instantânea do concierge — decisão do dono (09/08): o cliente não espera no
// chat. Quando TODOS os itens da cesta têm preço de vitrine, a Lia publica a cotação na
// hora e o pedido chega ao /ops já pago; a espera fica onde não incomoda (compra/entrega).
//
// O frete é POR LOJA, da unidade mais próxima da loja até a casa do cliente — "se for 2
// lojas, 2 fretes" (dono). Aproximação de preço de motoboy: base + R$/km, ajustável por
// env SEM deploy. Sem distância real (loja sem coordenadas, geocode fora), vale a tarifa
// padrão. Distância acima do teto = volta pro operador cotar à mão (caso raro/longe).
//
// Linha livre (item sem preço) NUNCA entra aqui: não se cobra o que não tem preço.
import { getStore } from "@/lib/stores";
import { pickNearestUnit } from "@/lib/stores/nearest";

export type InstantQuoteItem = {
  qty: number;
  unitPrice: number;
  storeKey?: string;
  storeLabel?: string;
};

export type StoreFreight = {
  storeKey: string;
  storeLabel: string;
  km: number | null;
  fee: number;
};

export type InstantFreights = {
  freights: StoreFreight[];
  totalFee: number;
  maxKm: number | null;
};

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function freightForKm(km: number | null): number {
  if (km == null) return envNumber("LIA_FREIGHT_DEFAULT", 18);
  const base = envNumber("LIA_FREIGHT_BASE", 12);
  const perKm = envNumber("LIA_FREIGHT_PER_KM", 1.8);
  // Arredonda pra cima em reais inteiros: número limpo pro cliente, centavos a favor
  // da operação.
  return Math.ceil(base + perKm * km);
}

export function instantQuoteMaxKm(): number {
  return envNumber("LIA_INSTANT_QUOTE_MAX_KM", 30);
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

export async function computeStoreFreights(items: InstantQuoteItem[], cep: string): Promise<InstantFreights> {
  const stores = new Map<string, string>();
  for (const item of items) {
    if (item.storeKey) stores.set(item.storeKey, item.storeLabel ?? item.storeKey);
  }
  const freights: StoreFreight[] = [];
  let maxKm: number | null = null;
  for (const [storeKey, storeLabel] of stores) {
    const units = getStore(storeKey)?.listUnits() ?? [];
    let km: number | null = null;
    if (units.length) {
      try {
        km = (await pickNearestUnit(units, cep)).distanceKm;
      } catch {
        km = null;
      }
    }
    if (km != null) maxKm = Math.max(maxKm ?? 0, km);
    freights.push({ storeKey, storeLabel, km, fee: freightForKm(km) });
  }
  return {
    freights,
    totalFee: Math.round(freights.reduce((sum, f) => sum + f.fee, 0) * 100) / 100,
    maxKm
  };
}

// Linha humana do frete pra nota do /ops e pro texto da promessa: o operador (e o
// cliente, resumido) enxergam de onde saiu o número.
export function freightBreakdownLabel(freights: StoreFreight[]): string {
  return freights
    .map((f) => `${f.storeLabel} ${f.km != null ? `${f.km}km ` : ""}R$${f.fee.toFixed(2).replace(".", ",")}`)
    .join(" + ");
}
