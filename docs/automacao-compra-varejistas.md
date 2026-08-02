# Cotação e compra automatizada por varejista — fluxo legado

_Atualizado em 21/07/2026. Este documento registra o fluxo legado de automação por varejista;
o arquivo `automacao-compra-carrefour.md` é histórico da decisão de desativá-lo._

> **Não é o caminho crítico atual.** Com `LIA_MANUAL_CONCIERGE=true` (default), a Lia usa a
> cotação e compra manuais no `/ops`, com motoboy partindo da base do operador. Consulte
> [AGENTS.md](../AGENTS.md) e [operador-runbook.md](operador-runbook.md) para o fluxo ativo.
> Este documento permanece como referência técnica e para os evals legados atrás de
> `LIA_MANUAL_CONCIERGE=false`.

## Canais ativos

| Varejista | Categoria | Estado atual |
| --- | --- | --- |
| Oba Hortifruti | mercado e essenciais | Conector Browserbase implementado; requer `OBA_BROWSER_CONTEXT_ID` e preflight ao vivo. |
| Petz | pet | Carrinho/checkout observados ao vivo; conector exige subtotal, frete e prazo; falta preflight do fluxo atual. |
| O Boticário | beleza | Busca e carrinho implementados; conector exige subtotal, frete e prazo; falta preflight ao vivo. |

Carrefour não é fonte ativa nem fallback. Mambo foi pesquisado e ficou fora deste escopo.

## Contrato de segurança comum

1. Cada varejista usa um Context Browserbase próprio, protegido por lease persistente.
2. O comprador limpa a sacola anterior, adiciona somente SKUs resolvidos e confere quantidade,
   disponibilidade, subtotal, frete e promessa de entrega.
3. Sem qualquer desses campos, o job termina em `needs_human`; não existe estimativa inventada.
4. A Lia só apresenta Pix/cartão depois da cotação curta ser publicada.
5. Após o pagamento, o carrinho cotado não é refeito automaticamente. O operador revalida e
   solicita aprovação explícita em `/ops`.
6. A produção permanece em `PURCHASE_AUTOMATION_MODE=cart_only`. CAPTCHA, login, OTP, CVV,
   3DS e qualquer botão financeiro são bloqueios humanos; não burlar desafios.

## Primeiro preflight Oba

1. Criar um Context persistente exclusivo no Browserbase e salvar apenas o ID como
   `OBA_BROWSER_CONTEXT_ID` em Production/Preview; `BROWSERBASE_API_KEY` fica Sensitive.
2. Implantar a versão que contém o conector e manter `PURCHASE_AUTOMATION_MODE=cart_only`.
3. No `/ops`, executar **Testar cotação Oba**, que cria somente um pedido técnico com o CEP
   público `01310-100`. Alternativamente usar `npx tsx scripts/preflight-oba-internal.mts`
   em ambiente de teste com banco isolado.
4. Aceitar o teste apenas se o job retornar itens, subtotal, frete, prazo, total e `cartHash`.
   Em qualquer outro resultado, registrar o erro e parar; sem WhatsApp, cobrança ou compra.

Esse preflight não homologa login, meio de pagamento, pedido final ou autorização comercial.
Esses gates continuam obrigatórios antes de dinheiro real.
