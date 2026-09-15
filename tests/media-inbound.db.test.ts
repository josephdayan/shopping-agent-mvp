// Áudio e foto ATRAVESSANDO o cérebro (14/09): o que o teste unitário não prova é o
// encaixe — dedupe, eco do que foi entendido, a conversa gravada dizendo a origem, e o
// texto derivado caindo no mesmo NLU de quem digitou.
import "./helpers/load-env";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { whatsappAdapter } from "../src/lib/adapters/whatsapp";
import { handleDeliveryMessage } from "../src/lib/delivery-service";
import { __setMediaDepsForTests } from "../src/lib/media-understanding";

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5501${String(Date.now()).slice(-6)}${String(process.pid).slice(-2)}`;
const TEST_ADDRESS = "Rua das Flores, 123, Bela Vista, São Paulo - SP";
let phoneSeq = 0;
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

function newPhone(): string {
  return `${PREFIX}${String(phoneSeq++).padStart(3, "0")}`.slice(0, 16);
}

async function returningCustomer(): Promise<string> {
  const phone = newPhone();
  await prisma.user.create({ data: { phone, cep: "01310-100", defaultAddress: TEST_ADDRESS } });
  return phone;
}

function said(phone: string, from: number): string {
  return outbox
    .slice(from)
    .filter((m) => m.to === phone)
    .map((m) => m.text)
    .join("\n---\n");
}

async function wipe() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const convos = await prisma.conversation.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const convoIds = convos.map((c) => c.id);
  if (convoIds.length) await prisma.message.deleteMany({ where: { conversationId: { in: convoIds } } });
  await prisma.deliveryOrder.deleteMany({ where: { userId: { in: ids } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    await wipe();
  } catch (error) {
    if (process.env.LIA_REQUIRE_DB === "1") throw error;
    dbOk = false;
    console.warn("⚠️  Banco indisponível — testes de mídia no cérebro serão pulados.");
  }
});

after(async () => {
  __setMediaDepsForTests(null);
  if (!dbOk) return;
  await wipe();
  await prisma.$disconnect();
});

test("áudio: a Lia ecoa o que ouviu e trata como pedido digitado", async (t) => {
  if (!dbOk) return t.skip();
  __setMediaDepsForTests({
    download: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/ogg" }),
    transcribe: async () => "me manda um sabonete"
  });
  const phone = await returningCustomer();
  const from = outbox.length;
  await handleDeliveryMessage({
    phone,
    text: "",
    messageId: `media_${RUN}_audio`,
    media: { kind: "audio", id: "m-audio-1", mimeType: "audio/ogg" }
  });
  const reply = said(phone, from);
  // Eco primeiro: transcrição erra, e o cliente tem que ver o que ela entendeu.
  assert.match(reply, /🎧 Ouvi:.*sabonete/i);
  // E o pedido seguiu de verdade — não parou no aviso de "só leio texto".
  assert.doesNotMatch(reply, /só consigo ler texto/i);
  assert.match(reply, /sabonete/i);

  // A conversa gravada diz que aquilo veio de áudio.
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  const convo = await prisma.conversation.findFirst({ where: { userId: user!.id }, select: { id: true } });
  const stored = await prisma.message.findFirst({
    where: { conversationId: convo!.id, sender: "user" },
    orderBy: { createdAt: "asc" }
  });
  assert.equal(stored?.text, "[áudio] me manda um sabonete");
});

test("re-entrega do mesmo áudio pela Meta não transcreve nem ecoa duas vezes", async (t) => {
  if (!dbOk) return t.skip();
  let transcriptions = 0;
  __setMediaDepsForTests({
    download: async () => ({ bytes: new Uint8Array([1]), mimeType: "audio/ogg" }),
    transcribe: async () => {
      transcriptions += 1;
      return "me manda um sabonete";
    }
  });
  const phone = await returningCustomer();
  const messageId = `media_${RUN}_retry`;
  const media = { kind: "audio" as const, id: "m-audio-2", mimeType: "audio/ogg" };
  await handleDeliveryMessage({ phone, text: "", messageId, media });
  const from = outbox.length;
  await handleDeliveryMessage({ phone, text: "", messageId, media });
  // Segunda entrega do MESMO wamid: nada de novo sai, e a OpenAI não é chamada de novo.
  assert.equal(said(phone, from), "");
  assert.equal(transcriptions, 1);
});

test("áudio que não dá pra entender avisa em vez de cair no 'só leio texto'", async (t) => {
  if (!dbOk) return t.skip();
  __setMediaDepsForTests({ download: async () => null });
  const phone = await returningCustomer();
  const from = outbox.length;
  await handleDeliveryMessage({
    phone,
    text: "",
    messageId: `media_${RUN}_fail`,
    media: { kind: "audio", id: "m-audio-3" }
  });
  assert.match(said(phone, from), /não consegui entender o áudio/i);
});

test("foto: pedido lido na etiqueta entra na cesta", async (t) => {
  if (!dbOk) return t.skip();
  __setMediaDepsForTests({
    download: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/jpeg" }),
    describe: async () => "sabonete"
  });
  const phone = await returningCustomer();
  const from = outbox.length;
  await handleDeliveryMessage({
    phone,
    text: "",
    messageId: `media_${RUN}_photo`,
    media: { kind: "image", id: "m-img-1", mimeType: "image/jpeg", caption: "acabou esse" }
  });
  const reply = said(phone, from);
  assert.match(reply, /📷 Na foto eu vi:.*sabonete/i);
  assert.match(reply, /sabonete/i);
});

test("figurinha (mídia que a Lia não lê) continua avisando o que ela aceita", async (t) => {
  if (!dbOk) return t.skip();
  __setMediaDepsForTests(null);
  const phone = await returningCustomer();
  const from = outbox.length;
  await handleDeliveryMessage({ phone, text: "", messageId: `media_${RUN}_sticker` });
  assert.match(said(phone, from), /texto, áudio e foto/i);
});
