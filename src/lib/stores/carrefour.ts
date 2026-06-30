import type { CatalogItem, StoreConnector, StoreUnit } from "./types";
import { scoreCatalogMatch, normalizeText } from "./types";
import { prisma } from "@/lib/prisma";
import { runApifyActor } from "@/lib/adapters/suppliers";

// Carrefour (hipermercado) — the broad everyday base: comidinha, higiene, pet,
// limpeza, bebida. The catalog below is REAL data: product names + prices copied from
// mercado.carrefour.com.br (the same-day grocery storefront) on 2026-06-29, by
// searching each everyday staple term and keeping the top organic (non-sponsored)
// matches. `unitPrice` is the REAL Carrefour cost — the 10% Lia markup is applied
// downstream in delivery-service, never stored here. Non-perishable + a few chilled
// staples; widen by adding rows (or wiring a live source) without touching the rest.
const SEED_CATALOG: CatalogItem[] = [
  // Higiene & perfumaria
  { sku: "CRF-HIG-001", name: "Papel Higiênico Folha Dupla Carrefour Leve 24 Pague 22", brand: "Carrefour", unitPrice: 32.99, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-002", name: "Papel Higiênico Folha Dupla Personal Vip Neutro 20m Leve 18 Pague 16", brand: "Personal", unitPrice: 25.49, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-003", name: "Papel Higiênico Folha Simples Carrefour Neutro 30m 16 Unidades", brand: "Carrefour", unitPrice: 15.99, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-004", name: "Papel Higiênico Neve Toque de Seda Leve 24 Pague 21 - 24 Rolos", brand: "Neve", unitPrice: 55.99, unit: "pacote", category: "higiene" },
  { sku: "CRF-HIG-005", name: "Creme Dental Colgate Máxima Proteção Anticáries Menta 120g", brand: "Colgate", unitPrice: 5.5, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-006", name: "Creme Dental Colgate Total Original Mint 90g", brand: "Colgate", unitPrice: 9.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-007", name: "Gel Dental Close Up Liquifresh Ice 100g", brand: "Close Up", unitPrice: 8.19, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-008", name: "Shampoo TRESemmé Hidratação Profunda 650ml", brand: "TRESemmé", unitPrice: 37.39, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-009", name: "Shampoo Seda Luminous UV 300ml", brand: "Seda", unitPrice: 18.69, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-010", name: "Shampoo Dove Hidratação Intensa 400ml", brand: "Dove", unitPrice: 29.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-011", name: "Sabonete em Barra Dove Pele Sensível 90g", brand: "Dove", unitPrice: 4.99, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-012", name: "Sabonete em Barra Dove Karité e Baunilha 90g", brand: "Dove", unitPrice: 6.19, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-013", name: "Sabonete Líquido Dove Nutrição Profunda 200ml", brand: "Dove", unitPrice: 12.39, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-014", name: "Sabonete em Barra Granado Enxofre 90g", brand: "Granado", unitPrice: 11.9, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-015", name: "Desodorante Antitranspirante Aerosol Dove Original 150ml", brand: "Dove", unitPrice: 22.79, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-016", name: "Desodorante Antitranspirante Aerosol Rexona Powder Dry 250ml", brand: "Rexona", unitPrice: 24.4, unit: "un", category: "higiene" },
  { sku: "CRF-HIG-017", name: "Desodorante Rexona Clinical Clean 58g", brand: "Rexona", unitPrice: 28.18, unit: "un", category: "higiene" },
  // Bebê & infantil
  { sku: "CRF-BBE-001", name: "Fralda Descartável Huggies Máxima Proteção XG 56 Unidades", brand: "Huggies", unitPrice: 95.99, unit: "pacote", category: "bebe" },
  { sku: "CRF-BBE-002", name: "Fralda Carrefour My Baby Hiper XG 58 Unidades", brand: "Carrefour", unitPrice: 65.99, unit: "pacote", category: "bebe" },
  { sku: "CRF-BBE-003", name: "Fralda Descartável Huggies Máxima Proteção G 58 Unidades", brand: "Huggies", unitPrice: 95.99, unit: "pacote", category: "bebe" },
  // Limpeza & lavanderia
  { sku: "CRF-LMP-001", name: "Detergente Líquido Limpol Neutro 500ml", brand: "Limpol", unitPrice: 2.89, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-002", name: "Detergente Líquido Limpol Cristal 500ml", brand: "Limpol", unitPrice: 2.89, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-003", name: "Sabão em Pó Omo Lavagem Perfeita 2,2kg", brand: "Omo", unitPrice: 35.89, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-004", name: "Sabão em Pó Brilhante Limpeza Total 2,2kg", brand: "Brilhante", unitPrice: 25.89, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-005", name: "Sabão em Barra Ypê Neutro 800g", brand: "Ypê", unitPrice: 12.89, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-006", name: "Amaciante Concentrado Comfort Puro Cuidado 1L", brand: "Comfort", unitPrice: 24.88, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-007", name: "Amaciante Ypê Ultra Intenso 2L", brand: "Ypê", unitPrice: 8.99, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-008", name: "Água Sanitária Qboa 1L", brand: "Qboa", unitPrice: 4.19, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-009", name: "Água Sanitária Super Candida 2L", brand: "Super Candida", unitPrice: 6.89, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-010", name: "Água Sanitária Carrefour 2L", brand: "Carrefour", unitPrice: 5.19, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-011", name: "Papel Toalha Branco Carrefour 2 Unidades", brand: "Carrefour", unitPrice: 4.79, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-012", name: "Papel Toalha Carrefour Essential Branco 3 Rolos", brand: "Carrefour", unitPrice: 9.99, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-013", name: "Esponja Multiuso Bombril 1 Unidade", brand: "Bombril", unitPrice: 1.99, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-014", name: "Esponja Multiuso Bombril Leve 4 Pague 3", brand: "Bombril", unitPrice: 5.98, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-015", name: "Desinfetante Sanol Lavanda 2L", brand: "Sanol", unitPrice: 4.99, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-016", name: "Desinfetante Líquido Lysoform Original 1L", brand: "Lysoform", unitPrice: 20.39, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-017", name: "Limpador Multiuso Veja Original Clássico 500ml", brand: "Veja", unitPrice: 5.69, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-018", name: "Limpador Multiuso Ypê Desengordurante 500ml", brand: "Ypê", unitPrice: 3.99, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-019", name: "Saco de Lixo Carrefour Essential Azul 50L 100 Unidades", brand: "Carrefour", unitPrice: 7.99, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-020", name: "Saco de Lixo Carrefour Essential Azul 30L 100 Unidades", brand: "Carrefour", unitPrice: 6.99, unit: "pacote", category: "limpeza" },
  { sku: "CRF-LMP-021", name: "Papel Alumínio Carrefour 45x750cm", brand: "Carrefour", unitPrice: 11.99, unit: "un", category: "limpeza" },
  { sku: "CRF-LMP-022", name: "Papel Alumínio Wyda 30cm x 4m", brand: "Wyda", unitPrice: 3.49, unit: "un", category: "limpeza" },
  // Mercearia
  { sku: "CRF-MER-001", name: "Arroz Branco Camil Tipo 1 5kg", brand: "Camil", unitPrice: 20.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-002", name: "Arroz Branco Tio João Tipo 1 5kg", brand: "Tio João", unitPrice: 28.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-003", name: "Arroz Integral Tio João Tipo 1 1kg", brand: "Tio João", unitPrice: 5.79, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-004", name: "Feijão Carioca Camil 1kg", brand: "Camil", unitPrice: 9.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-005", name: "Feijão Carioca Kicaldo 1kg", brand: "Kicaldo", unitPrice: 9.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-006", name: "Feijão Preto Kicaldo 1kg", brand: "Kicaldo", unitPrice: 6.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-007", name: "Açúcar Refinado União 1kg", brand: "União", unitPrice: 3.65, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-008", name: "Açúcar Refinado Carrefour 1kg", brand: "Carrefour", unitPrice: 3.29, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-009", name: "Café Torrado e Moído Tenor 250g", brand: "Tenor", unitPrice: 25.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-010", name: "Café Solúvel Melitta Extra Forte Sachê 40g", brand: "Melitta", unitPrice: 7.89, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-011", name: "Óleo de Soja Soya 900ml", brand: "Soya", unitPrice: 6.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-012", name: "Óleo de Soja Liza 900ml", brand: "Liza", unitPrice: 7.29, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-013", name: "Sal Refinado Iodado Carrefour 1kg", brand: "Carrefour", unitPrice: 2.29, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-014", name: "Sal Refinado Iodado Lebre 1kg", brand: "Lebre", unitPrice: 3.19, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-015", name: "Macarrão Espaguete Nº8 Sêmola com Ovos 500g", unitPrice: 2.98, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-016", name: "Macarrão Espaguete Adria Sêmola com Ovos 500g", brand: "Adria", unitPrice: 3.88, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-017", name: "Macarrão Fettuccine Barilla com Ovos 500g", brand: "Barilla", unitPrice: 6.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-018", name: "Leite Integral UHT Piracanjuba 1L", brand: "Piracanjuba", unitPrice: 5.59, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-019", name: "Leite Integral UHT Carrefour Classic 1L", brand: "Carrefour", unitPrice: 4.89, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-020", name: "Leite Integral UHT Italac 1L", brand: "Italac", unitPrice: 5.48, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-021", name: "Molho de Tomate Tradicional Tarantella 300g", brand: "Tarantella", unitPrice: 2.09, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-022", name: "Molho de Tomate Bolonhesa Tarantella 300g", brand: "Tarantella", unitPrice: 2.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-023", name: "Achocolatado em Pó Toddy Original 370g", brand: "Toddy", unitPrice: 10.99, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-024", name: "Achocolatado em Pó Nescau 550g", brand: "Nescau", unitPrice: 14.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-025", name: "Farinha de Trigo Carrefour Classic 1kg", brand: "Carrefour", unitPrice: 3.48, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-026", name: "Farinha de Trigo Tradicional Dona Benta 1kg", brand: "Dona Benta", unitPrice: 6.09, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-027", name: "Leite Condensado Moça Tradicional 395g", brand: "Moça", unitPrice: 8.49, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-028", name: "Leite Condensado Moça Caixinha 395g", brand: "Moça", unitPrice: 8.9, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-029", name: "Creme de Leite Nestlé 200g", brand: "Nestlé", unitPrice: 4.79, unit: "un", category: "mercearia" },
  { sku: "CRF-MER-030", name: "Creme de Leite Mococa 200g", brand: "Mococa", unitPrice: 2.89, unit: "un", category: "mercearia" },
  // Padaria & matinais
  { sku: "CRF-PAD-001", name: "Pão de Forma Pullman 480g", brand: "Pullman", unitPrice: 6.99, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-002", name: "Pão de Forma Panco Premium 500g", brand: "Panco", unitPrice: 8.99, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-003", name: "Pão de Forma Integral Wickbold 500g", brand: "Wickbold", unitPrice: 7.98, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-004", name: "Margarina Cremosa com Sal Qualy 500g", brand: "Qualy", unitPrice: 8.99, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-005", name: "Margarina com Sal Qualy Vita 500g", brand: "Qualy", unitPrice: 10.99, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-006", name: "Biscoito Cream Cracker Vitarella 350g", brand: "Vitarella", unitPrice: 5.89, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-007", name: "Biscoito Maizena Vitarella 350g", brand: "Vitarella", unitPrice: 5.48, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-008", name: "Biscoito Recheado Chocolate Bauducco Choco Biscuit 80g", brand: "Bauducco", unitPrice: 7.48, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-009", name: "Requeijão Cremoso Poços de Caldas 400g", brand: "Poços de Caldas", unitPrice: 17.99, unit: "un", category: "padaria" },
  { sku: "CRF-PAD-010", name: "Requeijão Cremoso Light Carrefour Classic 400g", brand: "Carrefour", unitPrice: 17.15, unit: "un", category: "padaria" },
  // Frios & laticínios
  { sku: "CRF-FRI-001", name: "Queijo Mussarela Fatiado Président 150g", brand: "Président", unitPrice: 9.49, unit: "un", category: "frios" },
  { sku: "CRF-FRI-002", name: "Queijo Mussarela Fatiado Mandaká 150g", brand: "Mandaká", unitPrice: 12.89, unit: "un", category: "frios" },
  { sku: "CRF-FRI-003", name: "Iogurte Integral Nestlé Tradicional 170g", brand: "Nestlé", unitPrice: 3.89, unit: "un", category: "frios" },
  { sku: "CRF-FRI-004", name: "Iogurte Natural Integral Carrefour Classic 160g", brand: "Carrefour", unitPrice: 2.69, unit: "un", category: "frios" },
  { sku: "CRF-FRI-005", name: "Manteiga com Sal Président Tablete 200g", brand: "Président", unitPrice: 13.49, unit: "un", category: "frios" },
  { sku: "CRF-FRI-006", name: "Manteiga com Sal Carrefour 500g", brand: "Carrefour", unitPrice: 24.99, unit: "un", category: "frios" },
  { sku: "CRF-FRI-007", name: "Presunto Cozido Fatiado Sadia 200g", brand: "Sadia", unitPrice: 5.99, unit: "un", category: "frios" },
  { sku: "CRF-FRI-008", name: "Presunto Cozido Fatiado Perdigão 200g", brand: "Perdigão", unitPrice: 7.88, unit: "un", category: "frios" },
  { sku: "CRF-FRI-009", name: "Ovo Branco Grande Shinoda 20 Unidades", brand: "Shinoda", unitPrice: 17.99, unit: "pacote", category: "frios" },
  { sku: "CRF-FRI-010", name: "Ovos Vermelhos Carrefour 20 Unidades", brand: "Carrefour", unitPrice: 17.99, unit: "pacote", category: "frios" },
  // Bebidas
  { sku: "CRF-BEB-001", name: "Refrigerante Coca-Cola Original 2L", brand: "Coca-Cola", unitPrice: 11.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-002", name: "Refrigerante Coca-Cola Sem Açúcar 2L", brand: "Coca-Cola", unitPrice: 10.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-003", name: "Refrigerante Guaraná Antarctica 2L", brand: "Antarctica", unitPrice: 7.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-004", name: "Refrigerante Guaraná Antarctica Sem Açúcar 2L", brand: "Antarctica", unitPrice: 8.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-005", name: "Suco de Uva Integral Carrefour Classic 1,5L", brand: "Carrefour", unitPrice: 21.79, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-006", name: "Suco Integral Laranja Natural One 1,3L", brand: "Natural One", unitPrice: 14.99, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-007", name: "Água Mineral Sem Gás Carrefour Classic 1,5L", brand: "Carrefour", unitPrice: 2.59, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-008", name: "Água Mineral com Gás Crystal 500ml", brand: "Crystal", unitPrice: 2.69, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-009", name: "Cerveja Heineken Garrafa 330ml", brand: "Heineken", unitPrice: 7.19, unit: "un", category: "bebida" },
  { sku: "CRF-BEB-010", name: "Cerveja Eisenbahn Pilsen Lata 269ml", brand: "Eisenbahn", unitPrice: 3.39, unit: "un", category: "bebida" },
  // Snacks & doces
  { sku: "CRF-SNK-001", name: "Chocolate Lacta Intense 70% Cacau 85g", brand: "Lacta", unitPrice: 21.89, unit: "un", category: "snack" },
  { sku: "CRF-SNK-002", name: "Chocolate ao Leite com Amendoim Neugebauer 80g", brand: "Neugebauer", unitPrice: 7.69, unit: "un", category: "snack" },
  { sku: "CRF-SNK-003", name: "Chocolate Bis Original ao Leite 100,8g", brand: "Bis", unitPrice: 6.99, unit: "un", category: "snack" },
  { sku: "CRF-SNK-004", name: "Chocolate KitKat ao Leite 41,5g", brand: "KitKat", unitPrice: 4.79, unit: "un", category: "snack" },
  { sku: "CRF-SNK-005", name: "Salgadinho Doritos Queijo Nacho 75g", brand: "Doritos", unitPrice: 9.99, unit: "un", category: "snack" },
  { sku: "CRF-SNK-006", name: "Salgadinho Ruffles Original 100g", brand: "Ruffles", unitPrice: 9.99, unit: "un", category: "snack" },
  { sku: "CRF-SNK-007", name: "Salgadinho Cheetos Onda Requeijão 40g", brand: "Cheetos", unitPrice: 4.49, unit: "un", category: "snack" },
  // Pet
  { sku: "CRF-PET-001", name: "Ração para Cachorro Pedigree Adultos Carne ao Leite 900g", brand: "Pedigree", unitPrice: 15.99, unit: "un", category: "pet" },
  { sku: "CRF-PET-002", name: "Ração para Cachorro Purina Alpo Carne e Vegetais 1kg", brand: "Alpo", unitPrice: 16.49, unit: "un", category: "pet" },
  { sku: "CRF-PET-003", name: "Ração Úmida para Gato Whiskas Sachê Carne 85g", brand: "Whiskas", unitPrice: 2.98, unit: "un", category: "pet" },
  { sku: "CRF-PET-004", name: "Ração Úmida para Gato Friskies Atum Sachê 85g", brand: "Friskies", unitPrice: 3.58, unit: "un", category: "pet" }
];

// Real Carrefour Hipermercado units in the São Paulo metro (these are the stores that
// do Clique e Retire). Names/addresses/CEPs copied from carrefour.com.br/localizador-de-lojas
// on 2026-06-30. `nearestUnit` picks the one whose CEP is numerically closest to the
// customer's (a good proxy in SP, where CEP ranges map to regions). Add rows here as
// coverage grows; swap to true geo-distance later if needed.
const UNITS: StoreUnit[] = [
  { id: "crf-washington-luis", label: "Carrefour Hiper Washington Luís", address: "Av. Washington Luiz, 1415 - São Paulo - SP", cep: "04662-002" },
  { id: "crf-imigrantes", label: "Carrefour Hiper Imigrantes", address: "Rua Ribeiro Lacerda, 940 - São Paulo - SP", cep: "04150-000" },
  { id: "crf-brooklin", label: "Carrefour Hiper Brooklin", address: "Av. Santo Amaro, 4815 - São Paulo - SP", cep: "04702-000" }, // CEP corrigido (o site trazia 47001-000, da BA)
  { id: "crf-pinheiros", label: "Carrefour Hiper Pinheiros", address: "Av. das Nações Unidas, 15187 - São Paulo - SP", cep: "04794-000" },
  { id: "crf-giovanni-gronchi", label: "Carrefour Hiper Giovanni Gronchi", address: "Av. Alberto Augusto Alves, 50 - São Paulo - SP", cep: "05724-030" },
  { id: "crf-butanta", label: "Carrefour Hiper Butantã", address: "Av. Prof. Francisco Morato, 2718 - São Paulo - SP", cep: "05512-300" },
  { id: "crf-raposo-tavares", label: "Carrefour Hiper Raposo Tavares", address: "Rod. Raposo Tavares, s/n - São Paulo - SP", cep: "05577-901" },
  { id: "crf-aricanduva", label: "Carrefour Hiper Aricanduva", address: "Av. Rio das Pedras, 555 - São Paulo - SP", cep: "03453-000" },
  { id: "crf-analia-franco", label: "Carrefour Hiper Anália Franco", address: "Av. Regente Feijó, 1759 - São Paulo - SP", cep: "03550-100" },
  { id: "crf-limao", label: "Carrefour Hiper Limão", address: "Av. Otaviano Alves de Lima, 1824 - São Paulo - SP", cep: "02701-000" },
  { id: "crf-tambore", label: "Carrefour Hiper Tamboré", address: "Av. Piracema, 669 - Barueri - SP", cep: "06460-930" },
  { id: "crf-taboao", label: "Carrefour Hiper Taboão da Serra", address: "Rod. Régis Bittencourt, 1835 - Taboão da Serra - SP", cep: "06768-200" }
];

// CEP -> comparable 8-digit number (zero-padded). Returns null if unusable.
function cepToNumber(cep?: string | null): number | null {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length < 5) return null;
  return Number(digits.padEnd(8, "0").slice(0, 8));
}

const CARREFOUR_ACTOR = process.env.APIFY_CARREFOUR_ACTOR ?? "gio21~carrefour-br-scraper";
const CACHE_TTL_MS = Number(process.env.LIA_SEARCH_CACHE_TTL_MS ?? 7 * 24 * 60 * 60 * 1000);
// Hard cap so a slow Carrefour scrape never hangs the WhatsApp turn — past this we
// fall back to the seed and the user always gets a reply.
const CARREFOUR_MAX_WAIT_MS = Number(process.env.LIA_CARREFOUR_TIMEOUT_MS ?? 22000);

function seedSearch(query: string, limit: number): CatalogItem[] {
  const scored = SEED_CATALOG.map((item) => ({ item, score: scoreCatalogMatch(query, item) })).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice);
  return scored.slice(0, limit).map((entry) => entry.item);
}

// The community actor's exact field names vary — pull from the likely candidates.
function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return undefined;
}
function toStr(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
function toPrice(value: unknown): number {
  if (typeof value === "number") return value;
  const cleaned = toStr(value).replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
function mapCarrefourItem(raw: Record<string, unknown>): CatalogItem | null {
  const name = toStr(pick(raw, ["title", "Title", "name", "productName", "nome"]));
  const unitPrice = toPrice(pick(raw, ["price", "Price", "preco", "preço", "currentPrice", "salePrice"]));
  if (!name || unitPrice <= 0) return null;
  return {
    sku: toStr(pick(raw, ["sku", "id", "productId", "ean", "url", "link"])) || `crf-${name.slice(0, 48)}`,
    name,
    brand: toStr(pick(raw, ["brand", "Brand", "marca"])) || undefined,
    unitPrice,
    unit: "un",
    category: "carrefour",
    imageUrl: toStr(pick(raw, ["image", "Image", "imageUrl", "img", "thumbnail", "imagem"])) || undefined
  };
}

// Live Carrefour catalog via Apify (keyword search), cached per query in SearchCache.
// maxWaitMs: short in the chat turn (don't hang the user); long in the prewarm cron.
async function searchCarrefourLive(query: string, limit: number, maxWaitMs = CARREFOUR_MAX_WAIT_MS): Promise<CatalogItem[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return [];
  const cacheKey = `carrefour|${normalizeText(query)}`;

  try {
    const row = await prisma.searchCache.findUnique({ where: { queryKey: cacheKey }, select: { items: true, updatedAt: true } });
    if (row && Date.now() - new Date(row.updatedAt).getTime() < CACHE_TTL_MS) {
      const cached = Array.isArray(row.items) ? (row.items as unknown as CatalogItem[]) : [];
      if (cached.length) return cached.slice(0, limit);
    }
  } catch (error) {
    console.warn("[carrefour:cache:read]", error instanceof Error ? error.message : error);
  }

  const raw = await runApifyActor(CARREFOUR_ACTOR, token, { searchTerm: query, maxItems: 20, maxPages: 1 }, maxWaitMs);
  const items = (raw ?? [])
    .map((entry) => mapCarrefourItem(entry as Record<string, unknown>))
    .filter((item): item is CatalogItem => Boolean(item));
  const ranked = items
    .map((item) => ({ item, score: scoreCatalogMatch(query, item) }))
    .sort((a, b) => b.score - a.score || a.item.unitPrice - b.item.unitPrice)
    .map((entry) => entry.item);

  if (ranked.length) {
    try {
      await prisma.searchCache.upsert({
        where: { queryKey: cacheKey },
        create: { queryKey: cacheKey, query, items: ranked as unknown as object },
        update: { query, items: ranked as unknown as object }
      });
    } catch (error) {
      console.warn("[carrefour:cache:write]", error instanceof Error ? error.message : error);
    }
  }
  return ranked.slice(0, limit);
}

// Prewarm the cache for the most common everyday queries so they're INSTANT in chat
// (the long-tail is still scraped on demand, then cached). Run from the cron with a
// long wait since it's background, not a user turn.
export async function prewarmCarrefour(queries: string[], options?: { limit?: number; minAgeMs?: number }) {
  // Off until live scraping actually works — otherwise the cron burns Apify money on
  // an actor that returns nothing.
  if (process.env.LIA_CARREFOUR_LIVE !== "true") {
    return { ok: false, reason: "live_disabled", attempted: 0, warmed: 0, total: queries.length };
  }
  if (!process.env.APIFY_API_TOKEN) {
    return { ok: false, reason: "no_apify_token", attempted: 0, warmed: 0, total: queries.length };
  }
  const limit = Math.max(1, Math.floor(options?.limit ?? 8));
  const minAgeMs = options?.minAgeMs ?? Math.floor(CACHE_TTL_MS * 0.7);

  let rows: { queryKey: string; updatedAt: Date }[] = [];
  try {
    rows = await prisma.searchCache.findMany({
      where: { queryKey: { startsWith: "carrefour|" } },
      select: { queryKey: true, updatedAt: true }
    });
  } catch (error) {
    console.warn("[carrefour:prewarm:status-read]", error instanceof Error ? error.message : error);
  }
  const ageByKey = new Map(rows.map((r) => [r.queryKey, Date.now() - new Date(r.updatedAt).getTime()]));
  const candidates = queries
    .map((query) => ({ query, age: ageByKey.get(`carrefour|${normalizeText(query)}`) ?? Number.POSITIVE_INFINITY }))
    .filter((candidate) => candidate.age >= minAgeMs)
    .sort((a, b) => b.age - a.age)
    .slice(0, limit);

  let warmed = 0;
  for (const candidate of candidates) {
    try {
      const items = await searchCarrefourLive(candidate.query, 8, Number(process.env.LIA_PREWARM_TIMEOUT_MS ?? 90000));
      if (items.length) warmed += 1;
    } catch (error) {
      console.warn("[carrefour:prewarm:item]", candidate.query, error instanceof Error ? error.message : error);
    }
  }
  return { ok: true, attempted: candidates.length, warmed, total: queries.length };
}

export const carrefourStore: StoreConnector = {
  key: "carrefour",
  label: "Carrefour",

  async searchItems(query: string, limit = 4): Promise<CatalogItem[]> {
    // Live Carrefour via Apify is OPT-IN (LIA_CARREFOUR_LIVE=true). The community
    // actor gio21~carrefour-br-scraper currently returns "No items scraped" (its
    // anti-bot bypass is broken), so by default we use the reliable, instant seed.
    // Flip the flag back on once a working Carrefour data source is wired.
    if (process.env.LIA_CARREFOUR_LIVE === "true" && process.env.APIFY_API_TOKEN) {
      try {
        const live = await searchCarrefourLive(query, limit);
        if (live.length) return live;
      } catch (error) {
        console.warn("[carrefour:live:fallback-seed]", error instanceof Error ? error.message : error);
      }
    }
    return seedSearch(query, limit);
  },

  listCatalog(): CatalogItem[] {
    return SEED_CATALOG;
  },

  async nearestUnit(cep?: string): Promise<StoreUnit> {
    const target = cepToNumber(cep);
    if (target == null) return UNITS[0];
    // Pick the unit whose CEP is numerically closest to the customer's.
    let best = UNITS[0];
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const unit of UNITS) {
      const unitNum = cepToNumber(unit.cep);
      if (unitNum == null) continue;
      const diff = Math.abs(unitNum - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = unit;
      }
    }
    return best;
  },

  pickupInstructions(orderNumber: string): string {
    return [
      `Retirar pedido Click&Retire nº ${orderNumber} no balcão.`,
      "Apresentar: documento do entregador + foto do documento do titular (anexo) + e-mail de 'pronto'."
    ].join(" ");
  }
};
