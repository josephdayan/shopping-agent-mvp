import { BoticarioBuyer } from "./stores/boticario-buyer";
import { CarrefourBuyer } from "./stores/carrefour-buyer";
import { PetzBuyer } from "./stores/petz-buyer";
import type { BuyerConnector } from "./types";

const buyers: Record<string, BuyerConnector> = {
  carrefour: new CarrefourBuyer(),
  petz: new PetzBuyer(),
  boticario: new BoticarioBuyer()
};

export function getBuyer(storeKey: string): BuyerConnector {
  const buyer = buyers[storeKey];
  if (!buyer) throw new Error(`No purchase connector registered for store '${storeKey}'`);
  return buyer;
}
