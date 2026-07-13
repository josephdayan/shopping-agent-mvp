# Evolução da conversa — 7 de julho de 2026

Este documento registra o ciclo de reconstrução da conversa feito em 7 de julho. Ele
complementa o estado do produto em [STATUS.md](../STATUS.md): descreve **o que mudou no
cérebro da Lia**, por qual problema e como foi validado. Não altera o modelo operacional
(clique-e-retire, pagamento, operação no `/ops` e entrega); torna o atendimento no
WhatsApp mais seguro e natural.

## Ponto de partida

O review profundo de conversa de 6 de julho encontrou 115 comportamentos a corrigir:
mensagens comuns podiam virar produto, escolhas ambíguas podiam se perder e o matcher
de catálogo dava prioridade a variantes pouco prováveis. O trabalho foi organizado em
camadas puras e testáveis antes de mexer na máquina de estados:

1. NLU e parser de lista;
2. matcher/ranking comum aos três catálogos;
3. máquina de conversa e copy;
4. regressões end-to-end e refinamentos encontrados nos próprios evals.

## Processo e entregas

### 1. NLU e leitura do que o cliente quis dizer

`src/lib/lia-intents.ts` passou a reconhecer explicitamente, sem chamar busca de
produto:

- recusas curtas (`não`, `deixa pra lá`, `hoje não`) e encerramento de lista (`só
  isso`, `mais nada`);
- perguntas de serviço sobre cobertura, frete, prazo e pagamento;
- pedido de atendimento humano e reclamação;
- pergunta sobre cancelamento, distinta do comando que realmente cancela;
- reenvio/expiração de Pix e troca de forma de pagamento;
- confirmações brasileiras e emojis;
- status de pedido em formulações naturais, como `que horas chega?` e `cadê meu
  pedido?`;
- remoção seguida de adição na mesma mensagem (`tira o arroz e coloca feijão`).

O parser também preserva quantidades por extenso, meia dúzia, pesos e decimais; separa
listas por quebra de linha, vírgula ou `+`; e remove saudações e introduções antes de
procurar itens. Um CEP enviado junto com itens guarda ambos, em vez de descartar o resto
da mensagem. Números com zero à esquerda não são tratados como escolha de opção.

### 2. Busca e escolha de produtos

O ranking comum em `src/lib/stores/types.ts` ganhou um piso de relevância: texto de
conversa sem um sinal forte devolve resultado vazio honesto, em vez de um item que só
coincide por acaso. O matcher agora:

- respeita exclusões (`sem açúcar` não traz açúcar; `Sem Perfume` no nome não é perfume);
- exige que o substantivo pedido seja produto, marca ou categoria válida — `ovos` não
  encontra macarrão com ovos e `frango` não encontra petisco;
- não oferece versão pet para pedido humano e não mistura espécie de cão e gato;
- favorece o produto básico: unidade antes de fardo, seco/adulto antes de úmido,
  filhote ou sênior, e variante comum antes de linha diet/veterinária, salvo quando
  essas características forem pedidas;
- trata tamanho e atributos de fato (`2 L`, `desnatado`, `sem lactose`), inclusive
  quando aparecem no meio de nomes comerciais de beleza;
- entende sinônimos relevantes, como perfume/colônia e cachorro/cão/cães.

Na escolha, a pessoa pode responder por número, ordinal, mais barato, mais caro, último,
recomendação ou marca/nome. Quando a resposta só reduz o conjunto (`coca` entre duas
Cocas), a Lia mostra apenas o subconjunto; não cria um novo item. Também reconhece pedido
por mais opções e refinamentos de mercado durante a escolha.

### 3. Máquina de conversa e copy

`src/lib/delivery-service.ts` passou a coordenar esses sinais em todos os estados da
conversa:

- no primeiro contato, anota o pedido em texto cru e pede o CEP; depois do CEP roda a
  busca normal, com opções e preço, sem escolher produto automaticamente;
- se o cliente pergunta algo durante o onboarding, responde à pergunta e volta a pedir
  o CEP, sem registrar a pergunta como item;
- uma saudação no meio de um pedido mantém o contexto; carrinho ou opções expirados são
  explicados, nunca descartados silenciosamente;
- `quanto deu tudo?` devolve total parcial ou o resumo disponível; `só isso` fecha a
  lista e cota antes de cobrar;
- abaixo do mínimo, encerrar a lista explica o impasse sem repetir o mesmo aviso em
  loop;
- um item novo enquanto há cobrança aberta cancela a cobrança antiga, reabre a cesta e
  refaz o pedido;
- perguntas de frete em pedido já cotado mostram o frete real; atendimento humano e
  reclamação deixam uma sinalização para o operador.

A copy correspondente foi centralizada em `src/lib/lia-copy.ts`, com respostas próprias
para cada um desses casos.

### 4. Validação e ferramentas de diagnóstico

- `tests/conversation-fixes.test.ts` registra as regressões do review, inclusive os
  casos de NLU, parser, escolha e matcher.
- `tests/conversation.eval.test.ts` dirige `handleDeliveryMessage` com banco real,
  CEPs geocodificados em memória e provedores mockados. Os telefones de teste e seus
  dados são apagados ao terminar; se o banco não estiver disponível, os evals são
  pulados explicitamente.
- `scripts/talk-lia.mts` permite conversar com a mesma entrada do webhook pelo terminal,
  em modo interativo ou passando turnos como argumentos. Ele usa um telefone de teste,
  nunca envia WhatsApp real, não faz busca Carrefour ao vivo e limpa os dados ao sair.
  Por padrão preserva o uso de LLM do `.env`; `OPENAI_API_KEY=""` força o fallback
  determinístico.

Exemplos:

```bash
npm test
npx tsx scripts/talk-lia.mts
OPENAI_API_KEY="" npx tsx scripts/talk-lia.mts "oi" "quero arroz e leite" "01310-100"
```

## Linha do tempo dos commits

| Data | Entrega |
| --- | --- |
| 2026-07-04 | Vault Obsidian com notas, templates e configuração mínima criado na branch `lia-conversation-boticario`; essa documentação não foi mesclada na `main`. |
| 2026-07-07 | NLU com mais de 20 intenções/parsers do review de conversa. |
| 2026-07-07 | Piso de relevância, guardas e ranking `staple-first` no matcher. |
| 2026-07-07 | Reconstrução de copy, máquina de conversa e harness de conversa. |
| 2026-07-07 | Evals usam o mesmo `attrMatchesItem` da produção. |
| 2026-07-07 | Estreitamento por nome, total parcial e parser sem lixo de saudação. |
| 2026-07-07 | Ajustes de adulto/infantil, categoria no meio do nome e termos `Sem X`. |
| 2026-07-07 | Ajustes pet: ração adulta seca como padrão; úmida, filhote, sênior e Vet Care apenas quando pedidos. |
| 2026-07-07 | Onboarding que responde perguntas, não converte indecisão em item e não deixa o roteador consumir ruído. |

## Limites que continuam os mesmos

Este ciclo não substitui a validação operacional do piloto: retirada por terceiro,
estoque/preço vivo e aceitação do total pelo cliente ainda exigem pedidos reais. O
catálogo continua estático, uma cesta continua limitada a uma loja e a confirmação real
de pagamento continua sendo responsabilidade do Mercado Pago/webhook.
