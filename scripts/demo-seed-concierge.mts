// TEMP demo helper: seeds one concierge order in awaiting_operator_quote so the /ops
// walkthrough has something to quote. Mock WhatsApp, no real send. Delete after the demo.
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env */
}
process.env.WHATSAPP_PROVIDER = "mock";
process.env.OPENAI_API_KEY = "";
process.env.LIA_MANUAL_CONCIERGE = "true";

const { prisma } = await import("../src/lib/prisma");
const { handleDeliveryMessage } = await import("../src/lib/delivery-service");

const phone = `+5500${String(Date.now()).slice(-8)}`;
await prisma.user.create({
  data: {
    phone,
    name: "Cliente Demo",
    cep: "01310-100",
    defaultAddress: "Rua das Flores, 123, Bela Vista, São Paulo - SP"
  }
});
await handleDeliveryMessage({ phone, text: "um carregador de iphone e 2 cadernos universitários", messageId: `demo1_${Date.now()}` });
await handleDeliveryMessage({ phone, text: "só isso", messageId: `demo2_${Date.now()}` });

const order = await prisma.deliveryOrder.findFirst({
  where: { phone, status: "awaiting_operator_quote" },
  orderBy: { createdAt: "desc" }
});
console.log(JSON.stringify({ phone, orderId: order?.id, status: order?.status, items: order?.items }, null, 2));
await prisma.$disconnect();
