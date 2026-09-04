// 04/09: o dono não conseguia abrir o /ops ("buscar OPS_TOKEN na Vercel é horrível").
// Operador manda "ops" pra Lia e recebe o link de login; cliente comum não recebe.
import "./helpers/load-env";
const OPERATOR = `+5508${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}00`;
process.env.LIA_OPERATOR_PHONE = OPERATOR;
process.env.OPS_TOKEN = "e2e-ops-token";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage } from "../src/lib/delivery-service";
import { verifyOpsLoginToken } from "../src/lib/auth";

const CUSTOMER = OPERATOR.slice(0, -2) + "77";
const RUN = `${Date.now().toString(36)}${process.pid}`;
let msgSeq = 0;
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
  await handleDeliveryMessage({ phone, text, messageId: `ol_${RUN}_${++msgSeq}` });
  return outbox.slice(start).filter((m) => m.to === phone).map((m) => m.text).join("\n---\n");
}

async function wipe() {
  const users = await prisma.user.findMany({ where: { phone: { in: [OPERATOR, CUSTOMER] } }, select: { id: true } });
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

test("operador manda 'ops' e recebe link de login válido; 'painel' também", async (t) => {
  if (!dbOk) return t.skip();
  const reply = await send(OPERATOR, "ops");
  const url = reply.match(/https:\/\/\S+\/api\/ops\/login\?login=([^\s]+)/);
  assert.ok(url, reply);
  assert.equal(verifyOpsLoginToken(decodeURIComponent(url![1])), true);
  assert.match(reply, /10 minutos/);
  assert.match(await send(OPERATOR, "Painel"), /\/api\/ops\/login\?login=/);
});

test("cliente comum mandando 'ops' não recebe link", async (t) => {
  if (!dbOk) return t.skip();
  const reply = await send(CUSTOMER, "ops");
  assert.ok(reply.length > 0, "cliente sempre recebe alguma resposta");
  assert.doesNotMatch(reply, /\/api\/ops\/login/);
});
