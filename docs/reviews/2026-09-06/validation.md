# Registro de validação — 06/09/2026

- Ambiente: Node 26.0.0 local; CI configurada para Node 24 (não disparada nesta revisão).
- Baseline: 531 testes aprovados.
- Final: 551 testes, 551 aprovados, zero falhas, zero skips, 16,05s no runner.
- Banco: Postgres embutido descartável; migrations aplicadas e drift ausente.
- TypeScript: aprovado. Lint: aprovado sem avisos.
- Build: aprovado, incluindo verificação de emoji no bundle. VERCEL=0, VERCEL_ENV=preview, DATABASE_URL e DIRECT_URL apontados para porta local fechada. Nenhuma migration de produção.
- Busca determinística: 34/38, sem LLM pago e sem Apify.
- Dependências: 25 alertas (22 high, 3 moderate); arquivo dependency-audit.json.
- git diff --check: aprovado.
- Não executados: deploy, teste real de compra/cartão/rastreio/recibos Meta, teste de carga, conciliação bancária ou atualização de dependências.

Relatório: ../../revisao-completa-2026-09-06.md
