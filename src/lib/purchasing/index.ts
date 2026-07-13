import { CarrefourBuyer } from "./stores/carrefour-buyer";
import type { BuyerConnector } from "./types";

const buyers: Record<string, BuyerConnector> = {
  carrefour: new CarrefourBuyer()
};

export function getBuyer(storeKey: string): BuyerConnector {
  const buyer = buyers[storeKey];
  if (!buyer) throw new Error(`No purchase connector registered for store '${storeKey}'`);
  return buyer;
}
