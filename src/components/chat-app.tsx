"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Loader2, RotateCcw, Send, ShoppingBag } from "lucide-react";

type Product = {
  id: string;
  title: string;
  brand: string;
  category: string;
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
        <Loader2 className="animate-spin text-leaf" />
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_330px]">
      <div className="flex min-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-md border border-ink/10 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Web chat</p>
            <p className="text-xs text-ink/60">Console web de teste para a API e webhook WhatsApp</p>
          </div>
          <span className="rounded-md bg-mist px-3 py-1 text-xs font-medium text-leaf">{statusLabel}</span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfdfc] p-4">
          {conversation.messages.map((message) => (
            <div key={message.id} className={message.sender === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.sender === "user"
                    ? "max-w-[78%] rounded-md bg-leaf px-4 py-3 text-sm text-white"
                    : "max-w-[88%] rounded-md border border-ink/10 bg-white px-4 py-3 text-sm shadow-sm"
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
                  className="overflow-hidden rounded-md border border-ink/10 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-leaf"
                  title={`Escolher ${option.product.title}`}
                >
                  <img src={option.product.imageUrl} alt="" className="h-28 w-full object-cover" />
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-leaf">
                      <span>{option.reason}</span>
                      <span>#{option.rank}</span>
                    </div>
                    <h3 className="text-sm font-semibold leading-snug">{option.product.title}</h3>
                    <p className="text-xs text-ink/65">{option.product.store} · {option.product.rating.toFixed(1)} estrelas</p>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">R$ {option.product.price.toFixed(2)}</span>
                      <span className="text-xs text-ink/60">{option.product.deliveryEstimate}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-ink/10 bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                className="rounded-md border border-ink/10 px-2.5 py-1.5 text-xs hover:border-leaf hover:text-leaf"
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
              className="min-w-0 flex-1 rounded-md border border-ink/15 px-3 py-3 outline-none focus:border-leaf"
            />
            <button
              disabled={sending}
              className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-leaf text-white disabled:opacity-50"
              title="Enviar"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border border-ink/10 bg-white p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pedido</h2>
            <ShoppingBag size={18} className="text-leaf" />
          </div>
          {activeOrder ? (
            <div className="space-y-3 text-sm">
              <p className="font-medium">{activeOrder.product.title}</p>
              <StatusRow label="Pagamento" value={activeOrder.paymentStatus} />
              <StatusRow label="Fulfillment" value={activeOrder.fulfillmentStatus} />
              <StatusRow label="Pedido" value={activeOrder.status} />
              <StatusRow label="Total" value={`R$ ${activeOrder.total.toFixed(2)}`} />
              {activeOrder.trackingCode && <StatusRow label="Rastreio" value={activeOrder.trackingCode} />}
              {canApprove && (
                <button
                  onClick={approvePayment}
                  disabled={sending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-coral px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <CreditCard size={16} />
                  Simular pagamento aprovado
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink/60">Nenhum pedido criado ainda.</p>
          )}
        </div>

        <button
          onClick={startConversation}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm font-medium hover:border-leaf"
        >
          <RotateCcw size={16} />
          Nova conversa
        </button>

        <div className="rounded-md border border-ink/10 bg-white p-4 text-sm shadow-soft">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Check size={16} className="text-leaf" />
            Fluxo coberto
          </div>
          <p className="leading-relaxed text-ink/65">
            Interpretacao, ranking, checkout, pagamento mockado, pedido e memoria, expostos por API e webhook.
          </p>
        </div>
      </aside>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-2 last:border-0 last:pb-0">
      <span className="text-ink/60">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
