// Converse com a Lia no terminal, sem WhatsApp — dirige handleDeliveryMessage exatamente
// como o webhook faz (banco real, telefone de teste +5500…, auto-limpo ao sair).
//
// Uso:
//   npx tsx scripts/talk-lia.mts                       # interativo (digite; /quit sai)
//   npx tsx scripts/talk-lia.mts "oi" "arroz e feijão" # turnos por argumento
//   OPENAI_API_KEY="" npx tsx scripts/talk-lia.mts …   # força o NLU determinístico (sem LLM)
//
// Por padrão usa a OPENAI_API_KEY do .env (paridade com produção).
import "./talk-env.mts";
import { createInterface } from "node:readline/promises";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage } from "../src/lib/delivery-service";

const PREFIX = "+5500992"; // faixa própria (evals usam +5500991) — sem colisão
const RUN = `${Date.now().toString(36)}${process.pid}`;
const phone = `${PREFIX}${String(Date.now()).slice(-7)}${String(process.pid % 1000).padStart(3, "0")}`.slice(0, 14);
let msgSeq = 0;

const outbox: string[] = [];
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (_to: string, text: string) => {
  outbox.push(text);
  return { provider: "talk", to: _to, text };
};
(whatsappAdapter as { sendMedia: unknown }).sendMedia = async (_to: string, text: string, mediaUrl?: string) => {
  outbox.push(`${text}${mediaUrl ? `\n[foto] ${mediaUrl}` : ""}`);
  return { provider: "talk", to: _to, text };
};

async function send(text: string): Promise<string[]> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone, text, messageId: `talk_${RUN}_${++msgSeq}` });
  return outbox.slice(start);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const convos = await prisma.conversation.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    const convoIds = convos.map((c) => c.id);
    await prisma.message.deleteMany({ where: { conversationId: { in: convoIds } } });
    await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
    await prisma.conversation.deleteMany({ where: { id: { in: convoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.waitlistLead.deleteMany({ where: { phone: { startsWith: PREFIX } } });
}

const GRAY = "\x1b[90m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

async function turn(text: string) {
  console.log(`\n${GREEN}🧑 você:${RESET} ${text}`);
  const replies = await send(text);
  if (!replies.length) console.log(`${GRAY}(sem resposta)${RESET}`);
  for (const r of replies) console.log(`${CYAN}🤖 lia:${RESET} ${r.split("\n").join(`\n        `)}`);
}

const llm = process.env.OPENAI_API_KEY ? "LLM (produção)" : "determinístico (sem LLM)";
console.log(`${GRAY}— conversa com a Lia · fone ${phone} · NLU: ${llm} · /quit sai —${RESET}`);

try {
  const args = process.argv.slice(2);
  if (args.length) {
    for (const t of args) await turn(t);
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const line = (await rl.question(`\n${GREEN}🧑 você:${RESET} `)).trim();
      if (!line || line === "/quit" || line === "/q") break;
      const replies = await send(line);
      if (!replies.length) console.log(`${GRAY}(sem resposta)${RESET}`);
      for (const r of replies) console.log(`${CYAN}🤖 lia:${RESET} ${r.split("\n").join(`\n        `)}`);
    }
    rl.close();
  }
} finally {
  await cleanup();
  await prisma.$disconnect();
  console.log(`${GRAY}— dados de teste limpos —${RESET}`);
}
