# Runbook do Operador da Lia

_Guia de 1 página pra quem opera os pedidos. Criado em 2026-07-20._

Você é a pessoa que **compra os pedidos e manda entregar**. O cliente pede pela Lia no
WhatsApp; a Lia mostra o pedido pra você no painel; **você cota, compra e despacha**. A Lia
cuida da conversa e da cobrança — você não fala com o cliente nem cobra à mão.

## Entrar no painel

Abra **uma vez** o link `https://liadelivery.com.br/ops?key=SEU_TOKEN`. Depois disso, é só
`liadelivery.com.br/ops`. Deixe aberto — pedidos novos aparecem sozinhos.

## O ciclo de um pedido (4 passos)

1. **Chega um pedido "🧮 Cotar (concierge)".** Ele mostra o que o cliente pediu.
   - Ache o preço real de cada item (o link **🔎 ver** abre a busca na loja).
   - Preencha: **custo dos produtos** (o que VOCÊ vai pagar), **frete** (o do motoboy),
     **modalidade** e **prazo**. Clique **Enviar cotação ao cliente**.
   - A Lia soma os 10% de margem sozinha e manda o total pro cliente. **Nada é cobrado ainda.**

2. **Cliente paga → o card vira "💳 Pago — comprar".**
   - Compre os itens de verdade. Use **🛒 Abrir itens na loja** e **📋 Copiar lista** pra ir rápido.
   - Pague com o **cartão da operação** (o dinheiro do cliente já caiu na conta da Lia).

3. **Com as compras na mão, na base → clique "🛵 Comprei — despachar motoboy".**
   - O motoboy é chamado sozinho e **sai da sua base** (não de uma loja). Só clique quando
     já estiver com os produtos em mãos.

4. **Quando o cliente receber → clique "Marcar entregue".** Fim.

## Modalidade: motoboy na hora × entrega da loja

- **🛵 motoboy na hora** (padrão): você compra e o motoboy leva. É a entrega rápida.
- **🚚 entrega do varejista**: use quando a própria loja já entrega no dia. Aí **não tem
  motoboy** — a loja entrega e você só acompanha.

## Quando algo dá errado

- **Faltou um item ou o preço subiu muito:** use o campo **avisar cliente** ("o X acabou,
  troco pelo Y?"). Nunca troque por conta própria nem invente preço.
- **Cliente quer cancelar / precisa estornar:** clique **Cancelar e solicitar estorno**. Isso
  marca **ESTORNO PENDENTE**. O estorno de verdade é feito no Mercado Pago; só depois você
  confirma com a referência (botão **Confirmar estorno**). Detalhes:
  [operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md).
- **Faixa vermelha "⚠️ CLIENTE PEDIU CANCELAMENTO":** o cliente pediu no WhatsApp. **Fale com
  o responsável antes de comprar ou despachar** esse pedido.

## Regras de ouro

- **Nunca cobre o cliente à mão.** A Lia cobra. Você só cota e compra.
- **Nunca prometa um prazo que não consegue cumprir.** Na dúvida, coloque um prazo folgado.
- **Só clique "despachar motoboy" com os produtos já em mãos.**
- **Dúvida financeira ou algo estranho → pare e chame o responsável.** Não repita um clique
  de compra/pagamento se ficou em dúvida se deu certo.

## Metas do piloto (internas, não são promessa ao cliente)

- Cotar um pedido novo em até ~15 min.
- Reconhecer uma exceção (faltou item, cliente pediu cancelamento) em até ~10 min.
- Anotar por pedido: quanto tempo levou e quanto sobrou de margem depois do frete.
