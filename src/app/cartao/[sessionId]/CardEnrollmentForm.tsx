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
    const cardToken = stringValue(data, "pagarmetoken") || stringValue(data, "token") || stringValue(data, "id") || stringValue(data, "card_token");
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
    <form className="mt-6 space-y-4" data-pagarmecheckout-form onSubmit={blockUntilReady}>
      <div className="rounded-xl bg-slate-800 px-4 py-3 text-sm">Total: <strong>{brl(total)}</strong></div>
      <label className="block text-sm">Nome completo
        <input name="name" defaultValue={initialName} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <label className="block text-sm">E-mail
        <input name="email" type="email" defaultValue={initialEmail} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <label className="block text-sm">CPF
        <input name="cpf" inputMode="numeric" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Nome no cartão
          <input name="holder-name" data-pagarmecheckout-element="holder_name" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
        <label className="block text-sm">Número do cartão
          <input name="card-number" inputMode="numeric" data-pagarmecheckout-element="number" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
        <label className="block text-sm">Mês
          <input name="card-exp-month" inputMode="numeric" data-pagarmecheckout-element="exp_month" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
        <label className="block text-sm">Ano
          <input name="card-exp-year" inputMode="numeric" data-pagarmecheckout-element="exp_year" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">CVV
        <input name="cvv" inputMode="numeric" data-pagarmecheckout-element="cvv" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <p className="pt-2 text-xs text-slate-400">Endereço de cobrança</p>
      <label className="block text-sm">Número, rua e bairro
        <input name="line1" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <label className="block text-sm">Complemento (opcional)
        <input name="line2" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm">CEP
          <input name="zipCode" inputMode="numeric" defaultValue={initialZipCode} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
        <label className="col-span-2 block text-sm">Cidade
          <input name="city" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">UF
        <input name="state" maxLength={2} required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2" />
      </label>
      <label className="flex gap-2 text-xs leading-5 text-slate-300">
        <input name="consent" value="true" type="checkbox" required />
        Autorizo guardar este cartão no Pagar.me para futuras compras que eu confirmar no WhatsApp.
      </label>
      <button type="submit" disabled={!ready || submitting} className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? "Processando..." : `Salvar e pagar ${brl(total)}`}
      </button>
      {message ? <p role="status" className="text-sm text-slate-300">{message}</p> : null}
    </form>
  );
}
