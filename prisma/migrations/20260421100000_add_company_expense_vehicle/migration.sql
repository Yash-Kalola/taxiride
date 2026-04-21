-- Adds optional vehicleNumber to CompanyExpense so cab-repair costs can be
-- tagged to a specific car. Used by the dashboard per-vehicle table.
ALTER TABLE "CompanyExpense" ADD COLUMN "vehicleNumber" TEXT NOT NULL DEFAULT '';

CREATE INDEX "CompanyExpense_vehicleNumber_month_year_idx"
  ON "CompanyExpense" ("vehicleNumber", "month", "year");
