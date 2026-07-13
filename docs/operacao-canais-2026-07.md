# Operação, canais e formalização — julho de 2026

Foto operacional da Lia em julho de 2026. Este documento separa o que já foi ativado do
que ainda impede a operação pública em escala. Para o produto e arquitetura, veja
[STATUS.md](../STATUS.md) e [CLAUDE.md](../CLAUDE.md).

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
| Motoboy | Real e testado | Uber Direct: OAuth e cotação com credenciais validados. O despacho depende do operador depois da compra. |
| Operação interna | Ativa | `/ops` organiza pago → compra → retirada → despacho → entregue, com aviso ao cliente e sinalização de cancelamento. |
| Área atendida | Configurada | Estado de SP por preset, com trava de cidade e distância até uma loja; CEP sem cobertura vira lead no mapa de demanda. |

## Meta e WhatsApp: estado correto

A Lia usa a WhatsApp Cloud API em produção. O sender `+55 11 97844-4813` foi aprovado
como `Lia Delivery by 67.742.955 Joseph Carlos Dayan`, registrado na Cloud API e associado
ao webhook `https://liadelivery.com.br/api/whatsapp/webhook`. O webhook valida assinaturas
da Meta antes de processar qualquer mensagem.

## Rotina operacional de um pedido

1. Cliente fala com a Lia pelo WhatsApp, informa CEP e itens.
2. A Lia escolhe uma única loja, cota o frete e recebe Pix ou cartão.
3. Quando o pagamento confirma, o pedido aparece no `/ops`.
4. Operador confere preço/estoque no link do item, compra no clique-e-retire e registra o
   número do pedido.
5. Operador despacha o motoboy; ele retira com o número do pedido, documento do titular e
   autorização.
6. Operador marca a entrega; a Lia comunica o cliente.

No início, o motoboy deve ser conhecido e ter CPF previamente alinhado com a retirada. O
Uber Direct já é a integração de cotação/despacho, mas não substitui a validação prática de
retirada por terceiro no balcão.

## Antes de abrir o piloto

- Usar Mercado Pago PJ e definir emissão de nota fiscal; hoje o Pix ainda está em nome
  pessoal.
- Regenerar token do Mercado Pago e segredo/credenciais da Uber que foram expostos em chat,
  depois atualizar a Vercel.
- Confirmar presencialmente as novas unidades antes do primeiro pedido local: abertas,
  clique-e-retire habilitado e retirada por terceiro aceita.
- Fazer 5–10 pedidos controlados, começando com motoboy conhecido, para testar a retirada,
  a aceitação do preço final e a divergência de estoque/preço.

## Limites atuais

O catálogo ainda é estático e uma cesta é limitada a uma loja. Preço e estoque devem ser
conferidos pelo operador antes da compra; a checagem automática por pedido pago continua
como evolução pós-piloto.
