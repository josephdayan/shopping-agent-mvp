// Monitor local read-only; usa a mesma DATABASE_URL do projeto. Não cobra, cria jobs
// ou envia WhatsApp. O resumo não expõe endereço, telefone, email ou dados de cartão.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { prisma } = await import("../src/lib/prisma");
const { monitorAllOrders, inspectMonitoredOrder, compactMonitorReport } = await import("../src/lib/order-monitor");
try {
  const [command = "monitor", reference] = process.argv.slice(2);
  if (command !== "monitor" && command !== "inspect") throw new Error("Comando inválido.");
  const result = command === "inspect"
    ? await inspectMonitoredOrder(reference ?? "")
    : compactMonitorReport(await monitorAllOrders());
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  // Não despejar mensagens do driver/URL de conexão em logs da automação.
  console.error("Não foi possível consultar os pedidos. Verifique acesso ao banco e o ID informado; isto NÃO significa fila vazia.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
