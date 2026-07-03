// Onde a Lia entrega HOJE. Cobertura é DADO, não código: o piloto é São Paulo capital,
// mas você amplia por env (sem deploy) conforme a operação chega em novas regiões. Puro e
// unit-testado (sem DB, sem rede). O cérebro chama checkCoverage() logo depois de resolver
// o CEP; se estiver fora da área, grava um lead na lista de espera em vez de aceitar um
// pedido pago que não consegue entregar.
//
// Config por env (todas opcionais):
//   LIA_COVERAGE_PRESET        — fase de cobertura: "capital" (default) | "grande-sp".
//                                Escolhe cidades+prefixos+label de uma vez; as envs abaixo
//                                sobrepõem campo a campo.
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

// Presets de cobertura em código: escolher a fase inteira por UMA env (LIA_COVERAGE_PRESET)
// em vez de colar uma lista gigante de cidades. Precedência campo-a-campo: env explícita
// (LIA_COVERAGE_CITIES/CEP_PREFIXES/LABEL) > preset > default. Interior depois = +1 preset.
type CoveragePreset = { cities: string[]; cepPrefixes: string[]; label: string };

const PRESETS: Record<string, CoveragePreset> = {
  capital: {
    cities: ["São Paulo"],
    cepPrefixes: ["01", "02", "03", "04", "05", "08"],
    label: "São Paulo capital"
  },
  // 39 municípios da Região Metropolitana de São Paulo (RMSP).
  "grande-sp": {
    cities: [
      "São Paulo", "Guarulhos", "Osasco", "Barueri", "Carapicuíba", "Cotia", "Taboão da Serra",
      "Embu das Artes", "Itapecerica da Serra", "Santo André", "São Bernardo do Campo",
      "São Caetano do Sul", "Diadema", "Mauá", "Ribeirão Pires", "Rio Grande da Serra",
      "Mogi das Cruzes", "Suzano", "Poá", "Ferraz de Vasconcelos", "Itaquaquecetuba", "Arujá",
      "Santa Isabel", "Guararema", "Biritiba Mirim", "Salesópolis", "Caieiras", "Franco da Rocha",
      "Francisco Morato", "Mairiporã", "Cajamar", "Jandira", "Itapevi", "Pirapora do Bom Jesus",
      "Santana de Parnaíba", "Vargem Grande Paulista", "Embu-Guaçu", "Juquitiba", "São Lourenço da Serra"
    ],
    // CEPs 0xxxx-xxx = capital + Grande SP; o interior de SP começa em 1xxxx. Fallback só
    // quando o ViaCEP cai; a guarda de frete (freight-guard.ts) é quem decide entregabilidade.
    cepPrefixes: ["0"],
    label: "São Paulo e região (Grande SP)"
  }
};

function activePreset(): CoveragePreset {
  const key = (process.env.LIA_COVERAGE_PRESET ?? "capital").trim().toLowerCase();
  const preset = PRESETS[key];
  if (!preset) {
    console.warn(`[coverage] preset desconhecido "${key}" — usando "capital"`);
    return PRESETS.capital;
  }
  return preset;
}

// Tolera "Cidade/UF" e "Cidade" — só a cidade importa pro match hoje (piloto é 1 estado).
function coveredCities(): Set<string> {
  const cities = process.env.LIA_COVERAGE_CITIES ? process.env.LIA_COVERAGE_CITIES.split(",") : activePreset().cities;
  return new Set(cities.map((c) => normalizeCity(c.split("/")[0])).filter(Boolean));
}

function coveredPrefixes(): string[] {
  const list = process.env.LIA_COVERAGE_CEP_PREFIXES ? process.env.LIA_COVERAGE_CEP_PREFIXES.split(",") : activePreset().cepPrefixes;
  return list.map((p) => p.replace(/\D/g, "")).filter(Boolean);
}

export function coverageLabel(): string {
  return process.env.LIA_COVERAGE_LABEL ?? activePreset().label;
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
