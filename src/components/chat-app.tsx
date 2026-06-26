"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Loader2, RotateCcw, Send, ShoppingBag } from "lucide-react";
import { AtlasSymbol } from "@/components/atlas-brand";

type Product = {
  id: string;
  title: string;
  brand: string;
  category: string;
  source: string;
  fulfillmentMode: string;
  price: number;
  shippingPrice: number;
  store: string;
  rating: number;
  deliveryEstimate: string;
  imageUrl: string;
};

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  metadata?: string;
};

type Conversation = {
  id: string;
  currentStep: string;
  status: string;
  messages: Message[];
  options: Array<{ id: string; rank: number; reason: string; product: Product }>;
  orders: Array<{
    id: string;
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    fulfillmentMode: string;
    source: string;
    paymentLink?: string;
    total: number;
    trackingCode?: string;
    product: Product;
  }>;
};

const QUICK_PROMPTS = [
  "quero uma escova de dente",
  "preciso de pasta de dente barata",
  "quero lenco de papel para entregar hoje",
  "repete meu ultimo pedido"
];

export default function ChatApp() {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    startConversation();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  const activeOrder = conversation?.orders[0];
  const canApprove = activeOrder?.paymentStatus === "awaiting_payment";

  async function startConversation() {
    setLoading(true);
    const response = await fetch("/api/conversations", { method: "POST" });
    setConversation(await response.json());
    setLoading(false);
  }

  async function send(text = input) {
    const clean = text.trim();
    if (!conversation || !clean) return;
    setSending(true);
    setInput("");
    const response = await fetch(`/api/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean })
    });
    setConversation(await response.json());
    setSending(false);
  }

  async function approvePayment() {
    if (!conversation) return;
    setSending(true);
    const response = await fetch(`/api/conversations/${conversation.id}/approve-payment`, { method: "POST" });
    setConversation(await response.json());
    setSending(false);
  }

  const statusLabel = useMemo(() => {
    if (!conversation) return "Iniciando";
    const labels: Record<string, string> = {
      collecting_request: "Entendendo pedido",
      awaiting_selection: "Aguardando escolha",
      awaiting_address: "Aguardando endereco",
      awaiting_confirmation: "Confirmacao",
      awaiting_payment: "Pagamento",
      order_created: "Pedido criado",
      cancelled: "Cancelado"
    };
    return labels[conversation.currentStep] ?? conversation.currentStep;
  }, [conversation]);

  if (loading || !conversation) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 className="animate-spin text-atlas-violet" />
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_330px]">
      <div className="flex min-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-md border border-atlas-line bg-white shadow-brand">
        <div className="flex items-center justify-between border-b border-atlas-line bg-atlas-night px-4 py-3 text-atlas-lavender">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-atlas-violet">
              <AtlasSymbol className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Atlas</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-atlas-lavender/55">
                concierge · online
              </p>
            </div>
          </div>
          <span className="rounded-md bg-atlas-violet px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-atlas-night">
            {statusLabel}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-atlas-lavender/65 p-4">
          {conversation.messages.map((message) => (
            <div key={message.id} className={message.sender === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.sender === "user"
                    ? "max-w-[78%] rounded-[18px_18px_4px_18px] bg-[#DCE5F4] px-4 py-3 text-sm text-atlas-ink"
                    : "max-w-[88%] rounded-[18px_18px_18px_4px] border border-atlas-line bg-white px-4 py-3 text-sm text-atlas-ink shadow-sm"
                }
              >
                <p className="whitespace-pre-line leading-relaxed">{message.text}</p>
              </div>
            </div>
          ))}

          {conversation.currentStep === "awaiting_selection" && (
            <div className="grid gap-3 md:grid-cols-3">
              {conversation.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => send(String(option.rank))}
                  className="overflow-hidden rounded-md border border-atlas-line bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-atlas-violet hover:shadow-soft"
                  title={`Escolher ${option.product.title}`}
                >
                  <img src={option.product.imageUrl} alt="" className="h-28 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-atlas-violet">
                      <span>{option.reason}</span>
                      <span>#{option.rank}</span>
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">{option.product.title}</h3>
                    <p className="text-xs text-atlas-body">
                      {option.product.store} · {sourceLabel(option.product.source)} · {option.product.rating.toFixed(1)} estrelas
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">R$ {option.product.price.toFixed(2)}</span>
                      <span className="text-xs text-atlas-muted">{option.product.deliveryEstimate}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-atlas-line bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                className="rounded-md border border-atlas-line px-2.5 py-1.5 text-xs text-atlas-body transition hover:border-atlas-violet hover:text-atlas-violet"
              >
                {prompt}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Digite sua mensagem"
              className="min-w-0 flex-1 rounded-md border border-atlas-line px-3 py-3 outline-none transition focus:border-atlas-violet"
            />
            <button
              disabled={sending}
              className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-atlas-violet text-atlas-night disabled:opacity-50"
              title="Enviar"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border border-atlas-line bg-white p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pedido</h2>
            <ShoppingBag size={18} className="text-atlas-violet" />
          </div>
          {activeOrder ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium">{activeOrder.product.title}</p>
              <StatusRow label="Pagamento" value={activeOrder.paymentStatus} />
              <StatusRow label="Fulfillment" value={activeOrder.fulfillmentStatus} />
              <StatusRow label="Modo" value={fulfillmentLabel(activeOrder.fulfillmentMode)} />
              <StatusRow label="Fonte" value={sourceLabel(activeOrder.source)} />
              <StatusRow label="Pedido" value={activeOrder.status} />
              <StatusRow label="Total" value={`R$ ${activeOrder.total.toFixed(2)}`} />
              {activeOrder.trackingCode && <StatusRow label="Rastreio" value={activeOrder.trackingCode} />}
              {canApprove && (
                <button
                  onClick={approvePayment}
                  disabled={sending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-atlas-violet px-3 py-2.5 text-sm font-semibold text-atlas-night disabled:opacity-50"
                >
                  <CreditCard size={16} />
                  Simular pagamento aprovado
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-atlas-body">Nenhum pedido criado ainda.</p>
          )}
        </div>

        <button
          onClick={startConversation}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-atlas-line bg-white px-3 py-2.5 text-sm font-medium hover:border-atlas-violet hover:text-atlas-violet"
        >
          <RotateCcw size={16} />
          Nova conversa
        </button>

        <div className="rounded-md border border-atlas-line bg-white p-4 text-sm shadow-soft">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Check size={16} className="text-atlas-success" />
            Fluxo coberto
          </div>
          <p className="leading-relaxed text-atlas-body">
            Interpretacao, ranking, checkout, pagamento mockado, pedido e memoria, expostos por API e webhook.
          </p>
        </div>
      </aside>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-atlas-line pb-2 last:border-0 last:pb-0">
      <span className="text-atlas-body">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    mercado_livre: "Mercado Livre",
    rappi: "Rappi",
    farmacia: "Farmacia",
    loja_local: "Loja local"
  };
  return labels[source] ?? source;
}

function fulfillmentLabel(mode: string) {
  const labels: Record<string, string> = {
    marketplace_native: "entrega nativa",
    local_courier: "courier",
    manual_operator: "manual"
  };
  return labels[mode] ?? mode;
}
