# Operação, canais e formalização — julho de 2026

Foto operacional da Lia em julho de 2026, atualizada em 14/07/2026. Este documento separa o que já foi ativado do
que ainda impede a operação pública em escala. Para o produto e arquitetura, veja
[STATUS.md](../STATUS.md) e [CLAUDE.md](../CLAUDE.md).

> Decisão vigente: entrega do próprio varejista é o fluxo principal. A premissa
> `clique-e-retire + qualquer motoboy` foi invalidada pelas políticas oficiais da Petz e
> do Carrefour. Detalhes em
> [decisoes-operacionais-2026-07-14.md](decisoes-operacionais-2026-07-14.md).

## Já encaminhado ou ativo

| Frente | Situação | Observação operacional |
| --- | --- | --- |
| Domínio e landing | Ativo | `liadelivery.com.br` está no ar com HTTPS. |
| Meta / WhatsApp oficial | Ativo | Sender `+55 11 97844-4813` aprovado e registrado na Cloud API, com webhook assinado. |
| Canal de teste | Legado | Twilio Sandbox fica como referência de teste; a produção usa a Cloud API da Meta. |
| E-mail do domínio | Configurado | `contato@liadelivery.com.br` está configurado no ImprovMX e é o canal para resolver a verificação da Meta. |
| Formalização | Encaminhada | MEI/CNPJ aberto; falta alinhar a conta Mercado Pago PJ e emissão de nota. |
| Pix | Real e testado | Mercado Pago gera Pix copia-e-cola e recebe confirmação pelo webhook. |
| Cartão | Real | Checkout Pro gera link hospedado; a taxa é repassada ao cliente. |
| Cartão One-Click | Código pronto, não ativado | Meta Cloud API direta + Pagar.me; depende de allowlist BR, migrations, domínio/chaves/webhook e sandbox. Não usa 360dialog. |
| Qualificação externa de Payments | Em andamento | Em 16/07, Samuel Santana, da Infobip, pediu volume, mix Utility/Marketing, países e canais para avaliar `order_details` / `offsite_card_pay` com Mercado Pago PJ. A Infobip documenta Payments no Brasil, mas ainda não há aprovação técnica nem garantia de Cloud API direta. |
| Motoboy | Técnica pronta, operação restrita | Uber Direct: OAuth e cotação validados. Só pode ser usado quando o ponto de retirada reconhecer formalmente o courier. |
| Operação interna | Implementada localmente, pendente de deploy | `/ops` usa compra → preparação → entrega/rastreio do varejista, bloqueia courier externo em entrega direta e separa estorno pendente de estorno confirmado. |
| Acesso ao `/ops` | Ativo | `OPS_TOKEN` dedicado, Sensitive em Production e Preview, criado e implantado em 16/07; não substitui `API_TOKEN`. |
| Área atendida | Em revisão | Estado de SP e guarda de 12 km são legado do motoboy. Na entrega direta, o checkout da loja decide cobertura por CEP. |

## Meta e WhatsApp: estado correto

A Lia usa a WhatsApp Cloud API em produção. O sender `+55 11 97844-4813` foi aprovado
como `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e associado
ao webhook `https://liadelivery.com.br/api/whatsapp/webhook`. O webhook valida assinaturas
da Meta antes de processar qualquer mensagem.

