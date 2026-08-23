import { timingSafeEqual } from "crypto";

function sameSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function purchaseWorkerAuthorized(request: Request): boolean {
  const expected = process.env.LIA_PURCHASE_WORKER_TOKEN?.trim();
  // Worker routes always fail closed. Unlike local demo routes, they expose paid
  // orders and can advance a financial workflow.
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const direct = request.headers.get("x-purchase-worker-token")?.trim();
  const received = bearer || direct;
  return Boolean(received && sameSecret(received, expected));
}
