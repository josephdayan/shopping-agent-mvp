# Controle de custos da Lia

Atualizado em: 2026-06-28

Use este arquivo para acompanhar tudo que vira custo do projeto. A ideia e separar:

- **Recorrente**: assinatura mensal fixa.
- **Variavel**: custo por uso, mensagem, busca, token, etc.
- **Credito/free tier**: plano gratuito ou creditos que podem acabar.

## Resumo mensal

| Servico | Tipo | Plano / uso | Custo mensal estimado | Status | Observacoes |
| --- | --- | --- | ---: | --- | --- |
| Apify | Recorrente | Plano pago | US$ 29.00 | Ativo | Contratado em 2026-06-28 para busca/scraping Mercado Livre. |
| Supabase | Recorrente | Free | US$ 0.00 | Ativo | Pode continuar gratis no MVP se ficar dentro dos limites. |
| Vercel | Recorrente | Plano pago | US$ 20.00 | Ativo | Upgrade previsto/contratado para producao e operacao do MVP. |
| OpenAI | Variavel | API por uso | A confirmar | Ativo | Monitorar por compras/testes. |
| Twilio | Variavel | WhatsApp Sandbox/API | A confirmar | Ativo | Trial/uso por mensagem; monitorar quando sair do sandbox. |

**Total fixo mensal atual:** US$ 49.00

## Variaveis que precisam ser monitoradas

| Servico | O que gera custo | Como controlar |
| --- | --- | --- |
| OpenAI | Cada mensagem/analisador/ranking com IA | Checar dashboard de usage semanalmente. |
| Twilio | Mensagens WhatsApp enviadas/recebidas e eventual sender oficial | Checar Twilio Billing/Usage semanalmente. |
| Apify | Plano mensal + possivel excesso de resultados/compute | Limitar buscas por conversa e evitar rodar scraper sem necessidade. |
| Supabase | Banco, storage, egress e usuarios acima do free | Checar se aproximar de uso real. |
| Vercel | Assinatura mensal + build/runtime acima do incluido | Acompanhar usage no dashboard da Vercel. |

## Regra pratica

- Toda ferramenta nova paga entra aqui antes de contratar.
- Todo custo variavel deve ter um limite mental ou tecnico.
- Revisar este arquivo 1 vez por semana enquanto estivermos testando.
