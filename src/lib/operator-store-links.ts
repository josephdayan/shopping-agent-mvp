type OperatorBasketItem = { name: string; storeKey?: string; productUrl?: string };

const STORE_DOMAINS: Record<string, string> = {
  boticario: "boticario.com.br",
  cacaushow: "cacaushow.com.br",
  carrefour: "mercado.carrefour.com.br",
  cobasi: "cobasi.com.br",
  decathlon: "decathlon.com.br",
  divvino: "divvino.com.br",
  drogaraia: "drogaraia.com.br",
  drogariasp: "drogariasaopaulo.com.br",
  giulianaflores: "giulianaflores.com.br",
  imigrantes: "imigrantesbebidas.com.br",
  kalunga: "kalunga.com.br",
  kopenhagen: "kopenhagen.com.br",
  mercadolivre: "mercadolivre.com.br",
  naturaldaterra: "naturaldaterra.com.br",
  oba: "obahortifruti.com.br",
  paguemenos: "paguemenos.com.br",
  petz: "petz.com.br",
  rihappy: "rihappy.com.br",
  swift: "swift.com.br",
};

// Deep-link sempre vence. Nos raros itens de catálogo sem URL, Petz e Carrefour têm
// busca interna comprovada; as demais lojas caem numa busca restrita ao domínio certo.
// Assim uma compra da Cobasi/Swift/Kalunga nunca abre o Oba por engano.
export function operatorStoreItemUrl(item: OperatorBasketItem, orderStoreKey?: string | null): string {
  if (item.productUrl) return item.productUrl;
  const storeKey = item.storeKey ?? orderStoreKey ?? "";
  if (storeKey === "petz") return `https://www.petz.com.br/busca?q=${encodeURIComponent(item.name)}`;
  if (storeKey === "carrefour") return `https://mercado.carrefour.com.br/s?q=${encodeURIComponent(item.name)}`;
  if (storeKey === "boticario") return `https://www.boticario.com.br/busca/?q=${encodeURIComponent(item.name)}`;
  const domain = STORE_DOMAINS[storeKey];
  const query = domain ? `site:${domain} ${item.name}` : item.name;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
