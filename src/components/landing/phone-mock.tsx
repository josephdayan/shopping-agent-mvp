import { LiaWhatsAppAvatar } from "@/components/lia-brand";

function DoubleCheck({ read = true }: { read?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 11"
      aria-hidden="true"
      className={`ml-1 inline-block h-[11px] w-[16px] ${read ? "text-[#53BDEB]" : "text-[#8696A0]"}`}
    >
      <path
        d="M11.07 0.65 6.4 6.86 4.58 5.13a.6.6 0 0 0-.85.05l-.5.55a.6.6 0 0 0 .04.84l2.72 2.55a.6.6 0 0 0 .89-.08l5.55-7.36a.6.6 0 0 0-.11-.84l-.55-.42a.6.6 0 0 0-.7.03Z"
        fill="currentColor"
      />
      <path
        d="M15.02 0.65 10.35 6.86l-.62-.6-1.03 1.37 1.2 1.13a.6.6 0 0 0 .9-.08l5.54-7.36a.6.6 0 0 0-.11-.84l-.55-.42a.6.6 0 0 0-.66.03Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Bubble({
  side,
  delay,
  time,
  children
}: {
  side: "in" | "out";
  delay: number;
  time: string;
  children: React.ReactNode;
}) {
  const isOut = side === "out";
  return (
    <div className={`bubble flex ${isOut ? "justify-end" : "justify-start"}`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className={`relative max-w-[86%] rounded-xl px-3 py-2 text-[13px] leading-snug text-[#111B21] shadow-[0_1px_1px_rgba(0,0,0,0.08)] ${
          isOut ? "rounded-tr-sm bg-[#EDFFC2]" : "rounded-tl-sm bg-white"
        }`}
      >
        <div className="whitespace-pre-line">{children}</div>
        <div className="mt-1 flex items-center justify-end text-[10px] leading-none text-[#667781]">
          {time}
          {isOut && <DoubleCheck />}
        </div>
      </div>
    </div>
  );
}

// A conversa do mock usa as mensagens REAIS da Lia (src/lib/lia-copy.ts): resumo com
// frete e prazo da loja, Pix em mensagem separada e confirmação — nada de promessa
// de "chega hoje" que o produto não faz.
export default function PhoneMock() {
  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px]">
      <div className="relative overflow-hidden rounded-[2.4rem] border-[6px] border-[#1C1030] bg-[#1C1030] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {/* WhatsApp header */}
        <div className="flex items-center gap-3 bg-[#3A225E] px-4 pb-3 pt-5">
          <LiaWhatsAppAvatar className="h-9 w-9 rounded-full" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-white">Lia</div>
            <div className="text-[11px] text-[#CFC2E6]">online</div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-white/80" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1Z" />
            </svg>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </div>
        </div>

        {/* Chat */}
        <div className="space-y-2 bg-[#F0ECF7] bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.55),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(255,255,255,0.4),transparent_40%)] px-3 pb-4 pt-3">
          <div className="bubble flex justify-center" style={{ animationDelay: "100ms" }}>
            <span className="rounded-md bg-[#E6DDF4] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#5C4A80]">
              hoje
            </span>
          </div>

          <Bubble side="out" delay={350} time="16:02">
            oi lia! me vê arroz 5kg, sabão em pó e uma ração 10kg
          </Bubble>

          <Bubble side="in" delay={900} time="16:04">
            {"🛒 "}
            <strong>Seu pedido:</strong>
            {"\n• 1x Arroz 5kg — R$ 27,90\n• 1x Sabão em pó — R$ 24,50\n• 1x Ração 10kg — R$ 112,90\n\nProdutos: R$ 165,30\nEntrega: R$ 12,90 · chega até quinta\n"}
            <strong>Total: R$ 178,20</strong>
            {"\n\nComo prefere pagar: Pix ou cartão?"}
          </Bubble>

          <Bubble side="out" delay={1450} time="16:05">
            pix
          </Bubble>

          <Bubble side="in" delay={1950} time="16:05">
            {"Total "}
            <strong>R$ 178,20</strong>
            {" no Pix.\n\nO código vem na próxima mensagem — copia ela inteira e cola no "}
            <strong>Pix copia e cola</strong>
            {" do seu banco 👇"}
          </Bubble>

          <div className="bubble flex justify-center" style={{ animationDelay: "2450ms" }}>
            <span className="rounded-full bg-[#FFF6D8] px-3 py-1 text-[10px] font-semibold text-[#7A6A2F] shadow-sm">
              🔒 Pagamento aprovado via Pix
            </span>
          </div>

          <Bubble side="in" delay={2900} time="16:07">
            ✅ Pagamento confirmado. Já estou separando — te aviso quando sair pra entrega.
          </Bubble>
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2 bg-[#F0ECF7] px-3 pb-4">
          <div className="flex h-9 flex-1 items-center rounded-full bg-white px-4 text-[12px] text-[#8696A0]">
            Mensagem
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3A225E] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
              <path d="M3.4 20.4 21.2 12 3.4 3.6l-.01 6.53L14 12 3.39 13.87Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
