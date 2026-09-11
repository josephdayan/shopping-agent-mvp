// Gate de drift schema × migrations (revisão 02/09): WaitlistLead/PetzImage viveram
// semanas só via `db push`. Compara o resultado das migrations com o schema.prisma; qualquer
// diferença sai com código ≠ 0. Precisa de um banco descartável (shadow) em
// SHADOW_DATABASE_URL ou TEST_DATABASE_URL. Nunca usar DATABASE_URL como fallback.
import { spawnSync } from "node:child_process";

const shadow = process.env.SHADOW_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!shadow) {
  console.error("[check-migrations] defina SHADOW_DATABASE_URL ou TEST_DATABASE_URL para um banco descartável; DATABASE_URL nunca é fallback.");
  process.exit(1);
}
try {
  const result = spawnSync("npx", ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema-datamodel", "prisma/schema.prisma", "--shadow-database-url", shadow, "--exit-code"], { stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error("Falha na verificação do banco descartável");
  console.log("[check-migrations] migrations e schema batem");
} catch (error) {
  console.error("[check-migrations] DRIFT: o schema.prisma tem mudanças sem migration (ou vice-versa)");
  process.exit(typeof error?.status === "number" ? error.status : 1);
}
