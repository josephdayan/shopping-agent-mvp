# Lia

Concierge de compras no WhatsApp: o cliente pede em linguagem natural, vê até 3 opções
com foto de 18 vitrines locais (e do Mercado Livre como cauda longa), recebe o total na
hora, paga por Pix (copia-e-cola + bolha nativa) ou cartão, o operador compra no site da
loja como cliente comum e **a própria loja entrega**.

> Memória canônica: [AGENTS.md](AGENTS.md) (topo = regra vigente). Estado:
> [STATUS.md](STATUS.md). Pendências: [PENDENCIAS.md](PENDENCIAS.md). Revisão completa de
> 01–02/09 (código, dívidas, métricas reais, caminhos de produto):
> [docs/revisao-completa-2026-09-01.md](docs/revisao-completa-2026-09-01.md).

## Mapa do código

| Peça | Onde |
|---|---|
| Cérebro da conversa (máquina de estados, cesta, cotação, pagamento) | `src/lib/delivery-service.ts` |
| Intenções (NLU determinístico) e copy (todas as mensagens) | `src/lib/lia-intents.ts`, `src/lib/lia-copy.ts` |
| IA (extração, rerank, roteador de fallback) | `src/lib/adapters/ai.ts` |
| Vitrines (18 lojas + Mercado Livre), matcher, compositor de cesta | `src/lib/stores/`, `src/lib/basket-composer.ts` |
| Preço (markup progressivo, `parseMoneyInput`) | `src/lib/pricing.ts` |
| Pagamentos: Mercado Pago, Pagar.me, razão, reconciliação | `src/lib/payments/` |
| Webhooks: WhatsApp (Meta), Mercado Pago, Pagar.me; cron | `src/app/api/**` |
| Painel do operador | `/ops` (`src/app/ops/`) — mandar "ops" pra Lia no WhatsApp e tocar no link (ou `/ops?key=<OPS_TOKEN>` uma vez) |
| Guards de auth (fail-closed em deploy) | `src/lib/auth.ts` |
| Schema e migrations | `prisma/` |
| Testes (unitários + E2E de conversa) | `tests/` |

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL/DIRECT_URL (ou use só o banco de teste)
npx prisma migrate deploy
npm run dev
```

Landing em `http://localhost:3000`, painel em `/ops`. Sem `OPENAI_API_KEY` a conversa usa
o caminho determinístico; sem `MERCADO_PAGO_ACCESS_TOKEN` os pagamentos são mock (nunca
em deploy de produção). Para conversar sem WhatsApp: `npx tsx scripts/talk-lia.mts "oi"`.

## Testes

```bash
npm run test:unit    # intents/copy, sem banco, < 1 s
npm run test:local   # suíte INTEIRA num Postgres embutido (sobe, migra, confere drift, roda) — ~25 s
npm test             # suíte contra DATABASE_URL/TEST_DATABASE_URL do ambiente
```

Regra: nunca rodar a suíte contra o banco de produção; `npm run test:local` é o padrão.
CI em `.github/workflows/ci.yml` (tsc, lint, unit, E2E com Postgres em serviço, sem skips).

## Deploy

Vercel. O build (`npm run build`) gera o Prisma Client, aplica as migrations pendentes
**só no build de produção** (`scripts/migrate-on-build.mjs`), compila e confere o bundle
(emoji). Variáveis: ver `.env.example`; em deploy, segredo ausente nega (fail-closed).
Cron de reconciliação de pagamentos em `vercel.json` (`CRON_SECRET`).

## Operação

Runbook do operador: [docs/operador-runbook.md](docs/operador-runbook.md). Incidentes de
pagamento/estorno: [docs/operacao-piloto-needs-human-estorno.md](docs/operacao-piloto-needs-human-estorno.md).
