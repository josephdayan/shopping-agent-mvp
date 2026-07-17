# Automação de compra — Carrefour (piloto controlado)

> **Atualização operacional — 14/07/2026:** esta automação continua útil para busca,
> carrinho, cotação e compra com entrega do Carrefour. Ela não deve assumir que um motoboy
> on-demand conseguirá retirar o pedido. O Carrefour exige documentação do titular para
> retirada por terceiro; no alimentar, também exige autorização assinada. Veja
> [decisoes-operacionais-2026-07-14.md](decisoes-operacionais-2026-07-14.md).

## O que já está implementado

Com `PURCHASE_AUTOMATION_ENABLED` ligado para Carrefour, a Lia agora cria uma cotação
pendente, monta/valida a sacola em `cart_only` e só mostra Pix/cartão quando o checkout
expõe itens, total, frete e promessa de entrega. A cotação expira em cinco minutos por
padrão e exige que o cliente escolha a forma de pagamento após ver o resumo. O caminho
legado de cobrança imediata permanece apenas como fallback quando a automação não está
habilitada. Depois que o pagamento for aprovado, ela revalida o carrinho e
o painel `/ops` permite aprovar a compra na loja. Cada pedido tem um **job de compra**
que:

1. abre uma sessão remota persistente da conta Carrefour;
2. visita o link exato de cada produto, confere o nome e adiciona ao carrinho;
3. confere se todos os itens e o total ficaram válidos;
4. grava o carrinho, preço, sessão e cada tentativa para auditoria;
5. revalida o carrinho antes de qualquer aprovação;
6. exige aprovação no painel (ou política de preço explicitamente configurada).

Cada tentativa tem idempotência no banco: reprocessar uma etapa não cria outro pedido
na loja. O sistema não salva número de cartão, CVV, cookies nem estado do navegador no
Postgres.

Uma conta/contexto Carrefour opera um carrinho por vez. A fila é durável: enquanto um
pedido aguarda aprovação ou finalização, os seguintes esperam sem misturar itens no mesmo
carrinho. Isso permite volume com uma conta corporativa sem transformar o carrinho em um
estado compartilhado inseguro.

O primeiro modo é obrigatoriamente `cart_only`: ele prepara o carrinho, mas é incapaz de
clicar para pagar. Isso evita uma cobrança inesperada enquanto a conta, a entrega e o
3DS ainda não foram validados ao vivo.

**Estado da validação em 16/07/2026:** migrations e correções de UI foram implantadas. A
regionalização atual fecha pelo botão submit do formulário; Enter é apenas fallback. Frete,
prazo e total aparecem no carrinho completo, e o conector usa a rota de resumo segura quando
o minicarrinho não expõe seu CTA. O workflow voltou a falhar fechado em `LOGIN_REQUIRED`.
Uma nova sessão foi aberta, mas a reautenticação humana não foi concluída e o operador adiou
a tentativa. Não abrir outra sessão ou repetir o preflight até a próxima tentativa coordenada.
Nenhuma cobrança ou compra foi executada; a cotação Browserbase continua pendente.

## Ativação do primeiro piloto

1. Crie uma conta Browserbase e gere `BROWSERBASE_API_KEY`.
2. Crie um **Context** persistente exclusivo para a conta PJ do Carrefour e salve seu ID
   em `CARREFOUR_BROWSER_CONTEXT_ID`.
3. Abra uma sessão desse Context, entre manualmente no Carrefour, configure o endereço de
   entrega e cadastre o cartão corporativo. Resolva manualmente qualquer CAPTCHA, OTP ou
   3DS. Não coloque senha ou dados de cartão em variáveis de ambiente.
4. Na Vercel, configure `BROWSERBASE_API_KEY`, `CARREFOUR_BROWSER_CONTEXT_ID` e:

   ```env
   PURCHASE_AUTOMATION_ENABLED="true"
   PURCHASE_AUTOMATION_MODE="cart_only"
   ```

5. Faça um pedido interno com o menor número de itens possível, links exatos e valor que
   respeite o mínimo vigente exposto pelo checkout. O piloto novo prepara/cota primeiro,
   cobra depois da confirmação e então revalida.
6. Confira preço, endereço, frete, prazo e carrinho na sessão remota. O painel mostra o ID
   da sessão para investigação. Finalize esse primeiro pedido manualmente no Carrefour e
   use a entrega do próprio varejista.

## Passagem gradual para escala

Use estas fases, sem pular etapas:

| Fase | Configuração | Resultado |
| --- | --- | --- |
| 1 | `cart_only` | Só resolve e monta carrinho; nenhuma compra é feita. |
| 2 | `approval_required` | Revalida o carrinho e pede uma aprovação explícita no `/ops`. |
| 3 | `policy` + teto baixo | Só pode aprovar automaticamente se todos os itens forem exatos, o total estiver abaixo do teto e a variação de preço estiver dentro da tolerância. |

Nas fases 2 e 3, a finalização é habilitada pelo clique de aprovação no `/ops` (ou pela
política limitada). Antes desse clique, o sistema reabre o carrinho e compara o hash e o
total. Se o site pedir 3DS, CAPTCHA, login ou confirmação de entrega, ele **não tenta
burlar** o desafio: muda o job para `needs_human` e preserva a sessão para o operador.
Se o botão final já tiver sido acionado mas o número do pedido não aparecer, também não
há nova tentativa automática — primeiro confira a sessão Carrefour para evitar duplicidade.

## Limites atuais do piloto

- Carrefour apenas neste conector.
- Quantidade é repetida no produto e conferida no carrinho; se o controle da loja não
  responder, vira revisão humana em vez de assumir uma quantidade errada.
- O produto precisa ter URL exata do Carrefour no catálogo.
- Sem substituição automática, produto por peso ou busca aproximada.
- O sistema de pagamento do cliente continua Mercado Pago; o cartão da empresa fica
  exclusivamente cadastrado no Carrefour para a compra de abastecimento.
- `Click & Retire` não é rota de courier em escala: retirada por terceiro exige documentos
  e, conforme a modalidade, autorização assinada/token/biometria.

Esses limites são controles contra comprar um SKU errado. Eles podem ser ampliados após
uma amostra de pedidos reais com taxa de conferência e preço monitorados.

## Operação e falhas

- `cart_ready`: carrinho conferido; pode seguir para aprovação.
- `awaiting_approval`: espera uma decisão no painel.
- `needs_human`: item sem link, preço não exposto, login/CAPTCHA ou divergência; abra a
  sessão indicada e conclua/corrija manualmente.
- `ordered`: a loja confirmou o pedido; acompanhe a entrega do Carrefour.
- `retailer_preparing`: compra confirmada e loja preparando a entrega direta.
- `retailer_out_for_delivery`: varejista despachou; registrar o rastreio quando existir.
- `ready_for_pickup`: status legado; só usar em parceiro que autorize formalmente o courier.
- `refund_pending` / `refunded`: solicitação e confirmação de estorno são etapas distintas;
  veja [operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md).

Nunca habilite `policy` com `PURCHASE_AUTO_APPROVE_MAX_TOTAL` acima de zero antes de
concluir e auditar os pilotos de `cart_only` e `approval_required`.
