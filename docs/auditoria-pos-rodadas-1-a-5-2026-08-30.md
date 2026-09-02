# Auditoria pós-rodadas 1–5 — 30/08/2026

## Veredito

Os consertos das cinco rodadas estão cobertos e a base ficou integralmente verde, mas o
pente-fino encontrou sete lacunas residuais nos ciclos mais recentes. Todas foram
corrigidas antes deste relatório. A validação final foi **479/479 testes aprovados,
zero pulado**, com banco real de teste, além de TypeScript, lint e build de produção.

Isto comprova a lógica automatizada e os fluxos simulados; não substitui uma nova rodada
de 20 sessões no WhatsApp/Meta nem resolve dependências operacionais externas.

## Lacunas encontradas e corrigidas

1. **“quero sim” sequestrado pela retomada de cancelamento.** A frase simples voltava
   como `resume_canceled`; agora é confirmação (`affirm`). Só frases com contexto real
   de arrependimento, como “na verdade quero sim, ainda dá?”, retomam o cancelado.
2. **Teto perdido no refino por marca da cauda longa.** Em “fone até R$150” seguido de
   “Philco”, a busca combinada no Mercado Livre podia mostrar anúncio acima do teto.
   O filtro de preço exibido agora é reaplicado antes de trocar os cards.
3. **Teto perdido no resgate local → Mercado Livre.** Quando candidatos locais eram
   descartados por relevância, a linha reconstruída perdia `cap`. O valor agora viaja
   até o retry do ML. Um E2E semeia o cache com fone barato e Philco caro e prova que o
   anúncio caro não aparece.
4. **Suporte via IA sem alerta durante escolha.** `handleChoosing` não repassava o
   `userId`; a Lia respondia ao cliente, mas não marcava o pedido nem alertava o
   operador. A identidade agora atravessa esse caminho e o E2E confere o alerta.
5. **Filtro financeiro da IA incompleto.** O filtro já barrava desconto, estorno e
   prazo, mas ainda podia aceitar “pagamento confirmado”/“Pix recebido”. Essas
   confirmações também são descartadas; dinheiro continua 100% determinístico.
6. **Frete grátis antecipado pelo markup.** O compositor comparava o limiar da loja
   com o preço exibido pela Lia. Agora usa o subtotal real de prateleira, igual ao
   checkout e à cotação final.
7. **Composição podia piorar entregas e gerar copy contraditória.** Uma alternativa
   muito barata numa loja nova podia aumentar a fragmentação; isso foi proibido. Quando
   há economia redistribuindo itens mas a contagem permanece 2→2, a mensagem diz que
   as entregas continuam duas — nunca “2 entregas em vez de 2”.

## Evidência executada

- `npm test`: **479 pass, 0 fail, 0 skip**; duração 3.209.045 ms (~53m29s).
- Testes focados pós-último ajuste: **74 pass, 0 fail**.
- `npx tsc --noEmit`: aprovado.
- `npm run lint`: aprovado, com um aviso preexistente de `<img>` em
  `src/components/chat-app.tsx` (performance de LCP; sem relação com os fluxos da Lia).
- `npm run build`: aprovado; 13 páginas geradas e bundle sem emoji corrompido.

Entre os fluxos integrais exercitados estão: concorrência/CAS, deduplicação do webhook,
listas e composição de lojas, totais, pedido mínimo, Pix e cartão simulados, falhas do
Mercado Pago, mudança de endereço antes/depois do total, cancelamento, pedido antigo,
frete vencido, Mercado Livre, ANVISA, alerta ao operador e fallback LLM.

## O que continua aberto

Não são regressões encobertas por esta auditoria; são operação, produto ou validação
externa ainda necessária:

- rodar uma nova bateria ao vivo de 20 sessões no WhatsApp/Meta;
- configurar `LIA_BUSINESS_INFO` na Vercel para a resposta de CNPJ;
- decidir entrega/estorno dos pedidos pagos residuais `#YAQHF8` e `#QTNL2T`;
- reduzir a latência fria e medir em produção — na suíte remota, turnos E2E levaram de
  ~10s a 106s, com forte custo do banco/ambiente compartilhado;
- criar watchdog/reaviso para espera do operador;
- cancelar de fato no provedor a cobrança antiga ao alternar Pix↔cartão em rajada;
- enriquecer comparação técnica de produtos e outros aprimoramentos já listados em
  `PENDENCIAS.md`.
