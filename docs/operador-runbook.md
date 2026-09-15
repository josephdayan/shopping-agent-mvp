# Runbook do Operador da Lia

_Guia de quem compra os pedidos. Reescrito em 15/09/2026 para o operador contratado._

> A compra automática está **suspensa** por decisão de 15/09/2026. A fila do `/ops` é a
> única rota. O que existia de comprador automático (janela do Chrome no Mac do dono,
> Pix de saída, allowlist de lojas) está descrito em
> [operador-automatico-local.md](operador-automatico-local.md) e não deve ser ligado.

## O que é a Lia e onde você entra

A Lia é uma assistente de compras no WhatsApp. O cliente pede o que quer em linguagem
normal, a Lia mostra preço, frete e prazo, e ele paga por Pix ou cartão na própria
conversa. **A partir daí é com você**: comprar aqueles itens no site da loja e mandar
entregar no endereço do cliente.

Você **não** fala com o cliente, **não** cobra nada e **não** usa dinheiro seu. A Lia
cuida da conversa e da cobrança; o dinheiro do cliente já está na conta da operação.

## Entrar no painel

Mande **ops** para a Lia no WhatsApp, do seu número cadastrado. Ela responde com um link
que vale 10 minutos. Ao abrir, o painel fica logado por 1 ano naquele aparelho.

O painel se atualiza sozinho a cada 10 segundos. Deixe aberto.

## O ciclo de um pedido

1. **"🧮 Cotar"** — o cliente pediu algo que a Lia não conseguiu precificar sozinha.
   Ache o preço real de cada item (o link **🔎 ver** abre a busca na loja) e preencha
   **custo dos produtos**, **frete** e **prazo**. Clique **Enviar cotação ao cliente**.
   A margem entra sozinha; nada é cobrado ainda.
2. **"💳 Pago — comprar"** — o cliente pagou. Use **🛒 Abrir itens na loja** e
   **📋 Copiar lista**. Compre com o **cartão da operação**, escolhendo a **entrega da
   própria loja** para o endereço do cliente que está no card.
3. **Registre a compra** — cole o número do pedido da loja em **Confirmar compra na
   loja** (e o link do pedido, se a loja tiver). O cliente é avisado na hora.
4. **"🚚 Loja saiu para entrega"** quando a loja despachar, e **Marcar entregue** quando
   o cliente receber. Fim.

**Prazo combinado:** comprar em até 2 horas depois que o pedido aparece, entre 9h e 20h.
Pedido que cai fora desse horário fica para a manhã seguinte — a Lia já avisa o cliente.

## Quando algo dá errado

- **Faltou o item, ou o preço subiu muito:** não troque por conta própria e não invente
  preço. Use o campo **avisar cliente** ("o X acabou, troco pelo Y?") e espere.
- **Não deu para comprar** (sem estoque, loja não entrega no CEP, pedido mínimo): clique
  **↩️ Não consegui comprar → estornar** e escreva o motivo em uma linha. O valor volta
  para o cliente sozinho e ele recebe a explicação.
- **Faixa vermelha "⚠️ CLIENTE PEDIU CANCELAMENTO":** pare. Não compre nem despache.
  Avise o responsável pela operação.
- **Estorno, cancelamento de pedido pago, qualquer dúvida com dinheiro:** é decisão do
  responsável pela operação. Esses botões não aparecem para você de propósito.
- **Pedido parado:** depois de 30 min, 2h e 6h sem compra a Lia cobra você por WhatsApp.
  Sem compra por 24h (ou 48h na fila manual), o sistema estorna o cliente sozinho.

## O que NUNCA fazer

- Usar cartão, conta ou dinheiro seus. Só o cartão da operação.
- Resolver CAPTCHA ou qualquer verificação de robô em nome da operação.
- Falar com o cliente fora do painel, ou passar seu contato pessoal.
- Comprar remédio, mesmo sem receita. É proibido por lei para a operação.
- Trocar um item por outro sem o cliente confirmar.
- Repetir um clique de compra ou pagamento na dúvida se deu certo. Confira antes.

## Onde comprar rápido (mapa de sourcing)

