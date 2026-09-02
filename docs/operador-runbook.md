# Runbook do Operador da Lia

_Guia de 1 página pra quem opera os pedidos. Criado em 2026-07-20._

> **Nota de 02/09/2026.** Este runbook descreve o fluxo de julho (motoboy saindo da base).
> Hoje o padrão é: a Lia cota na hora com preço da vitrine, o cliente paga, **você compra
> no site da loja/ML como cliente comum e a loja entrega**; "motoboy na hora" é exceção.
> O botão **"Cancelar e solicitar estorno"** voltou ao card de pedido pago (revisão de
> 01/09); pedido esperando Pix/cartão agora aparece na fila. Frete e custo aceitam vírgula
> ("12,90").

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
  informa o valor (vazio = total) e confirma com a referência (botão **Confirmar estorno**).
  O campo aceita estorno parcial do item faltante. Detalhes:
  [operacao-piloto-needs-human-estorno.md](operacao-piloto-needs-human-estorno.md).
- **Faixa vermelha "⚠️ CLIENTE PEDIU CANCELAMENTO":** o cliente pediu no WhatsApp. **Fale com
  o responsável antes de comprar ou despachar** esse pedido.

## Onde comprar rápido (mapa de sourcing)

A amplitude é o diferencial da Lia: o cliente pode pedir **qualquer coisa** e a resposta
nunca é "não temos". Este mapa é o ponto de partida — complete com o que funcionar na
sua região e anote os achados.

| Categoria | Primeira opção | Alternativa |
| --- | --- | --- |
| Mercado grande / variedade | **Carrefour / Extra (hipermercado)** | Assaí, Roldão (atacado) |
| Hortifruti / mercearia premium | Oba | Mercado de bairro |
| Carnes / churrasco | Swift (entrega própria) | Açougue local / hipermercado |
| Pet | Petz | Cobasi |
| Beleza / presente | O Boticário | Farmácia grande (área de dermocosméticos) |
| Farmácia (sem remédio!) | **Droga Raia** / Drogasil | Farmácia de bairro |
| Papelaria / escritório | Kalunga | Papelaria de bairro |
| Eletrônicos / acessórios | Fast Shop / Casas Bahia | Loja de shopping próximo |
| Casa / manutenção | Leroy Merlin | Telhanorte / loja de material local |
| Utilidades / variedades | Americanas / loja de R$1,99 | Shopping popular |
| Presente / flores | Floricultura local | Chocolateria (Kopenhagen/Cacau Show) |
| Bebê (fralda, lenço, fórmula*) | Droga Raia / Drogasil | Hipermercado |
| Festa / bebidas / gelo | Adega local | Hipermercado / distribuidora de bebidas |
| Esporte | Decathlon | Centauro |
| Brinquedo (presente de última hora) | Ri Happy | Americanas / hipermercado |

*Fórmula infantil é venda livre em farmácia — mas suplemento/medicamento infantil não; na
dúvida sobre um item de farmácia, trate como remédio e recuse.

- **Remédio nunca** (nem OTC) — é lei, e a Lia já recusa na conversa.
- Compare o preço na hora de cotar; o preço que você digita é o custo real.
- Item muito específico (marca rara, importado): confirme a disponibilidade ANTES de
  enviar a cotação, para não prometer o que não tem.

## Regras de ouro

- **Nunca cobre o cliente à mão.** A Lia cobra. Você só cota e compra.
- **Nunca prometa um prazo que não consegue cumprir.** Na dúvida, coloque um prazo folgado.
- **Só clique "despachar motoboy" com os produtos já em mãos.**
- **Se o despacho já foi confirmado, repetir o clique não cria outro courier**; confira o
  rastreio existente no card.
- **Dúvida financeira ou algo estranho → pare e chame o responsável.** Não repita um clique
  de compra/pagamento se ficou em dúvida se deu certo.

## Metas do piloto (internas, não são promessa ao cliente)

- Cotar um pedido novo em até ~15 min.
- Reconhecer uma exceção (faltou item, cliente pediu cancelamento) em até ~10 min.
- Anotar por pedido: quanto tempo levou e quanto sobrou de margem depois do frete.
