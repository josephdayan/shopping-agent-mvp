import type { Product } from "@prisma/client";

export type PriceSensitivity = "cheap" | "balanced" | "premium";
export type DeliverySensitivity = "fast" | "normal";

export type ProductIntent = {
  category?: string;
  searchQuery?: string;
  urgency?: DeliverySensitivity;
  priceSensitivity?: PriceSensitivity;
  preferredBrand?: string;
  restrictions?: string[];
  excludedProductIds?: string[];
  excludedProductKeys?: string[];
  searchBatchSize?: number;
  searchOffset?: number;
  wantsRepeat?: boolean;
  unsupported?: boolean;
  ambiguous?: boolean;
};

export type ConversationContext = {
  intent?: ProductIntent;
  selectedProductId?: string;
  selectedProductExternalId?: string;
  rejectedProductIds?: string[];
  rejectedProductKeys?: string[];
  searchOffset?: number;
  deliveryAddress?: string;
  paymentMethod?: "pix" | "card" | "link";
  orderId?: string;
};

export type SupplierSource = "mercado_livre" | "rappi" | "farmacia" | "loja_local";
export type FulfillmentMode = "marketplace_native" | "local_courier" | "manual_operator";

export type RankedProduct = Product & {
  rank: number;
  reason: string;
  score: number;
};
