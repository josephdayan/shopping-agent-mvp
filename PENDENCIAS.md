# Lia — checklist de lançamento

_Última atualização: 2026-07-15._

Este é o painel canônico de progresso do projeto. Marque um item com `[x]` somente quando
o critério descrito estiver comprovado. Quando uma decisão mudar, atualize também
[AGENTS.md](AGENTS.md) e [STATUS.md](STATUS.md).

## Como usar

- **P0:** bloqueia o piloto ou pode causar perda financeira, jurídica ou operacional.
- **P1:** necessário para o lançamento público.
- **P2:** melhoria posterior; não deve atrasar o piloto controlado.
- Registre evidência curta no próprio item ou no documento relacionado antes de marcá-lo.
- “Código pronto” não significa “validado”: teste ao vivo, deploy e operação são etapas
  distintas.

## Visão geral

- [x] Canal de WhatsApp ativo em produção.
- [x] Cobrança Mercado Pago integrada.
- [x] Busca ao vivo preparada para Carrefour, Petz e Boticário.
- [x] Carrinho/checkout da Petz validado ao vivo sem finalizar compra.
- [x] Produção protegida em modo `cart_only`.
- [x] Fundamento de One-Click Meta + Pagar.me implementado atrás de flag, com tentativa
  idempotente, página de tokenização e reconciliação por webhook. Evidência:
  `docs/whatsapp-one-click-pagarme.md`; build e testes focados de 14/07/2026.
- [ ] Fluxo completo cotar → cobrar → comprar → entregar validado em piloto.
- [ ] Operação, jurídico e pós-venda aprovados para lançamento público.

## P0 — antes do primeiro piloto com dinheiro real

### Cotação e cobrança

- [ ] Montar a sacola real e calcular estoque, preço, frete e prazo **antes** de cobrar o
  cliente. **Implementado em código para Carrefour em 15/07** (preflight `cart_only`,
  falha fechada sem total/frete/prazo); migrations e deploy concluídos. A validação ao
  vivo aguarda novo login no Context Carrefour.
- [ ] Mostrar no WhatsApp resumo da cotação, endereço, modalidade, prazo e validade.
  **Implementado em código para Carrefour em 15/07**; a cotação expira em 5 min por
  padrão e ainda precisa de validação ao vivo após reautenticar o Context Carrefour.
- [ ] Implementar expiração curta da cotação e impedir pagamento de cotação vencida.
  **Implementado em código para Carrefour em 15/07**; a expiração cancela a cotação e
  libera o Context persistente. Migrations e deploy concluídos; falta validação ao vivo.
- [ ] Revalidar itens, quantidade, total, endereço, frete e prazo imediatamente antes da
  compra.
- [ ] Definir a política para diferença de preço após pagamento: limite automático,
  aprovação do cliente ou estorno.
- [ ] Garantir idempotência entre pedido, cobrança, carrinho e tentativa de compra.
- [ ] Impedir nova tentativa automática quando o resultado do clique financeiro for
  incerto.

### Compra segura

- [x] Manter produção com `PURCHASE_AUTOMATION_MODE=cart_only`.
- [x] Não armazenar cartão, CVV, senha ou credenciais do varejista no banco/documentação.
- [ ] Exigir confirmação explícita no momento de qualquer compra final durante o piloto.
- [x] Tratar login, OTP, CAPTCHA, CVV e 3DS como `needs_human`. A detecção Carrefour
  cobre login/sessão expirada, CAPTCHA e 3DS; os testes unitários confirmam a classificação.
- [ ] Implementar fila ou isolamento por conta/Context Browserbase para impedir carrinhos
  concorrentes.
