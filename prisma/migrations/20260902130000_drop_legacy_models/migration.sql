-- Autorizado pelo dono em 02/09/2026 ("faz isso"): tabelas do motor de busca ML de junho
-- (chat legado, /admin, /api/v1), sem nenhum leitor no código desde a remoção do legado.
-- Em produção havia 5 Order de demonstração e Product mock — nada do produto vigente
-- (DeliveryOrder é outro modelo e fica intacto).
DROP TABLE IF EXISTS "OpsTask";
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS "ProductOption";
DROP TABLE IF EXISTS "Preference";
DROP TABLE IF EXISTS "Product";
