// Gate de drift schema × migrations (revisão 02/09): WaitlistLead/PetzImage viveram
// semanas só via `db push`. Compara o resultado das migrations com o schema.prisma; qualquer
// diferença sai com código ≠ 0. Precisa de um banco descartável (shadow) em
// SHADOW_DATABASE_URL ou, na falta, usa DATABASE_URL (na CI é o serviço Postgres).
import { execSync } from "node:child_process";

const shadow = process.env.SHADOW_DATABASE_URL ?? process.env.DATABASE_URL;
if (!shadow) {
  console.error("[check-migrations] defina SHADOW_DATABASE_URL ou DATABASE_URL");
  process.exit(1);
}
try {
  execSync(
    `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${shadow}" --exit-code`,
    { stdio: "inherit" }
  );
  console.log("[check-migrations] migrations e schema batem");
} catch (error) {
  console.error("[check-migrations] DRIFT: o schema.prisma tem mudanças sem migration (ou vice-versa)");
  process.exit(typeof error?.status === "number" ? error.status : 1);
}
