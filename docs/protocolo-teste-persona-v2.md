# Protocolo de teste por persona — RODADA 2 (26/08, pós-consertos)

_Sucede o [protocolo v1](protocolo-teste-persona.md). Desenho: 20 sessões com ROTEIRO
FIXO — 8 sondas de regressão sobre as feridas exatas do relatório de 26/08 (sem contar
ao testador o que esperar) + 12 de chão novo (rajadas, pausas longas, botões de frete,
troca de loja do mínimo, lista com correção fina, recompra, troca de endereço no
fechamento). Novidade estrutural: AUDITORIA ITEM A ITEM obrigatória de todo total — foi
ela que pegou o P0.1 na rodada 1._

## Réguas de aprovação (gates da rodada)

- ZERO cesta contaminada/total com item não pedido (era 1 na rodada 1).
- ZERO "estorno"/pós-pagamento sem pagamento real (eram 6 sessões).
- Média ≥ 8/10 (era 4,30 auditada) · "não entendi" totais < 20 (eram 59).
- Sessões com perda de estado: 0 (eram 12/20).

## Mapa das sondas (NÃO colar no testador — é a grade de correção nossa)

S1→P0.1 (cancelar no meio de busca; total limpo) · S2→P0.2 (status na compra atual;
"nada foi cobrado") · S3→P1.6 (dipirona em 2 etapas) · S4→P1.3 (teto + paginação) ·
S5→P0.3 (item caro em lista vira cards) · S6→P2.4 (fuga da pergunta de quantidade) ·
S7→P1.2+P1.5 (preço da entrega; identidade/golpe compostos) · S8→P1.7 (troca atômica)
· S9→concorrência/rajada · S10→troca de loja do mínimo (recusar→aceitar) · S11→lista +
correção fina ("em vez da"/"não quero de X") · S12→botões de frete + mudança de escolha
· S13→pausa longa/TTL · S14→regateio+mais barato · S15→recusa honesta · S16→memória de
recompra (esperado FRACO — ciclo futuro) · S17→cancelar com Pix emitido + status depois
· S18→fragmentação de frete (P1.8, MEDIR — conserto é ciclo futuro) · S19→troca de
endereço no fechamento · S20→pessoa normal, sem caos (linha de base).

## O prompt (colar num agente SEM contexto do produto)

O prompt completo da rodada 2 — personas A1-A7, roteiro S1-S20, scorecard com auditoria
obrigatória, relatório comparativo com a rodada 1 e regras de segurança (nunca pagar;
página de cartão só OLHAR, nunca digitar cartão) — foi entregue ao dono no chat em
26/08 e deve ser colado literalmente. Ao editar, preservar as três leis do v1 (corte de
contexto, objetivo em vez de expectativa, nunca pagar) e a auditoria item a item.
