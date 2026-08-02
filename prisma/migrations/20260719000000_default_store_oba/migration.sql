-- New operational orders default to the active broad essentials source.
ALTER TABLE "DeliveryOrder" ALTER COLUMN "storeKey" SET DEFAULT 'oba';
ALTER TABLE "DeliveryOrder" ALTER COLUMN "storeLabel" SET DEFAULT 'Oba Hortifruti';
