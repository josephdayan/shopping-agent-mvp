import { createHash } from "node:crypto";
import type { CartSnapshot, PurchaseAutomationMode } from "./types";

export type PurchasePolicy = {
  enabled: boolean;
  mode: PurchaseAutomationMode;
  maxAutoApproveTotal: number;
  maxPriceDelta: number;
  maxPriceDeltaPercent: number;
  approvalTtlMinutes: number;
};

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getPurchasePolicy(): PurchasePolicy {
  const raw = process.env.PURCHASE_AUTOMATION_MODE ?? "cart_only";
  const mode: PurchaseAutomationMode = ["off", "cart_only", "approval_required", "policy"].includes(raw)
    ? (raw as PurchaseAutomationMode)
    : "cart_only";
  return {
    enabled: process.env.PURCHASE_AUTOMATION_ENABLED === "true" && mode !== "off",
    mode,
    maxAutoApproveTotal: positiveNumber(process.env.PURCHASE_AUTO_APPROVE_MAX_TOTAL, 0),
    maxPriceDelta: positiveNumber(process.env.PURCHASE_MAX_PRICE_DELTA, 5),
    maxPriceDeltaPercent: positiveNumber(process.env.PURCHASE_MAX_PRICE_DELTA_PERCENT, 0.03),
    approvalTtlMinutes: Math.max(1, positiveNumber(process.env.PURCHASE_APPROVAL_TTL_MINUTES, 10))
  };
}

export function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function cartHash(snapshot: CartSnapshot): string {
  const stable = {
    storeKey: snapshot.storeKey,
    storeUnitId: snapshot.storeUnitId ?? null,
    retailerCartId: snapshot.retailerCartId ?? null,
    // A changed promise or freight must invalidate a prior approval even when a
    // retailer happens to keep the order total unchanged.
    deliveryFee: snapshot.deliveryFee == null ? null : money(snapshot.deliveryFee),
    deliveryPromise: snapshot.deliveryPromise ?? null,
    total: money(snapshot.total),
    items: [...snapshot.items]
      .map((item) => ({
        id: item.retailerProductId ?? item.retailerSku ?? item.requestedSku,
        seller: item.retailerSellerId ?? null,
        qty: item.requestedQty,
        price: item.actualUnitPrice == null ? null : money(item.actualUnitPrice)
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export function canAutoPurchase(input: { snapshot: CartSnapshot; expectedTotal?: number | null }): { allowed: boolean; reason?: string } {
  const policy = getPurchasePolicy();
  if (!policy.enabled || policy.mode !== "policy") return { allowed: false, reason: "policy_disabled" };
  if (input.snapshot.status !== "ready") return { allowed: false, reason: "cart_not_ready" };
  if (input.snapshot.items.some((item) => item.status !== "resolved")) return { allowed: false, reason: "item_not_resolved" };
  if (policy.maxAutoApproveTotal <= 0 || input.snapshot.total > policy.maxAutoApproveTotal) {
    return { allowed: false, reason: "above_auto_approve_limit" };
  }
  const expected = input.expectedTotal;
  if (expected && expected > 0) {
    const delta = Math.abs(input.snapshot.total - expected);
    if (delta > policy.maxPriceDelta || delta / expected > policy.maxPriceDeltaPercent) {
      return { allowed: false, reason: "price_delta_above_policy" };
    }
  }
  return { allowed: true };
}
