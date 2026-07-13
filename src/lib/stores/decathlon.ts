import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { catalogWithImages, rankCatalog } from "./types";

// Small, intentionally verified sports-nutrition vertical. Decathlon advertises
// same-day store pickup and these products were checked on 2026-07-12. Expand this
// catalog from the official collection instead of routing to marketplace sellers.
const CATALOG: CatalogItem[] = catalogWithImages([
  { sku: "DEC-CREA-INT-300", name: "Creatina em Pó Hardcore Reload Integralmédica 300g", brand: "Integralmédica", unitPrice: 50.99, unit: "300g", category: "suplemento esportivo creatina", imageUrl: "https://decathlonpro.vtexassets.com/arquivos/ids/171369963/17619436902318.jpg?v=638978726251700000", productUrl: "https://www.decathlon.com.br/creatina-monohidratada-integralmedica-300g-2145877461/p" },
  { sku: "DEC-CREA-MAX-300", name: "Creatina Monohidratada Max Titanium 300g", brand: "Max Titanium", unitPrice: 67.99, unit: "300g", category: "suplemento esportivo creatina", imageUrl: "https://decathlonpro.vtexassets.com/arquivos/ids/9981461/-creatina-300g-max-no-size1.jpg?v=637860691081100000", productUrl: "https://www.decathlon.com.br/creatina-300g-branca-8635477-max-titanium/p" },
  { sku: "DEC-CREA-SHARK-300", name: "Creatina Monohidratada Shark Pro 300g", brand: "Shark Pro", unitPrice: 67.99, unit: "300g", category: "suplemento esportivo creatina", imageUrl: "https://decathlonpro.vtexassets.com/arquivos/ids/43364546/-creatina-monohidratada-sk-300g-no-size1.jpg?v=638253063560070000", productUrl: "https://www.decathlon.com.br/creatina-monohidratada-300g-branca-8639837-shark-pro/p" },
  { sku: "DEC-CREA-DUX-300", name: "Creatina Monohidratada DUX 300g", brand: "DUX Nutrition", unitPrice: 89.9, unit: "300g", category: "suplemento esportivo creatina", imageUrl: "https://decathlonpro.vtexassets.com/arquivos/ids/169971742/17581317650933.jpg?v=638937312464300000", productUrl: "https://www.decathlon.com.br/creatina-monohidratada---pote-300g-2145178927/p" }
]);

const UNITS: StoreUnit[] = [
  { id: "dec-paulista", label: "Decathlon Paulista", address: "Av. Paulista, 854, Bela Vista, São Paulo - SP", cep: "01310-913", lat: -23.5653, lng: -46.6519 },
  { id: "dec-ricardo-jafet", label: "Decathlon Ricardo Jafet", address: "Av. Doutor Ricardo Jafet, 2070, Vila Mariana, São Paulo - SP", cep: "04123-020", lat: -23.5925, lng: -46.6212 },
  { id: "dec-morumbi", label: "Decathlon Morumbi", address: "Av. Duquesa de Goiás, 381, Real Parque, São Paulo - SP", cep: "05686-001", lat: -23.6127, lng: -46.7102 },
  { id: "dec-morumbi-town", label: "Decathlon Morumbi Town", address: "Av. Giovanni Gronchi, 5930, Vila Andrade, São Paulo - SP", cep: "05724-002", lat: -23.6312, lng: -46.7357 },
  { id: "dec-tambore", label: "Decathlon Tamboré", address: "Av. Piracema, 669, Tamboré, Barueri - SP", cep: "06460-030", lat: -23.5045, lng: -46.8338 },
  { id: "dec-campinas", label: "Decathlon Campinas", address: "Rod. Dom Pedro I, s/n, Jardim das Palmeiras, Campinas - SP", cep: "13094-901", lat: -22.8937, lng: -47.0274 },
  { id: "dec-sjc", label: "Decathlon São José dos Campos", address: "Rua Andaraí, 400, Jardim Satélite, São José dos Campos - SP", cep: "12230-290", lat: -23.2242, lng: -45.8998 },
  { id: "dec-sorocaba", label: "Decathlon Sorocaba", address: "Av. Comendador Pereira Inácio, 2480, Jardim Emília, Sorocaba - SP", cep: "18030-005", lat: -23.5119, lng: -47.4663 }
];

export const decathlonStore: StoreConnector = {
  key: "decathlon",
  label: "Decathlon",
  minOrder: Number(process.env.LIA_DECATHLON_MIN_ORDER ?? 0),
  async searchItems(query: string, limit = 4) {
    return rankCatalog(query, CATALOG, limit);
  },
  listCatalog() {
    return CATALOG;
  },
  listUnits() {
    return UNITS;
  },
  pickupInstructions(orderNumber: string) {
    return `Retirar pedido Decathlon nº ${orderNumber} no balcão somente depois do aviso de disponível para retirada. Levar documento com foto e os dados do pedido; confirme a retirada por terceiro antes de despachar o motoboy.`;
  }
};
