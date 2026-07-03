import { LiaAppIcon } from "@/components/lia-brand";

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
        className={`relative max-w-[82%] rounded-xl px-3 py-2 text-[13px] leading-snug text-[#111B21] shadow-[0_1px_1px_rgba(0,0,0,0.08)] ${
          isOut ? "rounded-tr-sm bg-[#D9FDD3]" : "rounded-tl-sm bg-white"
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

export default function PhoneMock() {
  return (
    <div className="relative mx-auto w-[300px] sm:w-[330px]">
      <div className="relative overflow-hidden rounded-[2.4rem] border-[6px] border-[#0B1F1D] bg-[#0B1F1D] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
        {/* WhatsApp header */}
        <div className="flex items-center gap-3 bg-[#075E54] px-4 pb-3 pt-5">
          <LiaAppIcon className="h-9 w-9 rounded-full" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold text-white">Lia</div>
            <div className="text-[11px] text-[#B5DFD9]">online</div>
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
        <div className="space-y-2 bg-[#ECE5DD] bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.55),transparent_45%),radial-gradient(circle_at_85%_70%,rgba(255,255,255,0.4),transparent_40%)] px-3 pb-4 pt-3">
          <div className="bubble flex justify-center" style={{ animationDelay: "100ms" }}>
            <span className="rounded-md bg-[#D5EFE6] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#54695F]">
              hoje
            </span>
          </div>

          <Bubble side="out" delay={350} time="16:02">
            oi lia! me manda arroz, creme dental e um cabo USB-C barato
          </Bubble>

          <Bubble side="in" delay={900} time="16:02">
            {"Deixa comigo! 🛒 Achei tudo:\n• Arroz 5kg — R$ 27,90\n• Creme dental — R$ 6,90\n• Cabo USB-C simples — R$ 19,90\n\nTotal com entrega: R$ 64,60. Fecho o pedido?"}
          </Bubble>

          <Bubble side="out" delay={1450} time="16:03">
            fecha! 🙌
          </Bubble>

          <Bubble side="in" delay={1950} time="16:03">
            {"Fechado ✅ Segue o Pix copia-e-cola 👇\nAssim que cair, preparo tudo por aqui."}
          </Bubble>

          <div className="bubble flex justify-center" style={{ animationDelay: "2450ms" }}>
            <span className="rounded-full bg-[#FFF6D8] px-3 py-1 text-[10px] font-semibold text-[#7A6A2F] shadow-sm">
              🔒 Pagamento aprovado via Pix
            </span>
          </div>

          <Bubble side="in" delay={2900} time="16:07">
            {"Pagamento confirmado! 💚 Seu pedido sai pra entrega ainda hoje — te aviso quando o motoboy estiver a caminho 🛵"}
          </Bubble>
        </div>

        {/* Input bar */}
        <div className="flex items-center gap-2 bg-[#ECE5DD] px-3 pb-4">
          <div className="flex h-9 flex-1 items-center rounded-full bg-white px-4 text-[12px] text-[#8696A0]">
            Mensagem
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#075E54] text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
              <path d="M3.4 20.4 21.2 12 3.4 3.6l-.01 6.53L14 12 3.39 13.87Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
