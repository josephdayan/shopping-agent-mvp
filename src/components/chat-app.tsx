"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CreditCard, Loader2, RotateCcw, Send, ShoppingBag } from "lucide-react";
import { LiaSymbol } from "@/components/lia-brand";

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
        <Loader2 className="animate-spin text-lia-green" />
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_330px]">
      <div className="flex min-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-md border border-lia-line bg-white shadow-brand">
        <div className="flex items-center justify-between border-b border-lia-line bg-lia-night px-4 py-3 text-lia-lavender">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/8 text-lia-aqua">
              <LiaSymbol className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Lia</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-lia-lavender/55">
                assistente · online
              </p>
            </div>
          </div>
          <span className="rounded-md bg-lia-aqua px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-lia-night">
            {statusLabel}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-lia-lavender/65 p-4">
          {conversation.messages.map((message) => (
            <div key={message.id} className={message.sender === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  message.sender === "user"
                    ? "max-w-[78%] rounded-[18px_18px_4px_18px] bg-lia-aqua/25 px-4 py-3 text-sm text-lia-ink"
                    : "max-w-[88%] rounded-[18px_18px_18px_4px] border border-lia-line bg-white px-4 py-3 text-sm text-lia-ink shadow-sm"
                }
              >
                <p className="whitespace-pre-line leading-relaxed">{renderWhatsAppText(message.text)}</p>
              </div>
            </div>
          ))}

          {conversation.currentStep === "awaiting_selection" && (
            <div className="grid gap-4 md:grid-cols-3">
              {conversation.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => send(String(option.rank))}
                  className="group overflow-hidden rounded-[22px] border-[8px] border-white bg-white text-left shadow-soft outline outline-1 outline-lia-line/60 transition hover:-translate-y-0.5 hover:outline-lia-aqua"
                  title={`Escolher ${option.product.title}`}
                >
                  <div className="overflow-hidden rounded-[14px] bg-lia-lavender">
                    <img
                      src={option.product.imageUrl}
                      alt=""
                      className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="space-y-3 px-3 pb-4 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold leading-snug text-lia-ink">{option.product.title}</h3>
                      <span className="shrink-0 rounded-full bg-lia-aqua/20 px-2.5 py-1 text-xs font-semibold text-lia-night">
                        #{option.rank}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm leading-relaxed text-lia-muted">
                      {option.product.store} · {sourceLabel(option.product.source)} · {option.reason}
                    </p>
                    <div className="space-y-1.5 text-sm text-lia-body">
                      <p>
                        <span className="font-semibold text-lia-ink">Valor:</span> {formatCurrency(option.product.price)}
                      </p>
                      <p>
                        <span className="font-semibold text-lia-ink">Entrega:</span> {option.product.deliveryEstimate}
                      </p>
                      <p>
                        <span className="font-semibold text-lia-ink">Avaliação:</span>{" "}
                        {option.product.rating.toFixed(1)} estrelas
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-lia-line bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => send(prompt)}
                className="rounded-md border border-lia-line px-2.5 py-1.5 text-xs text-lia-body transition hover:border-lia-aqua hover:text-lia-night"
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
              className="min-w-0 flex-1 rounded-md border border-lia-line px-3 py-3 outline-none transition focus:border-lia-aqua"
            />
            <button
              disabled={sending}
              className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-lia-aqua text-lia-night disabled:opacity-50"
              title="Enviar"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border border-lia-line bg-white p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pedido</h2>
            <ShoppingBag size={18} className="text-lia-green" />
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-lia-aqua px-3 py-2.5 text-sm font-semibold text-lia-night disabled:opacity-50"
                >
                  <CreditCard size={16} />
                  Simular pagamento aprovado
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-lia-body">Nenhum pedido criado ainda.</p>
          )}
        </div>

        <button
          onClick={startConversation}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-lia-line bg-white px-3 py-2.5 text-sm font-medium hover:border-lia-aqua hover:bg-lia-mint"
        >
          <RotateCcw size={16} />
          Nova conversa
        </button>

        <div className="rounded-md border border-lia-line bg-white p-4 text-sm shadow-soft">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <Check size={16} className="text-lia-success" />
            Fluxo coberto
          </div>
          <p className="leading-relaxed text-lia-body">
            Interpretacao, ranking, checkout, pagamento mockado, pedido e memoria, expostos por API e webhook.
          </p>
        </div>
      </aside>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-lia-line pb-2 last:border-0 last:pb-0">
      <span className="text-lia-body">{label}</span>
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function renderWhatsAppText(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return (
        <strong key={`${part}-${index}`} className="font-semibold">
          {part.slice(1, -1)}
        </strong>
      );
    }

    return part;
  });
}
