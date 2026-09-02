// Aplica as migrations pendentes no build de PRODUÇÃO da Vercel (revisão 02/09): a
// migration deixa de ser aplicada à mão. Preview e builds locais não tocam no banco.
// Falha de migration derruba o build — melhor que publicar código que espera uma
// coluna/tabela que não existe.
import { execSync } from "node:child_process";

const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
if (!isVercelProduction) {
  console.log("[migrate-on-build] não é build de produção na Vercel — pulando migrate deploy");
  process.exit(0);
}
if (!process.env.DIRECT_URL) {
  console.error("[migrate-on-build] DIRECT_URL ausente — não dá para aplicar migrations");
  process.exit(1);
}
execSync("npx prisma migrate deploy", { stdio: "inherit" });
