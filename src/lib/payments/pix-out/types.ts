// Pix de SAÍDA (11/09): pagar o copia-e-cola que a loja gerou, por API bancária da conta PJ.
// Interface neutra: o fluxo de compra não conhece o provedor. Regras que valem para todos:
// decode ANTES de pagar; uma chamada de pay por job; timeout = resultado desconhecido.
export type PixDecode = {
  type: "static" | "dynamic";
  receiverName: string;
  receiverDoc: string; // CPF/CNPJ só dígitos
  amountCents: number | null;
  canBePaidWithDifferentValue: boolean;
  expiresAt?: string | null;
};
export type PixPayResult = {
  providerPayoutId: string;
  status: "submitted" | "paid" | "refused";
  endToEndId?: string | null;
};
export type PixPayStatus = {
  status: "submitted" | "paid" | "refused" | "expired" | "unknown";
  endToEndId?: string | null;
  reason?: string;
};
export class PixOutTimeout extends Error {
  constructor(message = "Banco não respondeu; resultado desconhecido.") {
    super(message);
    this.name = "PixOutTimeout";
  }
}
export interface PixOutProvider {
  readonly name: "asaas" | "mock";
  decode(code: string): Promise<PixDecode>;
  // idempotencyKey = PixPayout.id. Provedor sem chave de idempotência (Asaas) NUNCA é
  // chamado de novo pelo fluxo: um timeout vira `unknown` e humano.
  pay(input: { code: string; amountCents: number; idempotencyKey: string; description: string }): Promise<PixPayResult>;
  status(providerPayoutId: string): Promise<PixPayStatus>;
}
