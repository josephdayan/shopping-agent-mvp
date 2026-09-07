import { PURCHASE_DOMAINS } from "./purchase-preparation";
export function trackingPageAllowed(
  store: string,
  url: string,
  registered?: string | null,
) {
  try {
    const u = new URL(url);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !u.hostname.includes(".") ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.includes(":") ||
      /\.(local|localhost|internal)$/.test(u.hostname)
    )
      return false;
    const domain = PURCHASE_DOMAINS[store];
    return (
      Boolean(
        domain && (u.hostname === domain || u.hostname.endsWith(`.${domain}`)),
      ) || Boolean(registered && u.href === new URL(registered).href)
    );
  } catch {
    return false;
  }
}
const OUT = new Set([
  "saiu para entrega",
  "pedido saiu para entrega",
  "seu pedido saiu para entrega",
]);
const DONE = new Set([
  "entregue",
  "pedido entregue",
  "seu pedido foi entregue",
]);
export function explicitTrackingStatus(text: string) {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "");
  return OUT.has(t) ? "out_for_delivery" : DONE.has(t) ? "delivered" : null;
}
