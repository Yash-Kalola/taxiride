-- AlterTable: add `notes` text column to Company. Defaults to empty string
-- so existing rows backfill safely without a write transaction.
ALTER TABLE "Company" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
