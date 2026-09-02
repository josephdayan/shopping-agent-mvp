-- Revisão 02/09: courier/motoboy saíram do produto; todo pedido novo é entrega do varejista.
ALTER TABLE "DeliveryOrder" ALTER COLUMN "courierKey" SET DEFAULT 'retailer_delivery';
