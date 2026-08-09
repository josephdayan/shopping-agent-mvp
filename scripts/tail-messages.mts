// Lê do banco as últimas mensagens REAIS (todas as conversas), para diagnosticar
// produção sem depender do retention de runtime log da Vercel (Hobby = 1h!).
// Só leitura; não envia nada.
//
// Uso:
//   npx tsx scripts/tail-messages.mts               # últimas 48h (máx. 60 msgs)
//   npx tsx scripts/tail-messages.mts 2026-08-07    # desde uma data ISO
import "./talk-env.mts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const since = arg ? new Date(arg) : new Date(Date.now() - 48 * 60 * 60 * 1000);
  const messages = await prisma.message.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 60,
    include: { conversation: { select: { userId: true } } }
  });
  console.log(`mensagens desde ${since.toISOString()}: ${messages.length}`);
  for (const m of messages) {
    const text = m.text.replace(/\s+/g, " ").slice(0, 110);
    console.log(`${m.createdAt.toISOString()} [${m.sender}] ${text}`);
  }
  await prisma.$disconnect();
}

main();