- [ ] Validar recuperação segura quando a sessão Browserbase expirar.
- [ ] Rotacionar todas as credenciais que já tenham sido expostas em conversas e atualizar
  os ambientes de produção. **Urgente em 15/07:** credenciais Browserbase/Vercel apareceram
  em saída de diagnóstico; o token OIDC local da Vercel já foi renovado sem expor valor.
  Ainda falta regenerar a chave Browserbase e atualizar os ambientes. Uma sessão persistente
  do Context Carrefour foi aberta em 15/07 somente para a reautenticação manual; depois dela
  será necessário validar o login antes do próximo teste ao vivo. **Não usar a chave de
  reposição enviada em chat em 15/07, mesmo com autorização posterior:** ela também foi
  exposta; regenerar outra diretamente no painel e configurá-la na Vercel sem compartilhá-la
  em conversa. A validação da variável puxada de produção retornou
  `401 Missing x-bb-api-key`; após salvar a nova chave, implantar antes de abrir novo
  preflight. A URL correta de Environment Variables já foi aberta no navegador embutido,
  mas a Vercel pediu login manual antes da edição. Após tentar salvar somente em Production,
  a leitura atual via `vercel env pull` ainda retornou `BROWSERBASE_API_KEY` sem valor;
  confirmar no painel que a edição foi efetivamente salva antes do deploy. A edição exibida
  tinha prefixo `sk_live_`, não compatível com Browserbase: substituir por chave nova
  `bb_live_`, marcar Sensitive e só então implantar. A segunda leitura de Production após a
  alegada correção também não trouxe a variável; não implantar nem reabrir o preflight. O
  painel depois confirmou a variável Sensitive atualizada em Production e o novo deploy
  ficou Ready em 15/07; a chave não é baixada localmente pelo CLI por ser Sensitive. Falta
  validar o preflight implantado. O operador informou que concluiu a reautenticação humana;
  falta definir endereço salvo e item de teste para a cotação, sem cobrar nem comprar.

### Financeiro, fiscal e jurídico

- [ ] Confirmar que a conta Mercado Pago PJ está apta ao modelo e aos volumes do piloto.
- [ ] Definir quem é o comprador perante o varejista e quem aparece como titular da nota
  fiscal.
- [ ] Definir o tratamento de compras para destinatários diferentes usando uma conta
  central.
- [ ] Validar nos termos de Petz, Carrefour e Boticário se o uso operacional da conta
  central é permitido.
- [ ] Definir processo de cancelamento, troca, devolução, item faltante e chargeback.
- [ ] Definir responsabilidade e comunicação quando o varejista atrasar ou não entregar.
- [ ] Confirmar emissão fiscal e tributação da taxa/serviço cobrado pela Lia.

### Cartão One-Click no WhatsApp

- [x] Aplicar as migrations `20260714110000_whatsapp_one_click_payments` e
  `20260714123000_pagarme_one_click` no ambiente de produção. Aplicadas em 15/07;
  a ativação do One-Click continua bloqueada pelas dependências externas abaixo.
- [ ] Obter a allowlist da Payments API BR para a WABA brasileira na Meta e confirmar o
  shape definitivo do webhook de confirmação.
- [ ] Configurar Pagar.me V5: chaves, domínio liberado para `tokenizecard.js`, webhook e
  os eventos de pedido/cobrança/cartão descritos no guia.
- [ ] Executar primeira compra e recompra reais em sandbox; verificar CVV/3DS, recusa,
  resposta perdida e reconciliação antes de ativar `LIA_ENABLE_WA_PAYMENTS=true`.

### Operação mínima

- [ ] Adaptar os estados do pedido para entrega direta do varejista, removendo a premissa
  obrigatória de retirada/motoboy.
- [ ] Adaptar `/ops` para exibir cotação, varejista, modalidade, prazo, rastreio e exceções.
- [ ] Criar procedimento humano para `needs_human`, com responsável e tempo máximo de
  resposta.
- [ ] Criar procedimento de estorno quando a compra não puder ser concluída.
- [ ] Registrar eventos suficientes para auditar cada transição sem expor dados sensíveis.

## P0 — validação por varejista

### Petz

- [x] Conta persistente autenticada no Browserbase.
- [x] Endereço reconhecido no checkout.
- [x] Busca, produto, sacola, frete e prazo validados ao vivo.
- [x] Checkout alcançado sem finalizar compra.
- [ ] Testar cartão salvo e verificar quando CVV/3DS/antifraude são exigidos.
- [ ] Testar Pix do varejista apenas para entender o fluxo; não misturar com o Pix pago à
  Lia sem desenho financeiro explícito.
- [ ] Validar rastreio e comunicação pós-compra da entrega Petz.
- [ ] Executar primeiro pedido controlado entregue pela própria Petz.

### Carrefour

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [ ] Validar ao vivo o checkout com endereço, estoque, frete e prazo.
- [ ] Confirmar separadamente o fluxo de Carrefour alimentar e não alimentar.
- [ ] Validar pagamento, antifraude, nota fiscal, rastreio e entrega direta.
- [ ] Executar primeiro pedido controlado entregue pelo próprio Carrefour.

### Boticário

- [x] Busca ao vivo com URL e preço reais.
- [x] Automação de carrinho preparada.
- [ ] Validar ao vivo o checkout com endereço, estoque, frete e prazo.
- [ ] Validar titularidade, pagamento, antifraude, nota fiscal e entrega direta.
- [ ] Validar rastreio e comunicação pós-compra.
- [ ] Executar primeiro pedido controlado entregue pelo próprio Boticário.

