export const PURCHASE_JOB_STATUS = {
  PREFLIGHT_QUEUED: "preflight_queued",
  PREFLIGHTING: "preflighting",
  CART_READY: "cart_ready",
  AWAITING_APPROVAL: "awaiting_approval",
  APPROVED: "approved",
  PURCHASING: "purchasing",
  ORDERED: "ordered",
  READY_FOR_PICKUP: "ready_for_pickup",
  NEEDS_HUMAN: "needs_human",
  CANCELED: "canceled",
  FAILED: "failed"
} as const;

export type PurchaseJobStatus = (typeof PURCHASE_JOB_STATUS)[keyof typeof PURCHASE_JOB_STATUS];
export type PurchaseAutomationMode = "off" | "cart_only" | "approval_required" | "policy";

export type PurchaseItemInput = {
  requestedSku: string;
  requestedName: string;
  requestedQty: number;
  requestedUnitPrice?: number | null;
  // Set after the first live cart pass and reused during revalidation when the
  // retailer hides individual line prices in the checkout DOM.
  expectedUnitPrice?: number | null;
  productUrl?: string | null;
};

export type ResolvedPurchaseItem = PurchaseItemInput & {
  status: "resolved" | "ambiguous" | "unavailable";
  retailerSku?: string;
  retailerProductId?: string;
  retailerSellerId?: string;
  ean?: string;
  resolvedName?: string;
  actualUnitPrice?: number;
  matchConfidence?: number;
  raw?: Record<string, unknown>;
};

export type CartSnapshot = {
  storeKey: string;
  storeLabel: string;
  storeUnitId?: string | null;
  storeUnitLabel?: string | null;
  // The retailer's immutable cart/orderForm id when it is available. It is NOT a
  // payment token and may safely be retained to reconcile a retry.
  retailerCartId?: string;
  browserSessionId?: string;
  items: ResolvedPurchaseItem[];
  itemsSubtotal: number;
  total: number;
  currency: "BRL";
  capturedAt: string;
  status: "ready" | "needs_human";
  reason?: string;
};

export type BuyerInput = {
  jobId: string;
  deliveryOrderId: string;
  browserSessionId?: string | null;
  deliveryCep?: string | null;
  storeKey: string;
  storeLabel: string;
  storeUnitId?: string | null;
  storeUnitLabel?: string | null;
  items: PurchaseItemInput[];
};

export type StoreOrderResult = {
  storeOrderNumber: string;
  status: "ordered" | "ready_for_pickup";
  browserSessionId?: string;
};

export interface BuyerConnector {
  key: string;
  preflight(input: BuyerInput): Promise<CartSnapshot>;
  revalidate(input: BuyerInput): Promise<CartSnapshot>;
  placeOrder(input: BuyerInput, snapshot: CartSnapshot, idempotencyKey: string): Promise<StoreOrderResult>;
  getOrderStatus?(input: BuyerInput, storeOrderNumber: string): Promise<"ordered" | "ready_for_pickup">;
}

export class PurchaseError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION_REQUIRED"
      | "AMBIGUOUS_ITEM"
      | "OUT_OF_STOCK"
      | "PRICE_CHANGED"
      | "LOGIN_REQUIRED"
      | "CAPTCHA_REQUIRED"
      | "PAYMENT_ACTION_REQUIRED"
      | "MANUAL_ACTION_REQUIRED"
      | "RETAILER_BUSY"
      | "ORDER_STATUS_UNKNOWN"
      | "UNSUPPORTED_STORE",
    message: string
  ) {
    super(message);
    this.name = "PurchaseError";
  }
}
