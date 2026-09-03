// Verificação AO VIVO antes dos cards (03/09/2026). Regra do dono depois do chá pago sem
// estoque: "se ele quer um chá, tem que dar em um lugar que tenha chá, que esteja
// disponível e que chegue rápido". Antes de mostrar opções, cada candidato de loja com
// checkout consultável é simulado no site da própria loja para o CEP do cliente:
// sem estoque ou sem entrega no endereço → sai da vitrine; disponível → carrega o prazo
// REAL daquele CEP (o que a regra de 17/08 exige para mostrar prazo). Lojas que não
// permitem consulta ficam como "não verificadas" e vão para o operador na cotação.
//
// Puro: recebe a função de simulação (injetável nos testes) e nunca lança — falha de
// rede mantém os candidatos como estavam (não inventa indisponibilidade).
import { liveCheckSupported, liveItemAvailability, type LiveItemCheck } from "./live-freight";

export type LiveCandidate = { storeKey: string; sku: string };
export type Simulate = (storeKey: string, skus: string[], cep: string) => Promise<Map<string, LiveItemCheck> | null>;

export function liveKey(storeKey: string, sku: string): string {
  return `${storeKey}:${sku}`;
}

export async function checkCandidatesLive<T extends LiveCandidate>(
  candidates: T[],
  cep: string | null | undefined,
  simulate: Simulate = liveItemAvailability,
  supported: (storeKey: string) => boolean = liveCheckSupported
): Promise<{ kept: T[]; dropped: T[]; checks: Map<string, LiveItemCheck> }> {
  const checks = new Map<string, LiveItemCheck>();
  if (!cep || !candidates.length) return { kept: candidates, dropped: [], checks };

  const byStore = new Map<string, T[]>();
  for (const candidate of candidates) {
    if (!supported(candidate.storeKey)) continue;
    byStore.set(candidate.storeKey, [...(byStore.get(candidate.storeKey) ?? []), candidate]);
  }
  await Promise.all(
    [...byStore].map(async ([storeKey, list]) => {
      const skus = [...new Set(list.map((c) => c.sku))].slice(0, 12);
      try {
        const result = await simulate(storeKey, skus, cep);
        if (!result) return; // loja não respondeu → desconhecido, mantém
        for (const [sku, check] of result) checks.set(liveKey(storeKey, sku), check);
      } catch {
        /* desconhecido, mantém */
      }
    })
  );

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const candidate of candidates) {
    const check = checks.get(liveKey(candidate.storeKey, candidate.sku));
    if (check && !check.available) dropped.push(candidate);
    else kept.push(candidate);
  }
  // Confirmado pela loja vem antes do não-verificável; entre confirmados, o que chega
  // antes vem primeiro. Estável: quem empata mantém a ordem de relevância.
  kept.sort((a, b) => {
    const ca = checks.get(liveKey(a.storeKey, a.sku));
    const cb = checks.get(liveKey(b.storeKey, b.sku));
    const va = ca?.available ? 1 : 0;
    const vb = cb?.available ? 1 : 0;
    if (va !== vb) return vb - va;
    return (ca?.etaMinutes ?? Number.MAX_SAFE_INTEGER) - (cb?.etaMinutes ?? Number.MAX_SAFE_INTEGER);
  });
  return { kept, dropped, checks };
}
