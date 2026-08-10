// Frete AO VIVO por CEP — a consulta que o próprio site faz quando o cliente digita o
// CEP no checkout (VTEX orderForms/simulation), feita pela Lia no fechamento da lista
// com a CESTA REAL da loja e o CEP REAL do cliente. É o nível final de precisão pedido
// pelo dono (10/08): frete exato por endereço, frete grátis aplicado pelo próprio site.
//
// Regras de projeto ("faz direito, e sem demorar"):
//   - Só lojas com checkout VTEX aberto (validado por fora em 10/08). Carrefour e Petz
//     bloqueiam consulta externa e ficam na tabela por política.
//   - Todas as consultas correm EM PARALELO com timeout curto (LIA_LIVE_FREIGHT_TIMEOUT_MS,
//     2500ms) — o fechamento nunca espera mais que um timeout, aconteça o que acontecer.
//   - A cesta simulada tem que ser EXATAMENTE a cesta da loja (frete grátis depende do
//     total); item com sku fora do padrão → desiste da consulta daquela loja (tabela).
//   - Resposta válida SEM opção de entrega = o site não entrega naquele CEP → quem chama
//     deve cair para a cotação manual do operador (não se cobra entrega que não existe).
//   - Qualquer erro/timeout → null → tabela. Nunca lança; nunca segura o cliente.
export type LiveFreightOutcome =
  | { kind: "ok"; fee: number; estimate?: string }
  | { kind: "no-delivery" }
  | { kind: "unavailable" };

const VTEX_LIVE: Record<string, { domain: string; sku: RegExp }> = {
  paguemenos: { domain: "www.paguemenos.com.br", sku: /^paguemenos-(\d+)$/ },
  drogariasp: { domain: "www.drogariasaopaulo.com.br", sku: /^dsp-(\d+)$/ },
  cobasi: { domain: "www.cobasi.com.br", sku: /^cobasi-(\d+)$/ },
  oba: { domain: "secure.obahortifruti.com.br", sku: /^oba-(\d+)$/ },
  swift: { domain: "loja.swift.com.br", sku: /^swift-(\d+)$/ },
  divvino: { domain: "www.divvino.com.br", sku: /^divvino-(\d+)$/ },
  kopenhagen: { domain: "www.kopenhagen.com.br", sku: /^kopenhagen-(\d+)$/ },
  rihappy: { domain: "www.rihappy.com.br", sku: /^rihappy-(\d+)$/ }
};

export function liveFreightEnabled(): boolean {
  return process.env.LIA_LIVE_FREIGHT_OFF !== "true";
}

function timeoutMs(): number {
  const value = Number(process.env.LIA_LIVE_FREIGHT_TIMEOUT_MS);
  // 4500ms: conexão FRIA a esses sites leva ~3s (TLS + VTEX); medido em 10/08 que 2500
  // cortava a primeira consulta e 6000 passava todas. As lojas rodam em paralelo, então
  // este valor é também o TETO de espera extra do fechamento, aconteça o que acontecer.
  return Number.isFinite(value) && value >= 500 ? value : 4500;
}

// Teto de sanidade: acima disso o número é suspeito (ou é transportadora de outro
// estado) — melhor o operador olhar do que cobrar automático.
function maxLiveFee(): number {
  const value = Number(process.env.LIA_LIVE_FREIGHT_MAX);
  return Number.isFinite(value) && value > 0 ? value : 150;
}

type Sla = { name?: string; price?: number; shippingEstimate?: string; pickupStoreInfo?: { isPickupStore?: boolean } };

export async function liveStoreFreight(
  storeKey: string,
  items: { sku: string; qty: number }[],
  cep: string
): Promise<LiveFreightOutcome> {
  const store = VTEX_LIVE[storeKey];
  if (!liveFreightEnabled() || !store || !items.length) return { kind: "unavailable" };

  const simItems: { id: string; quantity: number; seller: string }[] = [];
  for (const item of items) {
    const m = store.sku.exec(item.sku);
    // Cesta parcial simularia frete errado (o grátis depende do total) — desiste.
    if (!m) return { kind: "unavailable" };
    simItems.push({ id: m[1], quantity: Math.max(1, item.qty), seller: "1" });
  }

  try {
    const response = await fetch(`https://${store.domain}/api/checkout/pub/orderForms/simulation?sc=1`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
      },
      body: JSON.stringify({ items: simItems, postalCode: cep.replace(/\D/g, ""), country: "BRA" }),
      signal: AbortSignal.timeout(timeoutMs())
    });
    if (!response.ok) return { kind: "unavailable" };
    const payload = (await response.json()) as { items?: unknown[]; logisticsInfo?: { slas?: Sla[] }[] };
    if (!Array.isArray(payload.items) || !payload.items.length) return { kind: "unavailable" };

    const deliveries = (payload.logisticsInfo ?? [])
      .flatMap((li) => li.slas ?? [])
      .filter((sla) => !sla.pickupStoreInfo?.isPickupStore && !/retir/i.test(sla.name ?? ""));
    if (!deliveries.length) return { kind: "no-delivery" };

    const cheapest = deliveries.reduce((best, sla) => ((sla.price ?? Infinity) < (best.price ?? Infinity) ? sla : best));
    const fee = Math.round(((cheapest.price ?? 0) / 100) * 100) / 100;
    if (!Number.isFinite(fee) || fee < 0 || fee > maxLiveFee()) return { kind: "unavailable" };
    return { kind: "ok", fee, estimate: cheapest.shippingEstimate };
  } catch {
    return { kind: "unavailable" };
  }
}
