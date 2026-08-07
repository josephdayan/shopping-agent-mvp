// Placar da busca de produtos — roda o GOLDEN SET (tests/helpers/search-golden.ts)
// pelo pipeline completo: extração por IA (quando o caso traz a mensagem crua) →
// candidatos largos em todas as vitrines → rerank por IA → veredito por caso.
//
// É a ferramenta de iteração MEDIDA: toda busca ruim reportada vira um caso no golden;
// mudou prompt/scorer/catálogo, roda isto e compara o placar antes de ir pra prod.
//
//   npx tsx scripts/eval-search.mts             # pipeline completo (precisa OPENAI_API_KEY no .env)
//   OPENAI_API_KEY= npx tsx scripts/eval-search.mts   # só o determinístico (mesmo piso do npm test)
//
// Colunas: DET = pipeline determinístico (sem IA) · IA = com extração+rerank.
// O unit test tests/search-golden.test.ts trava os casos `deterministic: true` no CI;
// aqui mede-se o conjunto INTEIRO, inclusive os casos que só a IA resolve.
import "./talk-env.mts";

import { gatherCrossStoreCandidates } from "../src/lib/stores";
import { conciergeMatchIsStrong, diversifyOptions, normalizeText } from "../src/lib/stores/types";
import { extractShoppingList, rerankShoppingOptions } from "../src/lib/adapters/ai";
import { GOLDEN_CASES, type GoldenCase } from "../tests/helpers/search-golden";

process.env.LIA_RETAILER_TEST_SEED = process.env.LIA_RETAILER_TEST_SEED ?? "true";

type Verdict = { pass: boolean; shown: string[]; detail?: string };

function judge(c: GoldenCase, shown: string[]): Verdict {
  if (c.none) {
    return shown.length === 0
      ? { pass: true, shown }
      : { pass: false, shown, detail: `esperava linha livre, mostrou: ${shown[0]}` };
  }
  if (!shown.length) return { pass: false, shown, detail: "nenhuma opção mostrada" };
  if (c.top1Include && !c.top1Include.test(shown[0])) return { pass: false, shown, detail: `1ª opção: ${shown[0]}` };
  if (c.top1Exclude && c.top1Exclude.test(shown[0])) return { pass: false, shown, detail: `1ª opção proibida: ${shown[0]}` };
  if (c.allExclude) {
    const bad = shown.find((name) => c.allExclude!.test(name));
    if (bad) return { pass: false, shown, detail: `opção proibida: ${bad}` };
  }
  return { pass: true, shown };
}

// Espelho do fallback determinístico do buildChoices do concierge (candidatos largos →
// diversifica → piso). Se mudar lá, mude aqui e no unit test.
async function deterministicShown(query: string): Promise<string[]> {
  const candidates = await gatherCrossStoreCandidates(query, 12);
  const top3 = diversifyOptions(query, candidates.map((c) => c.item), 3);
  return top3.filter((item) => conciergeMatchIsStrong(query, item)).map((item) => normalizeText(item.name));
}

// Pipeline com IA: extração (se houver mensagem crua) → candidatos → rerank.
async function aiShown(c: GoldenCase): Promise<{ shown: string[]; usedAi: boolean }> {
  let query = c.query;
  let usedAi = false;
  if (c.message) {
    const extraction = await extractShoppingList(c.message);
    if (extraction?.items.length) {
      query = extraction.items[0].query;
      usedAi = true;
    }
  }
  const candidates = await gatherCrossStoreCandidates(query, 12);
  if (!candidates.length) return { shown: [], usedAi };
  const rerank = await rerankShoppingOptions(c.message ?? query, [
    {
      query,
      candidates: candidates.map((cand) => ({
        sku: cand.item.sku,
        name: cand.item.name,
        brand: cand.item.brand,
        price: cand.item.unitPrice,
        store: cand.store.label
      }))
    }
  ]);
  if (!rerank) {
    // IA off/falhou: mesmo fallback do produto.
    const top3 = diversifyOptions(query, candidates.map((cand) => cand.item), 3);
    return { shown: top3.filter((item) => conciergeMatchIsStrong(query, item)).map((i) => normalizeText(i.name)), usedAi };
  }
  const bySku = new Map(candidates.map((cand) => [cand.item.sku, cand.item]));
  return {
    shown: rerank.lines[0].skus.map((sku) => normalizeText(bySku.get(sku)!.name)),
    usedAi: true
  };
}

async function main() {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  console.log(`Golden de busca: ${GOLDEN_CASES.length} casos · IA ${hasKey ? "LIGADA" : "DESLIGADA (só determinístico)"}\n`);

  let detPass = 0;
  let aiPass = 0;
  let aiRan = 0;
  const failures: string[] = [];

  for (const c of GOLDEN_CASES) {
    const det = judge(c, await deterministicShown(c.query));
    if (det.pass) detPass++;

    let aiCol = "  —  ";
    if (hasKey) {
      const { shown } = await aiShown(c);
      const ai = judge(c, shown);
      aiRan++;
      if (ai.pass) aiPass++;
      aiCol = ai.pass ? " ok  " : "FALHA";
      if (!ai.pass) failures.push(`  IA  · ${c.name}\n        ${ai.detail ?? ""}`);
    }
    if (!det.pass && c.deterministic) failures.push(`  DET · ${c.name}\n        ${det.detail ?? ""}`);

    const detCol = det.pass ? " ok  " : c.deterministic ? "FALHA" : "  ×  ";
    console.log(` DET[${detCol}] IA[${aiCol}] ${c.name}`);
  }

  console.log(`\nPlacar: determinístico ${detPass}/${GOLDEN_CASES.length}${hasKey ? ` · com IA ${aiPass}/${aiRan}` : ""}`);
  console.log(`(× = caso que o determinístico não cobre por desenho — só a IA resolve)`);
  if (failures.length) {
    console.log(`\nFalhas que importam:\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
}

main();
