import { asaasPixOut } from "./asaas";
import { mockPixOut } from "./mock";
import type { PixOutProvider } from "./types";
export * from "./types";

// LIA_PIX_OUT_OFF=true pausa TODO pagamento de saída (kill-switch, além de
// LIA_PURCHASE_SUBMIT_OFF). LIA_PIX_OUT_PROVIDER escolhe o provedor; mock nunca em produção.
export function pixOutEnabled() {
  return process.env.LIA_PIX_OUT_OFF !== "true" && Boolean(process.env.LIA_PIX_OUT_PROVIDER);
}
export function pixOutProvider(): PixOutProvider {
  if (process.env.LIA_PIX_OUT_OFF === "true") throw new Error("Pix de saída pausado (LIA_PIX_OUT_OFF).");
  const name = process.env.LIA_PIX_OUT_PROVIDER?.trim();
  if (name === "asaas") return asaasPixOut;
  if (name === "mock") {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new Error("Provedor mock de Pix não é permitido em produção.");
    return mockPixOut;
  }
  throw new Error("Pix de saída não configurado (LIA_PIX_OUT_PROVIDER).");
}
