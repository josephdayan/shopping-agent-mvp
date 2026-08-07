// Bootstrap de env do talk-lia: carrega o .env como produção (LLM LIGADO se houver
// OPENAI_API_KEY), mas trava o que NUNCA pode ser real numa conversa de teste.
// Diferente de tests/helpers/load-env, que pina OPENAI_API_KEY="" pra determinismo.
// `OPENAI_API_KEY="" npx tsx scripts/talk-lia.mts` continua forçando o modo sem LLM
// (env explícita do caller vence o .env).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

try {
  // __dirname não existe em ESM (.mts): a versão antiga lançava aqui e o catch engolia —
  // o .env nunca era carregado e o talk-lia rodava sem LLM mesmo com chave configurada.
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  // sem .env — o script falha alto na conexão com o banco
}

process.env.WHATSAPP_PROVIDER = "mock"; // jamais Twilio real aqui
process.env.LIA_SEND_PHOTOS = "false";
