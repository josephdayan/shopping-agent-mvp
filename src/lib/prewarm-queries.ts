// The ~100 most-searched Mercado Livre Brasil product terms, curated from the
// platform's "mais vendidos"/"mais buscados" rankings across the big categories
// (eletrônicos, áudio, informática, games, eletrodomésticos, casa, beleza, moda,
// pet, infantil, ferramentas, automotivo, esporte/saúde).
//
// The prewarm cron scrapes the stalest of these on a schedule and fills the
// SearchCache, so the most common real requests are answered in ~1s instead of
// paying the ~50s Apify cold start. Edit this list freely — it's just the seed.
export const PREWARM_QUERIES: string[] = [
  // Áudio e acessórios de celular
  "fone de ouvido bluetooth",
  "fone de ouvido sem fio",
  "caixa de som bluetooth",
  "caixa de som jbl",
  "carregador portatil power bank",
  "carregador de celular turbo",
  "cabo usb tipo c",
  "capa de celular",
  "pelicula de vidro 3d",
  "suporte de celular",

  // Smartwatch / relógios
  "smartwatch",
  "relogio inteligente",
  "relogio masculino",
  "relogio feminino",
  "pulseira smartwatch",

  // Celulares / TVs
  "smartphone",
  "celular",
  "iphone",
  "samsung galaxy",
  "xiaomi redmi",
  "smart tv 50 polegadas",
  "chromecast",
  "controle de tv smart",

  // Informática
  "notebook",
  "tablet",
  "mouse sem fio",
  "teclado sem fio",
  "teclado mecanico gamer",
  "headset gamer",
  "webcam full hd",
  "pen drive",
  "cartao de memoria",
  "ssd 1tb",
  "hd externo",
  "monitor",
  "roteador wifi",

  // Games
  "controle ps5",
  "controle xbox",
  "console playstation 5",
  "nintendo switch",
  "cadeira gamer",
  "mousepad gamer",

  // Eletrodomésticos / cozinha
  "air fryer",
  "fritadeira eletrica",
  "liquidificador",
  "ventilador",
  "cafeteira",
  "aspirador de po",
  "ferro de passar",
  "micro-ondas",
  "batedeira",
  "sanduicheira",
  "panela eletrica de arroz",
  "purificador de agua",
  "umidificador de ar",
  "jogo de panelas",
  "garrafa termica",
  "potes hermeticos",

  // Casa / iluminação
  "luminaria led",
  "fita led",
  "filtro de linha",
  "organizador de gaveta",
  "kit lampada led",
  "varal de roupas",
  "cesto organizador",

  // Beleza e higiene
  "perfume importado",
  "perfume masculino",
  "perfume feminino",
  "secador de cabelo",
  "prancha de cabelo",
  "barbeador eletrico",
  "aparador de pelos",
  "escova de dente eletrica",
  "protetor solar facial",
  "kit cuidados com a pele",
  "shampoo",
  "base liquida",
  "batom",

  // Moda / calçados / acessórios
  "tenis masculino",
  "tenis feminino",
  "tenis nike",
  "chinelo slide",
  "mochila",
  "bolsa feminina",
  "oculos de sol",
  "carteira masculina",
  "meias kit",

  // Pet
  "racao para cachorro",
  "racao para gato",
  "comedouro pet",
  "brinquedo para cachorro",
  "areia para gato",
  "coleira para cachorro",

  // Infantil / brinquedos
  "brinquedo infantil",
  "boneca",
  "carrinho de controle remoto",
  "lego",
  "fralda descartavel",
  "jogo de tabuleiro",

  // Ferramentas / automotivo
  "parafusadeira",
  "furadeira",
  "kit de ferramentas",
  "trena",
  "aspirador automotivo",
  "suporte de celular para carro",

  // Esporte / saúde
  "halteres",
  "corda de pular",
  "tapete de yoga",
  "garrafa squeeze"
];
