import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { rankCatalog } from "./types";

// Cacau Show — chocolates e presentes. Vitrine de referência colhida de
// cacaushow.com.br (Salesforce Commerce) em 2026-07-23; 3 produtos cross-checados na
// página e todas as URLs retornaram 200. Preço promocional "por" vigente no dia;
// disponibilidade é por loja — o operador confirma na cotação.
const CATALOG: CatalogItem[] = [
  { sku: "cac-bombons-240g", name: "Caixa de Bombons Sortidos 240g", brand: "Cacau Show", unitPrice: 69.99, unit: "un", category: "chocolate bombom caixa presente", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dwfba2ce18/large/1003111_1.png", productUrl: "https://www.cacaushow.com.br/produto/caixa-de-bombons-sortidos-240g-1003111.html" },
  { sku: "cac-minishow-108g", name: "Caixa de Bombons Mini Show laCreme ao Leite 108g", brand: "Cacau Show", unitPrice: 39.99, unit: "un", category: "chocolate bombom caixa", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw5dae967e/medium/1002628_1.png", productUrl: "https://www.cacaushow.com.br/produto/caixa-de-bombons-mini-show-lacreme-ao-leite-108g-1002628.html" },
  { sku: "cac-bendito-170g", name: "Caixa de Bombom Bendito Cacao 170g", brand: "Cacau Show", unitPrice: 59.99, unit: "un", category: "chocolate bombom caixa", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dwfff7922d/medium/1002485_1.png", productUrl: "https://www.cacaushow.com.br/produto/caixa-de-bombom-bendito-cacao-170g-1002485.html" },
  { sku: "cac-angel-185g", name: "Caixa de Bombons Angel Sortidos Porta-Joias 185g", brand: "Cacau Show", unitPrice: 74.99, unit: "un", category: "chocolate presente caixa porta-joias", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw49b34dcd/medium/1003530_1.png", productUrl: "https://www.cacaushow.com.br/produto/caixa-de-bombons-angel-sortidos-porta-joias-185g-1003530.html" },
  { sku: "cac-preciosidades-360g", name: "Bombons Preciosidades Sortidos 360g", brand: "Cacau Show", unitPrice: 69.99, unit: "un", category: "chocolate presente bombom", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw6fad5845/medium/1001474_1.png", productUrl: "https://www.cacaushow.com.br/produto/bombons-preciosidades-sortidos-360g-1001474.html" },
  { sku: "cac-trufa-leite-30g", name: "Trufa ao Leite Tradicional 30g", brand: "Cacau Show", unitPrice: 4.99, unit: "un", category: "chocolate trufa", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw0a5a2195/large/1002633_4.png", productUrl: "https://www.cacaushow.com.br/produto/trufa-ao-leite-tradicional-30g-1002633.html" },
  { sku: "cac-trufa-lacreme", name: "Trufa laCreme ao Leite 13,5g", brand: "Cacau Show", unitPrice: 3.49, unit: "un", category: "chocolate trufa", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dwcff5aee2/medium/1002193_1.png", productUrl: "https://www.cacaushow.com.br/produto/trufa-lacreme-ao-leite-13%2C5g-1002193.html" },
  { sku: "cac-trufa-pistache", name: "Trufa de Chocolate ao Leite e Pistache 30g", brand: "Cacau Show", unitPrice: 5.99, unit: "un", category: "chocolate trufa pistache", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw1787ca6b/medium/1003394_1.png", productUrl: "https://www.cacaushow.com.br/produto/trufa-de-chocolate-ao-leite-e-pistache-30g-1003394.html" },
  { sku: "cac-tablete-leite-100g", name: "Tablete laCreme de Chocolate ao Leite 100g", brand: "Cacau Show", unitPrice: 19.99, unit: "un", category: "chocolate tablete barra", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw153e5cdc/medium/1002638_2.png", productUrl: "https://www.cacaushow.com.br/produto/tablete-lacreme-de-chocolate-ao-leite-100g-1002638.html" },
  { sku: "cac-tablete-pistache", name: "Tablete laCreme de Chocolate Branco com Pistache 100g", brand: "Cacau Show", unitPrice: 22.99, unit: "un", category: "chocolate tablete barra pistache", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw58766799/large/1003788_1.png", productUrl: "https://www.cacaushow.com.br/produto/tablete-lacreme-de-chocolate-branco-com-pistache-100g-1003788.html" },
  { sku: "cac-tablete-caju", name: "Tablete ao Leite com Castanha de Caju 100g", brand: "Cacau Show", unitPrice: 17.99, unit: "un", category: "chocolate tablete castanha", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw0221cb1d/medium/1003094_1.png", productUrl: "https://www.cacaushow.com.br/produto/tablete-ao-leite-com-castanha-de-caju-100g-1003094.html" },
  { sku: "cac-garrafinhas-88g", name: "Caixa Garrafinhas Clássicos Drinks ao Leite 88g", brand: "Cacau Show", unitPrice: 26.99, unit: "un", category: "chocolate presente drinks", imageUrl: "https://www.cacaushow.com.br/on/demandware.static/-/Sites-masterCatalog_CacauShow/default/dw8835b560/medium/1002515_2.png", productUrl: "https://www.cacaushow.com.br/produto/caixa-garrafinhas-cl%C3%A1ssicos-drinks-ao-leite-88g-1002515.html" }
];

export const cacauShowStore: StoreConnector = {
  key: "cacaushow",
  label: "Cacau Show",
  minOrder: Number(process.env.LIA_CACAUSHOW_MIN_ORDER ?? 0),
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
    return `Pedido Cacau Show nº ${orderNumber}: fulfillment é do concierge (operador compra na loja mais próxima e entrega); sem retirada por courier.`;
  }
};
