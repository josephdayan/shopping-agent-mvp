import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { pagarmeAdapter } from "@/lib/payments/pagarme";

const ENROLLMENT_TTL_MS = 15 * 60 * 1000;

function hash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function publicBaseUrl() {
  return (process.env.LIA_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function isCardEnrollmentAvailable() {
  return pagarmeAdapter.isAvailable() && Boolean(pagarmeAdapter.publicKey() || process.env.PAGARME_MOCK === "true" || process.env.NODE_ENV === "test");
}

export async function createCardEnrollmentSession(input: { orderId: string; userId: string }) {
  const secret = randomBytes(32).toString("base64url");
  await prisma.cardEnrollmentSession.deleteMany({ where: { deliveryOrderId: input.orderId } });
  const session = await prisma.cardEnrollmentSession.create({
    data: {
      userId: input.userId,
      deliveryOrderId: input.orderId,
      secretHash: hash(secret),
      expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS)
    }
  });
  return {
    id: session.id,
    expiresAt: session.expiresAt,
    url: `${publicBaseUrl()}/cartao/${session.id}?token=${encodeURIComponent(secret)}`
  };
}

export async function getCardEnrollmentSession(id: string, secret: string) {
  const session = await prisma.cardEnrollmentSession.findUnique({
    where: { id },
    include: { deliveryOrder: true, user: true }
  });
  if (!session || session.secretHash !== hash(secret) || session.consumedAt || session.expiresAt <= new Date()) return null;
  if (session.deliveryOrder.status !== "awaiting_payment") return null;
  return session;
}

// The tokenized card can only be submitted once. A browser retry after a network
// failure must request a fresh link instead of risking two first-card charges.
export async function consumeCardEnrollmentSession(id: string, secret: string) {
  const claimed = await prisma.cardEnrollmentSession.updateMany({
    where: { id, secretHash: hash(secret), consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() }
  });
  if (claimed.count !== 1) return null;
  return prisma.cardEnrollmentSession.findUnique({
    where: { id },
    include: { deliveryOrder: true, user: true }
  });
}
