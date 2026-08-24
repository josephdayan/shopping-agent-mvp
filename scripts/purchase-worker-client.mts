import os from "node:os";
import { execFileSync } from "node:child_process";

const command = process.argv[2] ?? "claim";
const baseUrl = (process.env.LIA_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://liadelivery.com.br").replace(/\/$/, "");
function localWorkerToken(): string | undefined {
  const configured = process.env.LIA_PURCHASE_WORKER_TOKEN?.trim();
  if (configured) return configured;
  if (process.platform !== "darwin") return undefined;
  try {
    return execFileSync("security", ["find-generic-password", "-a", "lia-purchase-worker", "-s", "Lia Purchase Worker", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
}
const token = localWorkerToken();
const workerId = (process.env.LIA_PURCHASE_WORKER_ID ?? `local-${os.hostname()}`).slice(0, 120);

if (!token) throw new Error("Configure LIA_PURCHASE_WORKER_TOKEN antes de iniciar o operador.");
if (command !== "claim") throw new Error(`Comando desconhecido: ${command}`);

const response = await fetch(`${baseUrl}/api/purchase-worker/claim`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ workerId })
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`A fila respondeu ${response.status}: ${JSON.stringify(payload)}`);
process.stdout.write(`${JSON.stringify({ workerId, ...payload }, null, 2)}\n`);
