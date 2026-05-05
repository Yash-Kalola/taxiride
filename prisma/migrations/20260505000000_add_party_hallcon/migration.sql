-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PartyBooking" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL DEFAULT '',
    "customerEmail" TEXT NOT NULL DEFAULT '',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "pickupTime" TEXT NOT NULL DEFAULT '',
    "pickupLocation" TEXT NOT NULL DEFAULT '',
    "dropoffLocation" TEXT NOT NULL DEFAULT '',
    "passengers" INTEGER NOT NULL DEFAULT 1,
    "vehiclesNeeded" INTEGER NOT NULL DEFAULT 1,
    "quotedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PartyStatus" NOT NULL DEFAULT 'BOOKED',
    "notes" TEXT NOT NULL DEFAULT '',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallconRoute" (
    "id" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL DEFAULT '',
    "dropoffLocation" TEXT NOT NULL DEFAULT '',
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "driverPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallconRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallconTrip" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driver" TEXT NOT NULL DEFAULT '',
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "passengers" INTEGER NOT NULL DEFAULT 1,
    "driverPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HallconTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartyBooking_eventDate_idx" ON "PartyBooking"("eventDate");
CREATE INDEX "PartyBooking_status_idx" ON "PartyBooking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "HallconRoute_routeName_key" ON "HallconRoute"("routeName");

-- CreateIndex
CREATE INDEX "HallconTrip_routeId_idx" ON "HallconTrip"("routeId");
CREATE INDEX "HallconTrip_date_idx" ON "HallconTrip"("date");
CREATE INDEX "HallconTrip_month_year_idx" ON "HallconTrip"("month", "year");
CREATE INDEX "HallconTrip_driver_idx" ON "HallconTrip"("driver");

-- AddForeignKey
ALTER TABLE "PartyBooking" ADD CONSTRAINT "PartyBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallconTrip" ADD CONSTRAINT "HallconTrip_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "HallconRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
