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
| Motoboy | Técnica pronta, operação restrita | Uber Direct: OAuth e cotação validados. Só pode ser usado quando o ponto de retirada reconhecer formalmente o courier. |
| Operação interna | Em adaptação | `/ops` ainda reflete pago → retirada → despacho; precisa suportar compra → entrega/rastreio do varejista. |
| Área atendida | Em revisão | Estado de SP e guarda de 12 km são legado do motoboy. Na entrega direta, o checkout da loja decide cobertura por CEP. |

## Meta e WhatsApp: estado correto

A Lia usa a WhatsApp Cloud API em produção. O sender `+55 11 97844-4813` foi aprovado
como `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e associado
ao webhook `https://liadelivery.com.br/api/whatsapp/webhook`. O webhook valida assinaturas
da Meta antes de processar qualquer mensagem.

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
cobrança e da compra. Cada pedido precisa de sessão/carrinho isolado ou fila por Context.

O preset geográfico atual deve ser tratado apenas como filtro comercial. Para entrega do
varejista, distância até uma unidade não substitui a resposta do checkout.
