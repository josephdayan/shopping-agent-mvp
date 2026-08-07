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
