// Onde a Lia entrega HOJE. Cobertura é DADO, não código: o piloto é São Paulo capital,
// mas você amplia por env (sem deploy) conforme a operação chega em novas regiões. Puro e
// unit-testado (sem DB, sem rede). O cérebro chama checkCoverage() logo depois de resolver
// o CEP; se estiver fora da área, grava um lead na lista de espera em vez de aceitar um
// pedido pago que não consegue entregar.
//
// Config por env (todas opcionais):
//   LIA_COVERAGE_CITIES        — cidades atendidas, separadas por vírgula (acento/caixa
//                                ignorados). Ex.: "São Paulo, Osasco, Santo André".
//                                Default: "São Paulo".
//   LIA_COVERAGE_CEP_PREFIXES  — prefixos de CEP usados SÓ como rede de segurança quando
//                                a cidade não pôde ser resolvida (ViaCEP fora do ar).
//                                Default: "01,02,03,04,05,08" (SP capital).
//   LIA_COVERAGE_LABEL         — nome da área, usado na mensagem ao cliente.
//                                Default: "São Paulo capital".
//   LIA_COVERAGE_OFF=true      — desliga a trava (tudo vira coberto). Kill-switch/testes.

export type CoverageInput = { cep?: string; city?: string; uf?: string };
export type CoverageResult = { covered: boolean; city?: string; uf?: string };

export function normalizeCity(s?: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Tolera "Cidade/UF" e "Cidade" — só a cidade importa pro match hoje (piloto é 1 estado).
function coveredCities(): Set<string> {
  const raw = process.env.LIA_COVERAGE_CITIES ?? "São Paulo";
  return new Set(
    raw
      .split(",")
      .map((c) => normalizeCity(c.split("/")[0]))
      .filter(Boolean)
  );
}

function coveredPrefixes(): string[] {
  const raw = process.env.LIA_COVERAGE_CEP_PREFIXES ?? "01,02,03,04,05,08";
  return raw
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean);
}

export function coverageLabel(): string {
  return process.env.LIA_COVERAGE_LABEL ?? "São Paulo capital";
}

export function checkCoverage(input: CoverageInput): CoverageResult {
  const uf = input.uf ? input.uf.toUpperCase() : undefined;
  if (process.env.LIA_COVERAGE_OFF === "true") return { covered: true, city: input.city, uf };

  const city = normalizeCity(input.city);
  if (city) {
    // Cidade conhecida (ViaCEP respondeu) = sinal autoritativo.
    return { covered: coveredCities().has(city), city: input.city, uf };
  }

  // Cidade desconhecida (ViaCEP fora do ar) → rede de segurança por prefixo de CEP.
  const digits = (input.cep ?? "").replace(/\D/g, "");
  if (digits.length === 8) {
    return { covered: coveredPrefixes().some((p) => digits.startsWith(p)), uf };
  }

  // Sem cidade e sem CEP usável: fail-open — o operador vê o pedido e pega o caso raro,
  // mesmo espírito do "falha de rede → salva e segue" que o cérebro já usa no ViaCEP.
  return { covered: true, uf };
}
