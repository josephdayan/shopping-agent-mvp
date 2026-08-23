import os from "node:os";

const command = process.argv[2] ?? "claim";
const baseUrl = (process.env.LIA_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const token = process.env.LIA_PURCHASE_WORKER_TOKEN?.trim();
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
