// Preparação de checkout por loja. Habilitar uma loja NÃO autoriza envio de pagamento.
// Apenas domínios de produto já usados pelos conectores do projeto.
export const PURCHASE_DOMAINS: Record<string, string> = {
  mercadolivre: "mercadolivre.com.br", paguemenos: "paguemenos.com.br",
  drogariasp: "drogariasaopaulo.com.br", cobasi: "cobasi.com.br", oba: "obahortifruti.com.br",
  swift: "swift.com.br", divvino: "divvino.com.br", kopenhagen: "kopenhagen.com.br",
  rihappy: "rihappy.com.br", naturaldaterra: "naturaldaterra.com.br"
};

export function preparationStores(): string[] {
  return [...new Set((process.env.LIA_PURCHASE_PREP_STORES ?? "mercadolivre").split(",").map(s => s.trim()).filter(s => Boolean(PURCHASE_DOMAINS[s])))];
}
export function purchaseUrlAllowed(storeKey: string, value: string): boolean {
  const domain = PURCHASE_DOMAINS[storeKey];
  if (!domain) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) && url.pathname !== "/";
  } catch { return false; }
}