## P1 — qualidade para lançamento público

### Conversa e experiência do cliente

- [ ] Ajustar a conversa para pedir endereço completo uma vez e sempre confirmá-lo no
  resumo do pedido.
- [ ] Não mostrar produto sem URL real, preço atual e possibilidade de montar carrinho.
- [ ] Resolver ambiguidades de tamanho, sabor, cor, quantidade e substituição antes da
  cobrança.
- [ ] Informar claramente quem entrega e nunca prometer “hoje” sem cotação ao vivo.
- [ ] Criar mensagens para produto indisponível, mudança de preço, atraso, falha de compra
  e estorno.
- [ ] Medir abandono e tempo em cada etapa da conversa.

### Testes e confiabilidade

- [x] `npx tsc --noEmit` aprovado após as mudanças atuais.
- [x] Testes focados de busca, compra e política aprovados.
- [x] Alinhar os evals históricos que esperam apenas CEP ao contrato atual de endereço
  completo. Os cenários agora simulam endereço completo + CEP e clientes recorrentes.
- [x] Deixar a suíte `npm test` inteira verde. A rodada de 15/07 passou com 201 testes;
  `npx tsc --noEmit` e `npm run build` também passaram.
- [ ] Criar testes de idempotência, cotação vencida, preço alterado e pagamento duplicado.
- [x] Criar testes unitários do payload Meta, parser, idempotência Pagar.me e resposta
  ambígua do PSP. Os testes de banco aguardam as migrations em um Postgres de teste.
- [x] Criar testes de queda do Browserbase, varejista indisponível e sessão expirada.
  `tests/carrefour-buyer.test.ts` cobre erro Browserbase 401/503, indisponibilidade exibida
  pelo varejista e sessão expirada; os casos falham fechados sem checkout.
- [ ] Medir latência p50/p95 por varejista; meta inicial de 15–30 s para cotação completa.
- [ ] Configurar alertas para falha de webhook, cobrança, carrinho, compra e estorno.

### Piloto e lançamento

- [ ] Definir grupo, limite de pedidos, ticket máximo, região e horário do piloto.
- [ ] Rodar de 5 a 10 pedidos controlados com entrega direta e acompanhamento humano.
- [ ] Registrar sucesso, tempo, margem, falhas, estornos e satisfação de cada pedido.
- [ ] Corrigir todos os incidentes financeiros P0 encontrados no piloto.
- [ ] Aprovar checklist final de operação, jurídico, financeiro e suporte.
- [ ] Definir critérios objetivos de `go/no-go` para abrir ao público.

## P2 — expansão depois do piloto

- [ ] Obter parceiro local ou contrato merchant/courier que autorize retirada por terceiro
  para oferecer same-day fora da entrega do varejista.
- [ ] Reavaliar Uber Direct somente para parceiros com autorização operacional formal.
- [ ] Criar isolamento de contas/sessões para aumentar concorrência por varejista.
- [ ] Avaliar novas lojas usando o mesmo gate: busca real, carrinho, entrega, termos,
  pagamento, pós-venda e piloto.
- [ ] Automatizar conciliação financeira e cálculo de margem por pedido.
- [ ] Criar painel de SLA por loja e modalidade de entrega.

## Registro de marcos

- **2026-07-14:** entrega direta do varejista definida como fluxo principal; retirada por
  motoboy deixou de ser premissa padrão.
- **2026-07-14:** Petz validada até a tela final de pagamento, sem concluir compra.
- **2026-07-14:** checklist canônico criado.
- **2026-07-14:** One-Click BR foi implementado com Meta Cloud API direta e Pagar.me;
  360dialog não é dependência de runtime. Ativação permanece bloqueada por allowlist,
  configuração externa e validação sandbox.
- **2026-07-15:** fluxo Carrefour foi alterado em código para cotar no checkout antes de
  cobrar: o carrinho `cart_only` precisa expor total, frete e prazo; o cliente confirma a
  forma de pagamento depois da cotação com validade curta. TypeScript, testes focados e
  build passaram; migration, deploy e validação ao vivo continuam pendentes.
- **2026-07-15:** migrations pendentes (One-Click e expiração da cotação) foram aplicadas
  em produção, e a cotação Carrefour foi implantada. A validação ao vivo corrigiu o gesto
  de regionalização para Enter, mas parou em `LOGIN_REQUIRED` antes de limpar/adicionar
  qualquer item; reautenticar o Context Carrefour é o próximo passo.
