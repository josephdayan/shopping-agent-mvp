// Env do golden de busca: roster COMPLETO de produção (nenhuma vitrine desabilitada —
// o caso do carregador precisa da Pague Menos, que o load-env dos evals de conversa
// desliga), seeds em vez de busca ao vivo e SEM OpenAI (o teste unitário mede o piso
// determinístico; a camada de IA é medida por scripts/eval-search.mts).
//
// Importar ANTES de qualquer módulo de stores: o registry é montado no import.
// Seguro porque o node --test roda cada arquivo em processo próprio.
process.env.OPENAI_API_KEY = "";
process.env.WHATSAPP_PROVIDER = "mock";
process.env.LIA_RETAILER_TEST_SEED = "true";
process.env.LIA_SEND_PHOTOS = "false";
// 25/09/2026: em produção só as lojas que fecham por API ficam ligadas por padrão. O golden
// mede o BUSCADOR sobre o roster completo (18 vitrines), então liga tudo explicitamente aqui.
for (const store of ["CARREFOUR", "OBA", "PETZ", "BOTICARIO", "DECATHLON", "SWIFT", "KALUNGA", "RIHAPPY", "CACAUSHOW", "KOPENHAGEN", "DROGARAIA", "DROGARIASP", "PAGUEMENOS", "DIVVINO", "IMIGRANTES", "NATURALDATERRA", "COBASI", "GIULIANAFLORES"]) {
  process.env[`LIA_ENABLE_${store}`] = "true";
}
