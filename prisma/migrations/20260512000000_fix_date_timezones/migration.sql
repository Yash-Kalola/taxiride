-- One-time fix for user-entered date-only fields that were stored at
-- UTC midnight by the old parseLocalDate (which made them display as the
-- previous day in any timezone west of UTC). Bumping the time portion to
-- noon UTC keeps them on the right calendar day in every timezone the
-- app gets used in. The new parseLocalDate (lib/dates.ts) writes noon UTC
-- directly so this is a one-shot migration for existing rows.
--
-- We only touch rows that look like date-only midnight values (HH=0, MM=0,
-- SS=0). Rows with a real time component (e.g. paidDate set via new Date()
-- at the moment of payment) are untouched.

-- DailySheet.date — driver's working day (this is Yash's reported bug)
UPDATE "DailySheet"
SET "date" = "date" + INTERVAL '12 hours'
WHERE "date"::time = TIME '00:00:00';

-- CompanyExpense.date — date of expense
UPDATE "CompanyExpense"
SET "date" = "date" + INTERVAL '12 hours'
WHERE "date"::time = TIME '00:00:00';

-- BrokerExpense.date — date of broker-attributed expense
UPDATE "BrokerExpense"
SET "date" = "date" + INTERVAL '12 hours'
WHERE "date"::time = TIME '00:00:00';

-- BrokerTransaction.dueDate — manually set, can be null
UPDATE "BrokerTransaction"
SET "dueDate" = "dueDate" + INTERVAL '12 hours'
WHERE "dueDate" IS NOT NULL AND "dueDate"::time = TIME '00:00:00';

-- VehicleAccident.date — incident date
UPDATE "VehicleAccident"
SET "date" = "date" + INTERVAL '12 hours'
WHERE "date"::time = TIME '00:00:00';

-- Broker.startDate / endDate
UPDATE "Broker"
SET "startDate" = "startDate" + INTERVAL '12 hours'
WHERE "startDate"::time = TIME '00:00:00';
UPDATE "Broker"
SET "endDate" = "endDate" + INTERVAL '12 hours'
WHERE "endDate" IS NOT NULL AND "endDate"::time = TIME '00:00:00';

-- Driver.startDate / endDate
UPDATE "Driver"
SET "startDate" = "startDate" + INTERVAL '12 hours'
WHERE "startDate"::time = TIME '00:00:00';
UPDATE "Driver"
SET "endDate" = "endDate" + INTERVAL '12 hours'
WHERE "endDate" IS NOT NULL AND "endDate"::time = TIME '00:00:00';

-- VehicleAssignment.startDate / endDate
UPDATE "VehicleAssignment"
SET "startDate" = "startDate" + INTERVAL '12 hours'
WHERE "startDate"::time = TIME '00:00:00';
UPDATE "VehicleAssignment"
SET "endDate" = "endDate" + INTERVAL '12 hours'
WHERE "endDate" IS NOT NULL AND "endDate"::time = TIME '00:00:00';

-- PartyBooking.eventDate
UPDATE "PartyBooking"
SET "eventDate" = "eventDate" + INTERVAL '12 hours'
WHERE "eventDate"::time = TIME '00:00:00';

-- HallconTrip.date
UPDATE "HallconTrip"
SET "date" = "date" + INTERVAL '12 hours'
WHERE "date"::time = TIME '00:00:00';
