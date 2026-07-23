import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";

// Kalunga — papelaria e escritório. Vitrine de referência colhida de kalunga.com.br em
// 2026-07-23 (páginas de busca reais, 2 URLs conferidas na página do produto). Preços
// promocionais "Por" vigentes no dia; o operador confirma o valor real na cotação.
const CATALOG: CatalogItem[] = [
  { sku: "kal-caderno-160f", name: "Caderno Universitário Capa Dura 10x160 Folhas Brief Preto Spiral", brand: "Spiral", unitPrice: 27.7, unit: "un", category: "papelaria caderno universitario", imageUrl: "https://img.kalunga.com.br/fotosdeprodutos/136662d.jpg", productUrl: "https://www.kalunga.com.br/prod/caderno-universitario-capa-dura-10-x-160-folhas-brief-preto-spiral-pt-1-un/136662" },
  { sku: "kal-caderno-80f", name: "Caderno Universitário Capa Dura 1x1 80 Folhas Brief Preto Spiral", brand: "Spiral", unitPrice: 17.1, unit: "un", category: "papelaria caderno universitario", productUrl: "https://www.kalunga.com.br/prod/caderno-universitario-capa-dura-1x1-80-folhas-brief-preto-spiral-pt-1-un/139101" },
  { sku: "kal-sulfite-chamex", name: "Papel Sulfite A4 75g Chamex 500 Folhas", brand: "Chamex", unitPrice: 34.5, unit: "un", category: "papelaria papel sulfite a4", imageUrl: "https://img.kalunga.com.br/fotosdeprodutos/476102d.jpg", productUrl: "https://www.kalunga.com.br/prod/papel-sulfite-a4-75g-210mmx297mm-chamex-pt-500-fl/476102" },
  { sku: "kal-sulfite-hp", name: "Papel Sulfite A4 75g HP Office 500 Folhas", brand: "HP", unitPrice: 32.9, unit: "un", category: "papelaria papel sulfite a4", productUrl: "https://www.kalunga.com.br/prod/papel-sulfite-a4-75g-210mmx297mm-hp-office-pt-500-fl/475808" },
  { sku: "kal-bic-azul-4", name: "Caneta Esferográfica BIC Cristal Média Azul (leve 4 pague 3)", brand: "BIC", unitPrice: 5.9, unit: "un", category: "papelaria caneta bic azul", productUrl: "https://www.kalunga.com.br/prod/caneta-esferografica-bic-escrita-media-cristal-dura-mais-azul-leve-4-pague-3-bt-4-un/176022" },
  { sku: "kal-bic-3cores", name: "Caneta Esferográfica BIC Cristal Fina 3 Cores", brand: "BIC", unitPrice: 6.6, unit: "un", category: "papelaria caneta bic", productUrl: "https://www.kalunga.com.br/prod/caneta-esferografica-bic-escrita-fina-cristal-3-cores-azul-preta-e-vermelha-bic-bt-3-un/176256" },
  { sku: "kal-lapis-bic-12", name: "Lápis Preto BIC Evolution HB2 Caixa 12 un", brand: "BIC", unitPrice: 12.6, unit: "un", category: "papelaria lapis preto", productUrl: "https://www.kalunga.com.br/prod/lapis-preto-bic-evolution-corpo-verde-hexagonal-grafite-hb2-aponta-facil-835232-cx-12-un/414403" },
  { sku: "kal-ecolapis-14", name: "Lápis Grafite EcoLápis n.2 Faber-Castell Caixa 14 un", brand: "Faber-Castell", unitPrice: 12.2, unit: "un", category: "papelaria lapis grafite", productUrl: "https://www.kalunga.com.br/prod/lapis-grafite-redondo-ecolapis-n-2-embalagem-com-14-ecolapis-12-2-faber-castell-cx-14-un/410686" },
  { sku: "kal-postit-100f", name: "Bloco Adesivo Post-it Amarelo 76x102mm 100 Folhas", brand: "Post-it", unitPrice: 15.3, unit: "un", category: "escritorio post-it bloco adesivo", productUrl: "https://www.kalunga.com.br/prod/bloco-adesivo-post-it-amarelo-76mm-x-102mm-100-folhas-pt-1-un/040743" },
  { sku: "kal-postit-4x100", name: "Bloco Adesivo Post-it Amarelo 38x50mm 4 Blocos", brand: "Post-it", unitPrice: 18.1, unit: "un", category: "escritorio post-it bloco adesivo", productUrl: "https://www.kalunga.com.br/prod/bloco-adesivo-post-it-amarelo-4-bloco-de-38mm-x-50mm-100-folhas-pt-4-un/040725" },
  { sku: "kal-grampeador-20f", name: "Grampeador Spiral 24/6 e 26/6 até 20 Folhas Preto", brand: "Spiral", unitPrice: 29.9, unit: "un", category: "escritorio grampeador", productUrl: "https://www.kalunga.com.br/prod/grampeador-24-6-e-26-6-para-ate-20-folhas-preto-2933a-spiral-cx-1-un/371894" },
  { sku: "kal-grampeador-mini", name: "Grampeador Mini Spiral 24/6 e 26/6 até 12 Folhas", brand: "Spiral", unitPrice: 9.9, unit: "un", category: "escritorio grampeador mini", productUrl: "https://www.kalunga.com.br/prod/grampeador-mini-24-6-e-26-6-para-ate-12-folhas-preto-e-cinza-2929a-spiral-cx-1-un/371901" },
  { sku: "kal-hp664", name: "Cartucho de Tinta HP 664 Preto Original", brand: "HP", unitPrice: 83.8, unit: "un", category: "informatica cartucho tinta hp", productUrl: "https://www.kalunga.com.br/prod/cartucho-de-tinta-hp-664-preto-original-f6v29ab-para-hp-deskjet-ink-advantage-4535-4675-3835-1115-2135-3635-2675-3775-3785-3787-3789-hp-cx-1-un/798476" },
  { sku: "kal-hp667", name: "Cartucho de Tinta HP 667 Preto Original", brand: "HP", unitPrice: 83.9, unit: "un", category: "informatica cartucho tinta hp", productUrl: "https://www.kalunga.com.br/prod/cartucho-de-tinta-hp-667-preto-original-3ym79ab-para-hp-deskjet-ink-advantage-2376-2776-6476-2874-hp-cx-1-un/798586" },
  { sku: "kal-mochila-spider", name: "Mochila com Rodas Spider-Man Xeryus", brand: "Xeryus", unitPrice: 231.92, unit: "un", category: "papelaria mochila escolar", productUrl: "https://www.kalunga.com.br/prod/mochila-com-rodas-em-poliester-spider-man-13370-xeryus-pt-1-un/480516" }
];

export const kalungaStore: StoreConnector = {
  key: "kalunga",
  label: "Kalunga",
  minOrder: Number(process.env.LIA_KALUNGA_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return rankCatalog(query, CATALOG, limit);
  },
  listCatalog() {
    return CATALOG;
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string) {
    return `Pedido Kalunga nº ${orderNumber}: fulfillment é do concierge (operador compra e entrega); sem retirada por courier no balcão.`;
  }
};