A amplitude é o diferencial da Lia: o cliente pode pedir **qualquer coisa** e a resposta
nunca é "não temos". Complete com o que funcionar na sua região.

| Categoria | Primeira opção | Alternativa |
| --- | --- | --- |
| Mercado grande / variedade | **Carrefour / Extra (hipermercado)** | Assaí, Roldão (atacado) |
| Hortifruti / mercearia premium | Oba | Mercado de bairro |
| Carnes / churrasco | Swift (entrega própria) | Açougue local / hipermercado |
| Pet | Petz | Cobasi |
| Beleza / presente | O Boticário | Farmácia grande (dermocosméticos) |
| Farmácia (sem remédio!) | **Droga Raia** / Drogasil | Farmácia de bairro |
| Papelaria / escritório | Kalunga | Papelaria de bairro |
| Eletrônicos / acessórios | Fast Shop / Casas Bahia | Loja de shopping próximo |
| Casa / manutenção | Leroy Merlin | Telhanorte / material local |
| Utilidades / variedades | Americanas / loja de R$1,99 | Shopping popular |
| Presente / flores | Floricultura local | Kopenhagen / Cacau Show |
| Bebê (fralda, lenço, fórmula*) | Droga Raia / Drogasil | Hipermercado |
| Festa / bebidas / gelo | Adega local | Distribuidora de bebidas |
| Esporte | Decathlon | Centauro |
| Brinquedo | Ri Happy | Americanas / hipermercado |

*Fórmula infantil é venda livre em farmácia; suplemento ou medicamento infantil não. Na
dúvida sobre um item de farmácia, trate como remédio e recuse.

Item muito específico (marca rara, importado): confirme a disponibilidade **antes** de
enviar a cotação, para não prometer o que não tem.

---

## Para o responsável pela operação

O painel tem dois acessos. O **seu** (`OPS_TOKEN`) abre tudo. O do **operador**
(`OPS_OPERATOR_TOKEN`) abre só a fila e as ações de comprar, avisar e entregar; contas
das lojas, catálogo, mapa de demanda, configuração da Meta e as ações de dinheiro
(cancelar pedido pago, estornar, confirmar estorno) respondem 403 para ele. Trocar o
token do operador derruba só a sessão dele.

Telefones: `LIA_OWNER_PHONE` é você (recebe cobrança falhada, pagamento fora do esperado,
estorno automático, reclamação de cobrança). `LIA_OPERATOR_PHONE` é quem compra (recebe
pedido pago e pedido parado; a partir de 6h parado você também recebe). Sem
`LIA_OWNER_PHONE` os dois papéis continuam no mesmo número, como antes.

Horário prometido ao cliente: `LIA_OPERATOR_HOURS` (padrão `9-20`, horário de São Paulo).

### Estorno automático

- Pedido pago com nota "🛑 COMPRA BLOQUEADA" há **6 horas** → estorno integral, cliente
  avisado com o motivo.
- Pedido pago **sem compra registrada há 24 horas** (48h na fila manual) → idem.
- Pedido já em "comprando" ou com número da loja registrado nunca é tocado.
- "⚠️ ESTORNO AUTOMÁTICO FALHOU" na nota: o provedor recusou; o sistema tenta a cada 10
  min. Se persistir, use "Estornar pelo provedor". Desligar tudo: `LIA_AUTO_REFUND_OFF=true`.

### Plano B automático e pré-voo

- **Pré-voo:** quando o cliente escolhe Pix/cartão, a loja é consultada de novo. Se o item
  sumiu, nada é cobrado e o cliente já recebe outras opções.
- **Plano B:** com "🛑 COMPRA BLOQUEADA" na nota de um pedido pago, em até 10 minutos a
  Lia oferece um substituto confirmado em outra loja. Se o cliente aceitar, o operador
  recebe "🛒 Pedido #…: cliente aceitou a troca. Comprar agora: <item> — <loja> <link>".

### Metas do piloto (internas, não são promessa ao cliente)

- Cotar um pedido novo em até ~15 min.
- Comprar um pedido pago em até 2h, dentro do horário.
- Anotar por pedido: quanto tempo levou e quanto sobrou de margem depois do frete.
