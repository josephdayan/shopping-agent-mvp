-- Financeiro por pedido (23/09/2026): custo real pago na loja e taxa/líquido do provedor.
-- Colunas opcionais: pedidos antigos ficam nulos e o P&L usa a estimativa até o backfill.
ALTER TABLE "DeliveryOrder" ADD COLUMN "storePaidTotal" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN "feeCents" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "netCents" INTEGER;
