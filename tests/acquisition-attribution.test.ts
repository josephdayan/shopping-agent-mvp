import "./helpers/load-env";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import {
  getAcquisitionSummary,
  latestAcquisitionTouchId,
  mergeAcquisition,
  recordAcquisitionTouch,
  stripAcquisitionTag
} from "../src/lib/acquisition";

const RUN = `${Date.now().toString(36)}${process.pid}`;
const PREFIX = `+5598${String(Date.now()).slice(-7)}`;
let dbOk = false;

async function wipe() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((user) => user.id);
  if (!ids.length) return;
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
    console.warn("Banco indisponível — teste DB de atribuição será pulado.");
  }
});

after(async () => {
  if (!dbOk) return;
  await wipe();
  await prisma.$disconnect();
});

test("tag de fallback sai do texto antes do NLU e complementa o referral", () => {
  const tagged = stripAcquisitionTag("Oi Lia! Quero fazer um pedido. [AD:sp01]");
  assert.deepEqual(tagged, { text: "Oi Lia! Quero fazer um pedido.", campaignCode: "SP01" });
  assert.deepEqual(mergeAcquisition({ source: "meta_ads", sourceId: "ad-123", ctwaClid: "click-1" }, tagged.campaignCode), {
    source: "meta_ads",
    sourceId: "ad-123",
    ctwaClid: "click-1",
    campaignCode: "SP01"
  });
  assert.equal(
    stripAcquisitionTag("2 coca cola\n1 shampoo\n1 sabonete").text,
    "2 coca cola\n1 shampoo\n1 sabonete",
    "atribuição não pode achatar lista encaminhada"
  );
  assert.equal(
    stripAcquisitionTag("2 coca cola\n1 shampoo [AD:SP01]\n1 sabonete").text,
    "2 coca cola\n1 shampoo\n1 sabonete",
    "a tag sai sem apagar as quebras"
  );
});

test("toque é idempotente, liga o pedido e entra no resumo de aquisição", async (t) => {
  if (!dbOk) return t.skip();
  const phone = `${PREFIX}${RUN.slice(-4)}`;
  const user = await prisma.user.create({ data: { phone } });
  const conversation = await prisma.conversation.create({ data: { userId: user.id } });
  const input = {
    conversationId: conversation.id,
    providerMessageId: `wamid.${RUN}`,
    acquisition: {
      source: "meta_ads" as const,
      campaignCode: "SP01",
      sourceType: "ad",
      sourceId: `ad-${RUN}`,
      ctwaClid: `click-${RUN}`
    }
  };
  const first = await recordAcquisitionTouch(input);
  const replay = await recordAcquisitionTouch({ ...input, acquisition: { ...input.acquisition, sourceId: "must-not-overwrite" } });
  assert.equal(replay.id, first.id);
  assert.equal(replay.sourceId, `ad-${RUN}`);
  assert.equal(await latestAcquisitionTouchId(conversation.id), first.id);

  await prisma.deliveryOrder.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      acquisitionTouchId: first.id,
      phone,
      items: [],
      total: 42.5,
      status: "paid",
      paidAt: new Date()
    }
  });

  const summary = await getAcquisitionSummary(7);
  const group = summary.groups.find((row) => row.key === "SP01");
  assert.ok(group);
  assert.equal(group.conversations, 1);
  assert.equal(group.orders, 1);
  assert.equal(group.paidOrders, 1);
  assert.equal(group.retainedRevenue, 42.5);

  const oldUser = await prisma.user.create({ data: { phone: `${PREFIX}${RUN.slice(-3)}9` } });
  const oldConversation = await prisma.conversation.create({ data: { userId: oldUser.id } });
  const oldTouch = await recordAcquisitionTouch({
    conversationId: oldConversation.id,
    providerMessageId: `wamid.old.${RUN}`,
    acquisition: { source: "message_code", campaignCode: "OLD" }
  });
  await prisma.acquisitionTouch.update({
    where: { id: oldTouch.id },
    data: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60_000) }
  });
  assert.equal(await latestAcquisitionTouchId(oldConversation.id), undefined, "clique velho não atribui recompra futura");
});
