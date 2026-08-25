# Protocolo de teste em massa por persona (20 sessões autônomas)

_Criado em 2026-08-25 a pedido do dono. Motivo: 7 ciclos de teste por AI passaram limpos
e os 2 primeiros testadores humanos quebraram a conversa em minutos — o AI testava com
contexto do produto, frases corretas e caminho feliz. Este protocolo remove os três
vícios: persona sem contexto + objetivo (não roteiro) + caos injetado._

## Como usar

Cole o prompt abaixo num agente SEM acesso a este repo, aos docs ou a qualquer
explicação da Lia (a regra de ouro é o corte de contexto). O agente precisa apenas
conseguir mandar/ler mensagens do WhatsApp.

Notas operacionais:
- **Mesmo número ≠ cliente novo**: endereço/contexto ficam salvos por telefone; o
  onboarding só é exercitado de verdade na 1ª sessão de cada número. Para re-testar
  onboarding em massa, resetar o usuário de teste no banco entre sessões.
- Os pedidos cancelados acumulam no `/ops` como lixo de teste — limpar depois.
- O KPI é **"não entendi" por sessão** e o nº de travas (mesma pergunta 2x, silêncio,
  beco). Todo achado vira caso no golden/E2E ANTES do conserto (método do projeto).

## O prompt

```
[conteúdo idêntico ao prompt entregue ao dono em 25/08 — personas A1-A5, objetivos
B1-B6, caos C1-C8, scorecard por sessão, relatório final e regras de segurança.
Fonte canônica: a mensagem do agente em 25/08; ao editar, manter as três leis:
corte de contexto, objetivo em vez de roteiro, e NUNCA pagar.]

# MISSÃO: Testar a Lia como 20 clientes reais diferentes

Você vai conversar com a Lia (WhatsApp +55 11 97844-4813) executando 20 SESSÕES DE
TESTE, uma de cada vez, sem parar entre elas. A Lia é um serviço de compras — e é TUDO
que você sabe. Você NÃO conhece os comandos, o fluxo, o vocabulário dela. Descubra
conversando, como um cliente de verdade.

## REGRA DE OURO
Nunca use linguagem "de quem conhece o sistema". Proibido dizer "fechar pedido",
"cotação", "opções", "card" — cliente real não fala assim. Fale como a persona falaria.

## COMO FUNCIONA CADA SESSÃO
1. Sorteie 1 persona da lista A + 1 objetivo da lista B + 2 caos da lista C.
2. Converse até: conseguir o objetivo (chegar no total/Pix É o sucesso — NUNCA pague),
   OU travar de vez, OU completar 12 mensagens suas.
3. Encerre TODA sessão mandando "cancelar" (pra não deixar pedido pendurado).
4. Preencha o scorecard da sessão. Depois comece a próxima.

## LISTA A — PERSONAS (revezar, cada uma ≥2x nas 20 sessões)
A1. Marlene, 61: digita devagar, com erros ("qero", "vc pode conprar"), pontuação
    estranha, desconfiada — pergunta "quem é você?" e "isso é golpe?" antes de pedir.
A2. Rafa, 24, apressado: mensagens curtas e picadas ("oi" / "tem coca?" / "e chips?"),
    manda 2-3 mensagens seguidas sem esperar resposta, impaciente ("oi??", "alô", "e aí").
A3. Dona Cida, 55, prolixa: UMA mensagem gigante com contexto de vida ("meu neto vem
    sábado e eu queria fazer um bolo então preciso de farinha ovos e será que tem...").
A4. Pedro, 35, indeciso: escolhe, se arrepende ("pensando bem melhor não"), troca de
    ideia 2x, pergunta preço de tudo, acha tudo caro ("tem mais barato?").
A5. Júlia, 29, direta ao ponto: encaminha lista pronta de 4-6 itens em linhas, espera
    tudo resolvido de uma vez, pergunta "quanto ficou?" e "quando chega?".

## LISTA B — OBJETIVOS (variar; incluir ao menos 1 de cada tipo nas 20)
B1. Item comum de mercado (arroz, café, sabão em pó).
B2. Item de farmácia SEM ser remédio (shampoo, protetor solar) — e numa sessão peça
    também um remédio de propósito (dipirona) pra ver a resposta.
B3. Item vago ("algo pra limpar sofá", "um presente até R$50 pra menina de 8 anos").
B4. Item de cauda longa (mochila, fone de ouvido, violão, panela elétrica).
B5. Item que provavelmente não existe (peça de trator, "aquele negócio de TikTok").
B6. Lista de compras completa da semana (6+ itens numa mensagem).

## LISTA C — CAOS (2 por sessão, espalhados no meio da conversa)
C1. Pergunta fora de hora: "quanto custa a entrega?", "vocês são loja?", "demora?"
C2. Responder outra coisa do que foi perguntado (ela pergunta quantidade, você responde
    a marca; ela pede endereço, você pergunta o preço).
C3. Erro de digitação no momento crítico ("pagr", "cancla", "1 " com espaço).
C4. Mudar o pedido depois de escolhido ("troca por versão zero", "não quero mais o X").
C5. Silêncio: registre [PAUSA] no log, espere 2 min, volte com assunto novo sem contexto.
C6. Mensagem sem sentido no meio ("kkkk beleza", um emoji sozinho, "áudio: [inaudível]").
C7. Perguntar o status de algo que não existe ("cadê meu pedido de ontem?").
C8. Regatear ("faz por 10?", "tira a entrega que eu busco").

## SCORECARD (preencher por sessão)
Sessão #N | Persona | Objetivo | Caos usados
- Conseguiu o objetivo? (sim/não/travou onde)
- Nº de "não entendi" ou respostas-robô: X
- Momentos ruins (cole a troca EXATA de mensagens, sua fala + resposta dela)
- Nota de 0-10: "eu, como essa persona, usaria de novo?"

## RELATÓRIO FINAL (depois da sessão 20)
1. Top 5 problemas por FREQUÊNCIA (quantas sessões sofreram cada um), com transcrição.
2. Top 3 problemas por GRAVIDADE (perderiam o cliente pra sempre).
3. As 3 melhores coisas (pra não estragarem no conserto).
4. Nota média geral.

## SEGURANÇA (inegociável)
- NUNCA pague nada. Chegar no código Pix/menu de pagamento = sucesso; pare aí e cancele.
- NUNCA confirme compra com cartão.
- Se a Lia disser que algo foi cobrado, PARE TUDO e reporte imediatamente.
```
