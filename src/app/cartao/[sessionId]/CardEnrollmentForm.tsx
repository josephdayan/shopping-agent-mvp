"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

declare global {
  interface Window {
    PagarmeCheckout?: {
      init: (success: (data: Record<string, unknown>) => boolean | void, fail: (error: unknown) => void) => void;
    };
  }
}

type Props = {
  sessionId: string;
  sessionToken: string;
  total: number;
  initialName: string;
  initialEmail: string;
  initialZipCode: string;
  publicKey: string;
};

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function stringValue(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" ? data[key] : "";
}

export function CardEnrollmentForm({ sessionId, sessionToken, total, initialName, initialEmail, initialZipCode, publicKey }: Props) {
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const submitTokenizedCard = useCallback(async (data: Record<string, unknown>) => {
    // tokenizecard.js writes the token to this protected field. Its callback
    // payload is not consistent across versions, so prefer either source.
    const tokenInput = document.querySelector<HTMLInputElement>(
      'form[data-pagarmecheckout-form] input[name^="pagarmetoken"]'
    );
    const cardToken = stringValue(data, "pagarmetoken") || stringValue(data, "pagarmetoken-0") || stringValue(data, "token") || stringValue(data, "id") || stringValue(data, "card_token") || tokenInput?.value.trim() || "";
    if (!cardToken) {
      setMessage("Não consegui tokenizar o cartão. Confira os dados e tente de novo.");
      return;
    }
    setSubmitting(true);
    setMessage("Validando o cartão e processando o pagamento...");
    try {
      const response = await fetch("/api/payments/pagarme/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          sessionToken,
          cardToken,
          name: stringValue(data, "name"),
          email: stringValue(data, "email"),
          cpf: stringValue(data, "cpf"),
          address: {
            line1: stringValue(data, "line1"),
            line2: stringValue(data, "line2") || undefined,
            zipCode: stringValue(data, "zipCode"),
            city: stringValue(data, "city"),
            state: stringValue(data, "state"),
            country: "BR"
          },
          consent: stringValue(data, "consent") === "true"
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Não foi possível processar o cartão.");
      setMessage("Pronto! Estamos processando o pagamento e vamos confirmar no WhatsApp.");
    } catch (error) {
      setSubmitting(false);
      setMessage(error instanceof Error ? error.message : "Não consegui processar agora. Volte ao WhatsApp e tente novamente.");
    }
  }, [sessionId, sessionToken]);

  useEffect(() => {
    if (!publicKey) {
      setMessage("O checkout de cartão ainda não está configurado.");
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.pagar.me/v1/tokenizecard.js";
    script.dataset.pagarmecheckoutAppId = publicKey;
    script.async = true;
    script.onload = () => {
      if (!window.PagarmeCheckout) {
        setMessage("Não consegui iniciar o checkout seguro.");
        return;
      }
      window.PagarmeCheckout.init(
        (data) => {
          void submitTokenizedCard(data);
          return false;
        },
        () => setMessage("Confira os dados do cartão e tente novamente.")
      );
      setReady(true);
    };
    script.onerror = () => setMessage("Não consegui carregar o checkout seguro. Tente novamente em instantes.");
    document.body.appendChild(script);
    return () => script.remove();
  }, [publicKey, submitTokenizedCard]);

  function blockUntilReady(event: FormEvent<HTMLFormElement>) {
    if (ready) return;
    event.preventDefault();
    setMessage("Preparando o checkout seguro...");
  }

  return (
    <form className="mt-5 space-y-4 text-tinta" data-pagarmecheckout-form onSubmit={blockUntilReady}>
      <div className="flex items-center justify-between rounded-2xl bg-poster px-4 py-3 text-sm text-white">Total da compra <strong className="text-lg text-acento">{brl(total)}</strong></div>
      <label className="block text-sm font-medium text-tinta/80">Nome completo
        <input name="name" defaultValue={initialName} required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <label className="block text-sm font-medium text-tinta/80">E-mail
        <input name="email" type="email" defaultValue={initialEmail} required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <label className="block text-sm font-medium text-tinta/80">CPF
        <input name="cpf" inputMode="numeric" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-tinta/80">Nome no cartão
          <input name="holder-name" data-pagarmecheckout-element="holder_name" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
        </label>
        <label className="block text-sm font-medium text-tinta/80">Número do cartão
          <div className="relative mt-1">
            <input name="card-number" inputMode="numeric" data-pagarmecheckout-element="number" required className="w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
            <span data-pagarmecheckout-element="brand" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-poster/60" />
          </div>
        </label>
        <label className="block text-sm font-medium text-tinta/80">Mês
          <input name="card-exp-month" inputMode="numeric" data-pagarmecheckout-element="exp_month" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
        </label>
        <label className="block text-sm font-medium text-tinta/80">Ano
          <input name="card-exp-year" inputMode="numeric" data-pagarmecheckout-element="exp_year" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
        </label>
      </div>
      <label className="block text-sm font-medium text-tinta/80">CVV
        <input name="cvv" inputMode="numeric" data-pagarmecheckout-element="cvv" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-poster/60">Endereço de cobrança</p>
      <label className="block text-sm font-medium text-tinta/80">Número, rua e bairro
        <input name="line1" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <label className="block text-sm font-medium text-tinta/80">Complemento (opcional)
        <input name="line2" className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm font-medium text-tinta/80">CEP
          <input name="zipCode" inputMode="numeric" defaultValue={initialZipCode} required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
        </label>
        <label className="col-span-2 block text-sm font-medium text-tinta/80">Cidade
          <input name="city" required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
        </label>
      </div>
      <label className="block text-sm font-medium text-tinta/80">UF
        <input name="state" maxLength={2} required className="mt-1 w-full rounded-xl border border-poster/20 bg-papel px-3 py-2.5 text-tinta outline-none transition focus:border-poster focus:ring-2 focus:ring-acento" />
      </label>
      <label className="flex items-start gap-2 rounded-xl bg-papel px-3 py-2.5 text-xs leading-5 text-tinta/75">
        <input name="consent" value="true" type="checkbox" required className="mt-0.5 h-4 w-4 accent-[#3A225E]" />
        Autorizo guardar este cartão no Pagar.me para futuras compras que eu confirmar no WhatsApp.
      </label>
      <button type="submit" disabled={!ready || submitting} className="w-full rounded-2xl bg-acento px-4 py-3.5 text-base font-bold text-poster shadow-[0_10px_30px_rgba(217,255,91,0.4)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? "Processando..." : `Salvar e pagar ${brl(total)}`}
      </button>
      {message ? <p role="status" className="rounded-xl bg-poster/5 px-3 py-2 text-sm text-tinta/80">{message}</p> : null}
    </form>
  );
}
