// The most common everyday Carrefour requests, used by the prewarm cron to keep the
// cache hot so these answer INSTANTLY in chat (the long-tail is scraped on demand,
// then cached). Mostly generic terms (how people ask) + a few top brands. Edit freely.
export const CARREFOUR_QUERIES: string[] = [
  // Campeões do dia a dia — aquecidos primeiro (o cron pega na ordem da lista).
  "papel higiênico", "creme dental", "café", "arroz", "feijão", "açúcar", "leite",
  "coca cola", "guaraná", "refrigerante", "sabão em pó", "detergente", "shampoo",
  "fralda", "ração para cachorro", "água", "óleo de soja", "macarrão", "sabonete", "desodorante",
  // Higiene
  "creme dental", "creme dental colgate", "escova de dente", "fio dental", "enxaguante bucal",
  "shampoo", "condicionador", "sabonete", "sabonete líquido", "desodorante", "desodorante rexona",
  "papel higiênico", "absorvente", "lâmina de barbear", "cotonete", "algodão", "fralda geriátrica",
  // Bebê
  "fralda", "fralda pampers", "fralda huggies", "lenço umedecido", "pomada para assadura", "shampoo infantil",
  // Limpeza
  "detergente", "sabão em pó", "sabão líquido", "amaciante", "água sanitária", "desinfetante",
  "limpador multiuso", "esponja de aço", "esponja de louça", "papel toalha", "saco de lixo", "álcool",
  "pano de chão", "lustra móveis", "inseticida",
  // Mercearia
  "arroz", "feijão", "açúcar", "café", "óleo de soja", "azeite", "sal", "farinha de trigo",
  "macarrão", "molho de tomate", "extrato de tomate", "leite", "leite em pó", "leite condensado",
  "creme de leite", "achocolatado", "nescau", "aveia", "granola", "mel", "vinagre", "maionese",
  "ketchup", "mostarda", "ovos", "fermento", "milho de pipoca", "atum em lata", "sardinha em lata",
  "ervilha", "milho em lata", "gelatina", "pudim",
  // Padaria / matinais
  "pão de forma", "pão de queijo", "biscoito", "bolacha recheada", "torrada", "cereal matinal",
  "geleia", "margarina", "requeijão",
  // Snacks / doces
  "chocolate", "bombom", "salgadinho", "batata chips", "amendoim", "bala", "chiclete", "pipoca",
  // Bebidas
  "refrigerante", "coca cola", "guaraná", "suco", "suco de uva", "água", "água com gás",
  "energético", "isotônico", "cerveja", "chá gelado", "água de coco",
  // Café da manhã / laticínios
  "iogurte", "queijo", "presunto", "manteiga", "danoninho",
  // Pet
  "ração para cachorro", "ração para gato", "areia para gato", "petisco para cachorro",
  "tapete higiênico", "shampoo para cachorro",
  // Conveniência / casa
  "pilha", "lâmpada", "isqueiro", "vela", "guardanapo", "papel alumínio", "filme plástico",
  "fósforo", "copo descartável", "prato descartável", "pano de prato",
  // Cuidados / beleza
  "protetor solar", "hidratante", "creme para o corpo", "tintura de cabelo", "gel de cabelo",
  "aparelho de barbear", "maquiagem", "esmalte", "acetona"
];
