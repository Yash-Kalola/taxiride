-- Add tripNumber + duration to HallconTrip
ALTER TABLE "HallconTrip" ADD COLUMN "tripNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "HallconTrip" ADD COLUMN "duration"   TEXT NOT NULL DEFAULT '';

-- Add fileData (Bytes) to all attachment models so uploads survive Vercel's
-- read-only filesystem at runtime. Nullable for back-compat with old rows.
ALTER TABLE "ExpenseAttachment"        ADD COLUMN "fileData" BYTEA;
ALTER TABLE "CompanyExpenseAttachment" ADD COLUMN "fileData" BYTEA;
ALTER TABLE "TransactionAttachment"    ADD COLUMN "fileData" BYTEA;
ALTER TABLE "VehicleDocument"          ADD COLUMN "fileData" BYTEA;
