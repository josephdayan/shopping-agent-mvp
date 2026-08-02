# Rotina fiscal da Lia (MEI) — decisão de 02/08/2026

Decisão operacional registrada a pedido do dono. Vale para o piloto e até segunda ordem.
Confirmar o enquadramento com orientação contábil pontual **antes do lançamento público**
(não é necessário contador mensal).

## Enquadramento adotado

- A Lia opera como **serviço de intermediação/concierge de compras** prestado pela PJ (MEI).
- A nota fiscal do **produto** é a do próprio varejista (Carrefour, Petz etc.), emitida na
  compra feita pela PJ; ela acompanha o pedido e fica arquivada como comprovante do repasse.
- A **receita da Lia** é o serviço de concierge (markup de 10% + coordenação da entrega).
  O custo do produto e o frete são repasse (pass-through) documentado pela NF do varejista.

## Quando emitir documento fiscal

| Cliente | Regra |
|---|---|
| Pessoa física (piloto) | **Dispensado de NF**, salvo se o cliente pedir. |
| PF que pedir NF | Emitir **NFS-e pelo Emissor Nacional** (portal gov.br do MEI) sobre o serviço. |
| Pessoa jurídica | **Sempre** emitir NFS-e (documento fiscal é obrigatório na venda a PJ). |

- O piloto atende **somente PF**, então na prática nenhuma emissão é esperada.
- Não emitir NF-e/NFC-e de mercadoria: a Lia não revende estoque próprio; o documento da
  mercadoria é a NF do varejista. Se a orientação contábil futura discordar, revisar aqui.

## Rotina mensal (obrigações do MEI)

1. **DAS** — pagar a guia mensal (vencimento dia 20).
2. **Relatório Mensal de Receitas Brutas** — preencher até o dia 20 do mês seguinte,
   anexando as NFs de compra (varejistas) e as NFS-e emitidas, se houver.
3. Arquivar por pedido: cotação aprovada, comprovante Pix/cartão do cliente, NF do
   varejista e comprovante do frete. O `/ops` já registra custo, margem e o que o cliente
   pagou — exportar/print no fechamento do mês.
4. **DASN-SIMEI** — declaração anual (até 31/05).

## Ponto a confirmar com orientação contábil pontual (pré-lançamento público)

- Se a receita bruta do MEI, neste desenho de intermediação, é **só o markup** ou o
  **total recebido**. Isso importa pelo teto anual do MEI (R$ 81 mil): contando o total,
  o teto se esgota rápido; contando só a comissão, dura muito mais. Até a confirmação,
  registrar internamente as duas visões (o `/ops` já separa custo × margem).
- CNAE do MEI compatível com intermediação/agenciamento de compras.
