// Caso real do dono em 15/09: em 09/09 ele pediu "relógio" e a lista de opções ficou
// pendente (a resposta falhou na Meta). Seis dias depois, "quero ração úmida whiskas"
// devolveu as opções VELHAS de relógio, porque cada "ops" (atalho do painel, que não toca
// no contexto) renovava o relógio de inatividade de 30 min. Regra nova: escolha pendente
// vence por idade absoluta (LIA_PENDING_TTL_MS), independente de atividade.
import "./helpers/load-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage } from "../src/lib/delivery-service";

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5505${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const TEST_ADDRESS = "Rua das Flores, 123, Bela Vista, São Paulo - SP";
let seq = 0;
let dbOk = false;
const outbox: { to: string; text: string }[] = [];
(whatsappAdapter as { sendMessage: unknown }).sendMessage = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};
(whatsappAdapter as { sendMedia: unknown }).sendMedia = async (to: string, text: string) => {
  outbox.push({ to, text });
  return { provider: "test", to, text };
};
async function send(phone: string, text: string): Promise<string> {
  const start = outbox.length;
  await handleDeliveryMessage({ phone, text, messageId: `pt_${RUN}_${++seq}` });
  return outbox.slice(start).filter((m) => m.to === phone).map((m) => m.text).join("\n");
}
async function wipe() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  await prisma.message.deleteMany({ where: { conversation: { userId: { in: ids } } } });
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
before(async () => {
  try {
    await prisma.$queryRaw`select 1`;
    dbOk = true;
    await wipe();
  } catch (error) {
    if (process.env.LIA_REQUIRE_DB) throw error;
  }
});
after(async () => {
  if (dbOk) await wipe();
  await prisma.$disconnect();
});
async function customer(): Promise<string> {
  const phone = `${PREFIX}${String(seq).padStart(4, "0")}`;
  await prisma.user.create({ data: { phone, cep: "01229-000", defaultAddress: TEST_ADDRESS } });
  return phone;
}

test("escolha pendente de dias atrás não volta: pedido novo busca o item novo", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  // No ambiente de teste os catálogos são os locais: desodorante (Drogaria SP) rende opções.
  const first = await send(phone, "quero um desodorante masculino");
  assert.match(first, /desodorante/i);
  const convo = await prisma.conversation.findFirstOrThrow({ where: { user: { phone } } });
  const ctx = JSON.parse(String(convo.context)) as Record<string, unknown>;
  assert.ok(Array.isArray(ctx.pending) && (ctx.pending as unknown[]).length, "há escolha pendente");
  assert.equal(typeof ctx.pendingSince, "number", "writeCtx carimba pendingSince");
  // Envelhece a pendência em 6 dias, mas mantém a conversa "ativa" (mensagem recente):
  // é exatamente o cenário do "ops" do dono.
  await prisma.conversation.update({ where: { id: convo.id }, data: { context: JSON.stringify({ ...ctx, pendingSince: Date.now() - 6 * 86_400_000 }) } });
  const reply = await send(phone, "quero sabonete");
  assert.doesNotMatch(reply, /desodorante/i, "opções velhas não são reenviadas");
  assert.match(reply, /sabonete/i, "o pedido novo é atendido");
});
