import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";
import { withoutMedicine } from "./anvisa";

// Droga Raia — farmácia SEM MEDICAMENTO (higiene, bebê, dermocosmético, cabelo, solar).
// A Raia tem Akamai (como o Carrefour), então a API pública não é raspável em massa; este
// é um seed de dados REAIS colhidos das páginas de produto em 2026-07-23 (nome/preço/URL
// verbatim). No concierge o operador compra o resto. NUNCA vender remédio/vitamina (ANVISA).
const CATALOG: CatalogItem[] = [
  { sku: "raia-pampers-g-98", name: "Fralda Pampers Confort Sec G 98 unidades", brand: "Pampers", unitPrice: 171.9, unit: "un", category: "bebe fralda", imageUrl: "https://product-data.raiadrogasil.io/images/18393122.webp", productUrl: "https://www.drogaraia.com.br/pampers-confort-sec-fralda-g-98-unidades.html" },
  { sku: "raia-pampers-m-70", name: "Fralda Pampers Confort Sec M 70 unidades", brand: "Pampers", unitPrice: 114.9, unit: "un", category: "bebe fralda", imageUrl: "https://product-data.raiadrogasil.io/images/17547651.webp", productUrl: "https://www.drogaraia.com.br/pampers-fralda-descartvel-confortsec-super-m-70-unidades.html" },
  { sku: "raia-huggies-lenco-48", name: "Lenço Umedecido Huggies Hipoalergênico Sem Álcool 48 unidades", brand: "Huggies", unitPrice: 13.9, unit: "un", category: "bebe lenco umedecido", imageUrl: "https://product-data.raiadrogasil.io/images/19705398.webp", productUrl: "https://www.drogaraia.com.br/huggies-lencos-umedecidos-supreme-care-caixa-com-48-unidades.html" },
  { sku: "raia-anthelios-70-200", name: "Protetor Solar Corporal FPS 70 La Roche-Posay Anthelios 200ml", brand: "La Roche-Posay", unitPrice: 159.9, unit: "un", category: "solar protetor corporal", imageUrl: "https://product-data.raiadrogasil.io/images/12998551.webp", productUrl: "https://www.drogaraia.com.br/la-roche-posay-anthelios-fps70-200ml.html" },
  { sku: "raia-anthelios-60-40", name: "Protetor Solar Facial FPS 60 La Roche-Posay Anthelios XL Clara 40g", brand: "La Roche-Posay", unitPrice: 119.5, unit: "un", category: "solar protetor facial", imageUrl: "https://product-data.raiadrogasil.io/images/15412301.webp", productUrl: "https://www.drogaraia.com.br/anthelios-xl-fps-60-protetor-solar-facial-la-roche-posay-clara-40g-1318347.html" },
  { sku: "raia-anasol-60-40", name: "Protetor Solar Facial Anasol Todo Santo Dia Antioleosidade FPS 60 40g", brand: "Anasol", unitPrice: 51.9, unit: "un", category: "solar protetor facial", productUrl: "https://www.drogaraia.com.br/anasol-todo-santo-dia-protetor-solar-facial-antioleosidade-fps60-40g-1392564.html" },
  { sku: "raia-elseve-hialuronico-400", name: "Shampoo L'Oréal Elseve Hidra Hialurônico 400ml", brand: "L'Oréal", unitPrice: 33.9, unit: "un", category: "cabelo shampoo", imageUrl: "https://product-data.raiadrogasil.io/images/3560605.webp", productUrl: "https://www.drogaraia.com.br/elseveshampoo-preenchedor-hidra-hialuronco-400ml.html" },
  { sku: "raia-elseve-kit-oleo", name: "Kit L'Oréal Elseve Óleo Extraordinário Shampoo 375ml + Condicionador 170ml", brand: "L'Oréal", unitPrice: 35.9, unit: "un", category: "cabelo shampoo condicionador kit", productUrl: "https://www.drogaraia.com.br/elseve-kit-oleo-extraordinario-shampoo-375ml-condicionador-170ml.html" },
  { sku: "raia-nivea-creme-145", name: "Creme Hidratante Nivea Lata 145g", brand: "Nivea", unitPrice: 45.04, unit: "un", category: "dermocosmetico hidratante", imageUrl: "https://product-data.raiadrogasil.io/images/12739293.webp", productUrl: "https://www.drogaraia.com.br/hidratante-nivea-creme.html" },
  { sku: "raia-nivea-facial-100", name: "Creme Nutritivo Hidratante Facial Nivea 100g", brand: "Nivea", unitPrice: 35.99, unit: "un", category: "dermocosmetico hidratante facial", imageUrl: "https://product-data.raiadrogasil.io/images/13764938.webp", productUrl: "https://www.drogaraia.com.br/creme-nutritivo-hidratante-facial-nivea-100g-1251280.html" },
  { sku: "raia-colgate-total-90", name: "Creme Dental Colgate Total Prevenção Ativa Fresh Mint 90g", brand: "Colgate", unitPrice: 12.59, unit: "un", category: "higiene creme dental", imageUrl: "https://product-data.raiadrogasil.io/images/19166732.webp", productUrl: "https://www.drogaraia.com.br/colgate-creme-dental-total-12-advanced-fresh-gel-90g.html" },
  { sku: "raia-colgate-tripla-90", name: "Creme Dental Colgate Tripla Ação Menta Original 90g", brand: "Colgate", unitPrice: 5.59, unit: "un", category: "higiene creme dental", imageUrl: "https://product-data.raiadrogasil.io/images/9776539.webp", productUrl: "https://www.drogaraia.com.br/colgate-creme-dental-tripla-acao-90-g.html" },
  { sku: "raia-rexona-clinical-150", name: "Desodorante Aerosol Rexona Clinical Classic Feminino 150ml", brand: "Rexona", unitPrice: 17.98, unit: "un", category: "higiene desodorante", imageUrl: "https://product-data.raiadrogasil.io/images/19192931.webp", productUrl: "https://www.drogaraia.com.br/rexona-clinical-antitranspirante-aerosol-classic-96h-150ml.html" }
];

// Mesma terceira guarda das outras farmácias: o seed é curado à mão, mas o filtro de runtime
// impede que uma edição futura reintroduza medicamento sem passar pelo teste.
const ITEMS = withoutMedicine(CATALOG);

export const drogaRaiaStore: StoreConnector = {
  key: "drogaraia",
  label: "Droga Raia",
  minOrder: Number(process.env.LIA_DROGARAIA_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return rankCatalog(query, ITEMS, limit);
  },
  listCatalog() {
    return ITEMS;
  },
  listUnits(): StoreUnit[] {
    return [];
  },
  pickupInstructions(orderNumber: string) {
    return `Pedido Droga Raia nº ${orderNumber}: SEM medicamento (ANVISA). Fulfillment do concierge; sem retirada por courier no balcão.`;
  }
};