Em 16/07, foi recebida de Samuel Santana, da Infobip, uma resposta comercial sobre o
possível fluxo de WhatsApp Payments com `order_details` / `offsite_card_pay` e Mercado Pago
PJ. A Infobip documenta oficialmente WhatsApp Payments para Brasil e orienta acionar o
gerente de conta ou suporte para implementação, o que torna o contato uma via plausível de
habilitação. Fontes: [WhatsApp Payments](https://www.infobip.com/docs/whatsapp/whatsapp-payments)
e [funcionalidades adicionais](https://www.infobip.com/docs/whatsapp/additional-functionality).

O contato pediu projeções de transações/mensagens, classificação Utility/Marketing, países
e canais antes de envolver os especialistas. A resposta deve tratar os números como
estimativas de MVP e registrar como requisitos a preservação da WABA, do número, da Graph
API, do webhook e da integração direta com a Cloud API. A documentação padrão de cadastro
de sender da Infobip também contempla conexão/migração do número para a API deles
([sender registration](https://www.infobip.com/docs/whatsapp/get-started/before-starting-embedded-signup));
portanto, não conceder essa mudança implicitamente. O contato não constitui allowlist,
aprovação do PSP nem emissão de `credential_id`; esses pontos, custos, prazo e arquitetura
final precisam ser confirmados por escrito.

Na frente Pagar.me, a revisão documental de 16/07 confirmou que o `tokenizecard.js` envia
os dados diretamente ao PSP e requer domínio liberado, e que pedidos podem usar `card_id`.
A documentação atual também distingue `recurrence_cycle=first|subsequent` e orienta que o
CVV apareça apenas na primeira transação de recorrência externa. Como o adaptador atual usa
`card_id` sem marcar o ciclo, é obrigatório confirmar com o Pagar.me como classificar a
primeira compra e as recompras avulsas confirmadas no WhatsApp antes de alterar o payload ou
testar cartão real. Fontes: [Tokenizecard JS](https://docs.pagar.me/reference/pagarme-js),
[criar pedido](https://docs.pagar.me/reference/criar-pedido-2) e
[cartão de crédito](https://docs.pagar.me/reference/cart%C3%A3o-de-cr%C3%A9dito-1).

## Rotina operacional de um pedido

1. Cliente fala com a Lia pelo WhatsApp, informa endereço e itens.
2. A Lia escolhe uma loja e monta uma sacola temporária antes de cobrar.
3. O checkout do varejista calcula preço, estoque, frete e prazo para aquele endereço.
4. A Lia apresenta a cotação com validade curta e recebe Pix ou cartão.
5. Após o pagamento, a Lia revalida a sacola e o operador aprova a compra no piloto.
6. O varejista entrega diretamente; a Lia acompanha e comunica o cliente.

Para “entrega hoje”, a Lia pode usar a modalidade same-day do próprio varejista. Um motoboy
externo só entra quando houver parceiro local/contrato que autorize a coleta. Não enviar
documento do titular a entregador on-demand.

## Antes de abrir o piloto

- Usar Mercado Pago PJ e definir emissão de nota fiscal; hoje o Pix ainda está em nome
  pessoal.
- Regenerar token do Mercado Pago e segredo/credenciais da Uber que foram expostos em chat,
  depois atualizar a Vercel.
- Validar termos, nota fiscal, troca/devolução e uso de conta central para múltiplos
  destinatários.
- Mover a confirmação de preço/frete/prazo real para antes da cobrança do cliente.
- Fazer 5–10 pedidos controlados com entrega do varejista, medindo cotação, aprovação,
  prazo, divergência de preço/estoque e pós-venda.
- Não pilotar retirada por terceiro na Petz/Carrefour como fluxo de escala.
- Para One-Click, seguir integralmente
  [whatsapp-one-click-pagarme.md](whatsapp-one-click-pagarme.md) antes de ligar a flag.

## Limites atuais

Uma cesta continua limitada a uma loja. A busca ao vivo e o carrinho Browserbase reduzem
desatualização, mas preço, estoque, frete e prazo ainda devem ser revalidados antes da
cobrança e da compra. Cada Context Browserbase já usa lease persistente e fila: somente um
carrinho pode operar por vez; conflitos voltam a `preflight_queued` para retry controlado.

O preset geográfico atual deve ser tratado apenas como filtro comercial. Para entrega do
varejista, distância até uma unidade não substitui a resposta do checkout.

## Atualização operacional — 16/07/2026

Foi criado um `OPS_TOKEN` dedicado no projeto Vercel, marcado como Sensitive em Production e
Preview, sem revelar seu valor nem substituir `API_TOKEN`. O redeploy de produção subsequente
ficou `Ready`, e a autenticação do painel `/ops` foi confirmada. A fila exibiu somente pedidos
legados pagos e alguns cancelados; eles não devem ser reutilizados para o preflight atual. Foi
criado um pedido técnico isolado com SKU Carrefour exato e somente a região persistida no
Context, em `cart_only`; nenhum endereço real foi copiado, nem houve WhatsApp, cobrança ou
compra. O workflow retornou `PREFLIGHT_NEEDS_HUMAN`, pois não confirmou juntos item, total,
frete e prazo. O diagnóstico de 16/07 confirmou que esses campos estão no carrinho completo,
não no minicarrinho: item R$ 1,99, frete a partir de R$ 9,90, prazo a partir de sábado e total
R$ 11,89. O conector e a operação foram corrigidos e implantados, incluindo submit do CEP,
parsers por linha, limpeza segura, status/logs e `/ops/teste-carrefour`. O retry Browserbase
avançou até `LOGIN_REQUIRED`; uma sessão viva foi aberta para reautenticação humana. Não houve
WhatsApp, cobrança ou compra, e os valores mapeados ainda não são cotação operacional validada.
As credenciais Carrefour enviadas no chat em 16/07 não foram persistidas. O inspetor remoto
não ofereceu campos automatizáveis com segurança; uma nova sessão viva ficou aberta para
login humano, e a senha deve ser rotacionada antes do piloto.

Depois do login humano, o preflight superou a etapa de autenticação mas falhou fechado porque
o minicarrinho não expôs o CTA para o resumo completo. Há um fallback seguro para abrir somente
`/checkout/cart`, publicado em 16/07. A primeira publicação pré-construída revelou que o Prisma
gerado no macOS não incluía o binário do runtime Linux ARM da Vercel; o schema foi corrigido, o
artefato reconstruído e o novo deploy ficou `Ready`. O POST do preflight voltou a responder 200,
mas o workflow atual falhou fechado em `LOGIN_REQUIRED`; uma sessão viva nova aguarda login
humano. Nenhuma cobrança, compra ou mensagem foi disparada e a cotação real permanece pendente.

Na sequência de 16/07, o painel Browserbase autenticado foi confirmado e outra sessão Carrefour
foi aberta para login humano. A autenticação não foi concluída, sem causa confirmada, e o teste
foi adiado pelo operador. Não abrir novas sessões nem repetir o preflight até uma nova tentativa
coordenada. Nenhuma cobrança, compra ou mensagem foi disparada.

Também em 16/07, a fila por Context foi extraída para um coordenador testável. A cobertura
confirma que carrinhos concorrentes não se misturam, que um lease vencido pode ser recuperado e
que falhas de banco/configuração não viram retry de Context ocupado. O lease é persistente, dura
15 minutos e o workflow repete conflitos a cada minuto por até uma hora. Não houve navegador,
checkout, cobrança ou compra nesta alteração.

Ainda em 16/07, a operação do `/ops` foi alinhada localmente ao fluxo de entrega direta. Os
estados novos são `retailer_preparing` e `retailer_out_for_delivery`; o sistema impede que um
pedido `retailer_delivery` acione Uber Direct ou outro courier externo. O painel expõe promessa,
validade da cotação e rastreio do varejista, mantendo retirada apenas para parceiros autorizados.

Cancelamento depois do pagamento agora cria `refund_pending`. O cliente só recebe confirmação
de estorno depois que o operador executa a devolução no provedor e registra a referência, quando
o pedido muda para `refunded`. O procedimento canônico está em
[operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md). Um PIN de
registro encontrado em Markdown local foi removido e precisa ser rotacionado. TypeScript, lint,
210 testes e build passaram; essa frente ainda não foi implantada ou validada ao vivo.
