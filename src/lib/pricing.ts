// Markup PROGRESSIVO por faixa marginal do preço unitário (decisão do dono, 23/08):
// 10% até R$200, 6% de 200 a 500, 4% de 500 a 1000, 3% acima — como imposto de renda,
// marginal por construção: um item de R$201 nunca custa menos de margem que um de R$199.
// A 1ª faixa continua vindo de LIA_PRICE_MARKUP (1.1 = 10%), então o env antigo segue
// mandando na base; as faixas de cima vêm de LIA_MARKUP_TIERS
// ("200:0.06,500:0.04,1000:0.03" = acima de 200 cobra 6% naquela fatia, e assim por
// diante), tudo calibrável sem deploy.

type Tier = { above: number; rate: number };

function baseRate(): number {
  const markup = Number(process.env.LIA_PRICE_MARKUP ?? 1.1);
  return Number.isFinite(markup) && markup > 1 ? markup - 1 : 0.1;
}

const DEFAULT_TIERS: Tier[] = [
  { above: 200, rate: 0.06 },
  { above: 500, rate: 0.04 },
  { above: 1000, rate: 0.03 }
];

function tiers(): Tier[] {
  const raw = process.env.LIA_MARKUP_TIERS;
  if (!raw) return DEFAULT_TIERS;
  const parsed = raw
    .split(",")
    .map((part) => {
      const [above, rate] = part.split(":").map(Number);
      return { above, rate };
    })
    .filter((t) => Number.isFinite(t.above) && t.above > 0 && Number.isFinite(t.rate) && t.rate >= 0)
    .sort((a, b) => a.above - b.above);
  return parsed.length ? parsed : DEFAULT_TIERS;
}

// Margem em R$ sobre um preço, somando fatia a fatia.
export function markupAmount(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  let fee = 0;
  let floor = 0;
  let rate = baseRate();
  for (const tier of tiers()) {
    const slice = Math.min(price, tier.above) - floor;
    if (slice > 0) fee += slice * rate;
    if (price <= tier.above) return fee;
    floor = tier.above;
    rate = tier.rate;
  }
  fee += (price - floor) * rate;
  return fee;
}

// Preço EXIBIDO ao cliente (o único ponto de markup de todos os caminhos vivos).
export function displayPrice(price: number): number {
  return Math.round((price + markupAmount(price)) * 100) / 100;
}

// Margem de uma cesta COM itens: soma linha a linha (unidade com markup × qty) menos o
// custo real — é o serviceFee exato que bate com os preços que o cliente viu nos cards.
export function serviceFeeForItems(items: { unitPrice: number; qty: number }[]): number {
  const display = items.reduce((sum, i) => sum + Math.round(displayPrice(i.unitPrice) * i.qty * 100) / 100, 0);
  const real = items.reduce((sum, i) => sum + Math.round(i.unitPrice * i.qty * 100) / 100, 0);
  return Math.round((display - real) * 100) / 100;
}

// Margem quando só existe o SUBTOTAL (cotação manual do /ops, sem custo por item):
// as mesmas faixas, aplicadas ao subtotal inteiro.
export function serviceFeeForSubtotal(subtotal: number): number {
  return Math.round(markupAmount(subtotal) * 100) / 100;
}
