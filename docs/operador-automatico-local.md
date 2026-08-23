# Operador automático local — piloto seguro

O primeiro piloto roda no Mac e consulta a fila de pedidos pagos. Ele aceita somente
pedidos do Mercado Livre cujos itens tenham links exatos de anúncios. Linhas livres,
cestas mistas e qualquer ambiguidade continuam no `/ops`.

## Régua operacional

1. `PURCHASE_AUTOMATION_MODE=cart_only`: abre o anúncio, confere item, quantidade,
   endereço, prazo e total, mas para antes do botão final.
2. Nunca trocar produto, vendedor, endereço ou modalidade por aproximação.
3. Total acima do valor aprovado, carrinho alterado, login/2FA, CAPTCHA ou divergência
   de prazo: marcar `needs_review` e devolver ao operador.
4. Antes da confirmação final, procurar o número do pedido no Mercado Livre e no `/ops`.
   Se já existir, reconciliar; nunca enviar novamente.
5. Não registrar cookies, cartão, códigos de 2FA ou dados completos do cliente nos logs.

## Configuração local

Use o mesmo segredo longo em `LIA_PURCHASE_WORKER_TOKEN` no app e no processo local.
Defina `LIA_APP_URL` para a URL do app. Depois execute:

```sh
npm run purchase-worker:claim
```

Sem trabalho, a resposta contém `"job": null`. Havendo pedido, ela contém uma tarefa
com links exatos, quantidades, teto de valor e endereço. O lease dura 15 minutos; falhas
recuperáveis voltam à fila depois de 5 minutos.

## Luna e recorrência

A tarefa recorrente deve usar Luna e, a cada hora, executar o comando acima. Com um job,
ela prepara e valida o carrinho no navegador. Enquanto o modo for `cart_only`, pede a
confirmação humana no último passo. O modo `purchase` só pode ser habilitado depois que
aprovação com validade, hash do carrinho e teto de valor estiver funcionando de ponta a
ponta em produção.
