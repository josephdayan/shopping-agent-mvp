// Suíte contra um Postgres LOCAL embutido (revisão 02/09): nunca mais teste no banco de
// produção. Sem Docker nem instalação no sistema — `embedded-postgres` baixa o binário
// como dev dependency. Uso:
//   npm run test:local                      # suíte inteira
//   npm run test:local -- tests/x.test.ts   # arquivos específicos
// O cluster fica em .local-pg/ (gitignored) e persiste entre execuções; o banco `lia_test`
// é recriado a cada run pra começar limpo. Antes dos testes: `prisma migrate deploy` e o
// gate de drift schema × migrations (scripts/check-migrations.mjs).
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.LIA_LOCAL_PG_PORT ?? 54329);
const DIR = join(process.cwd(), ".local-pg", "data");
const DB = "lia_test";
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}?schema=public`;

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: true
});

function run(cmd: string, args: string[], extraEnv: Record<string, string>) {
  const result = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  return result.status ?? 1;
}

async function main() {
  const files = process.argv.slice(2);
  const fresh = !existsSync(join(DIR, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  let exit = 1;
  try {
    // Banco limpo a cada run: os testes assumem tabelas vazias de dados seus.
    try {
      await pg.dropDatabase(DB);
    } catch {
      /* não existia */
    }
    await pg.createDatabase(DB);
    const env = { DATABASE_URL: URL, DIRECT_URL: URL, TEST_DATABASE_URL: URL, TEST_DIRECT_URL: URL, LIA_REQUIRE_DB: "1", LIA_RETAILER_TEST_SEED: "true" };
    console.log(`[test-local-db] postgres local em ${URL}`);
    if (run("npx", ["prisma", "migrate", "deploy"], env) !== 0) throw new Error("migrate deploy falhou");
    if (run("node", ["scripts/check-migrations.mjs"], { ...env, SHADOW_DATABASE_URL: URL }) !== 0) {
      throw new Error("drift entre schema.prisma e migrations");
    }
    const testFiles = files.length
      ? files
      : readdirSync("tests").filter((f) => f.endsWith(".test.ts")).map((f) => join("tests", f));
    exit = run("node", ["--import", "tsx", "--test", ...testFiles], env);
  } finally {
    await pg.stop();
  }
  process.exit(exit);
}

main().catch((error) => {
  console.error("[test-local-db]", error instanceof Error ? error.message : error);
  pg.stop().finally(() => process.exit(1));
});
