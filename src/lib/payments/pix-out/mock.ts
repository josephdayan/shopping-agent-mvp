import { randomUUID } from "node:crypto";
import { parsePixEmv } from "../../pix-emv";
import { PixOutTimeout, type PixOutProvider } from "./types";

// Provedor simulado (testes e dev). LIA_PIX_OUT_MOCK_MODE: paid (default) | refused |
// timeout | pending. Conta chamadas de pay para provar que nunca há segunda tentativa.
export const mockPixOutCalls = { decode: 0, pay: 0, status: 0 };
const store = new Map<string, { status: "submitted" | "paid" | "refused"; endToEndId: string }>();
export const mockPixOut: PixOutProvider = {
  name: "mock",
  async decode(code) {
    mockPixOutCalls.decode += 1;
    const emv = parsePixEmv(code);
    if (!emv.valid) throw new Error("QR inválido.");
    return {
      type: emv.dynamic ? "dynamic" : "static",
      receiverName: process.env.LIA_PIX_OUT_MOCK_RECEIVER_NAME ?? emv.merchantName,
      receiverDoc: process.env.LIA_PIX_OUT_MOCK_RECEIVER_DOC ?? "12345678000199",
      amountCents: emv.amountCents,
      canBePaidWithDifferentValue: emv.amountCents == null,
      expiresAt: null,
    };
  },
  async pay(input) {
    mockPixOutCalls.pay += 1;
    const mode = process.env.LIA_PIX_OUT_MOCK_MODE ?? "paid";
    if (mode === "timeout") throw new PixOutTimeout();
    const id = `mockpay_${randomUUID()}`;
    const endToEndId = `E${Date.now()}${randomUUID().slice(0, 8)}`;
    const status = mode === "refused" ? "refused" : mode === "pending" ? "submitted" : "paid";
    store.set(id, { status, endToEndId });
    return { providerPayoutId: id, status, endToEndId: status === "paid" ? endToEndId : null };
  },
  async status(id) {
    mockPixOutCalls.status += 1;
    const row = store.get(id);
    if (!row) return { status: "unknown" };
    if (row.status === "submitted" && process.env.LIA_PIX_OUT_MOCK_MODE === "paid") row.status = "paid";
    return { status: row.status, endToEndId: row.status === "paid" ? row.endToEndId : null };
  },
};
