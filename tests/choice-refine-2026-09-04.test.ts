// Conversa real do dono em 04/09 (desodorante): (1) texto que discrimina entre as opções
// NUNCA escolhe sozinho — estreita e espera o botão/número; (2) refino sem match à
// risca ("quero do grande") busca com a frase inteira e mostra o mais perto.
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
  await handleDeliveryMessage({ phone, text, messageId: `cr_${RUN}_${++seq}` });
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
const optionLines = (reply: string) => reply.split("\n").filter((l) => /^\*\d\)\*/.test(l));

test("nome que bate em UMA opção estreita para ela e espera o botão/número — não escolhe sozinho", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  const first = await send(phone, "arroz");
  const lines = optionLines(first);
  assert.ok(lines.length >= 2, first);
  const target = lines.find((l) => /Tio João/i.test(l));
  assert.ok(target, `sem Tio João nas opções: ${lines.join(" | ")}`);
  const narrowed = await send(phone, "tio joao");
  assert.match(narrowed, /Ficou entre essas de \*arroz\*/, narrowed.slice(0, 300));
  assert.equal(optionLines(narrowed).length, 1, narrowed);
  assert.doesNotMatch(narrowed, /Quantas unidades|Adicionei|adicionei|coloquei/i, `escolheu sozinho: ${narrowed.slice(0, 300)}`);
  const convo = await prisma.conversation.findFirst({ where: { user: { phone } }, orderBy: { updatedAt: "desc" } });
  const ctx = JSON.parse(convo?.context ?? "{}") as { step?: string; basket?: unknown[] };
  assert.equal(ctx.step, "choosing");
  assert.equal(ctx.basket?.length ?? 0, 0);
});

test("refino sem match à risca ('quero do grande') busca com a frase inteira e mostra o mais perto", async (t) => {
  if (!dbOk) return t.skip();
  const phone = await customer();
  await send(phone, "arroz");
  const refined = await send(phone, "quero do grande");
  assert.match(refined, /Não achei exatamente \*grande\*\. O mais perto que tenho:/, refined.slice(0, 300));
  assert.ok(optionLines(refined).length >= 1, refined);
  const convo = await prisma.conversation.findFirst({ where: { user: { phone } }, orderBy: { updatedAt: "desc" } });
  const ctx = JSON.parse(convo?.context ?? "{}") as { step?: string; pending?: Array<{ query: string }> };
  assert.equal(ctx.step, "choosing");
  assert.equal(ctx.pending?.[0]?.query, "arroz grande");
});
