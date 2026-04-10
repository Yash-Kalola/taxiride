-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "poNumber" TEXT NOT NULL DEFAULT '',
    "expectedMonthlyRides" INTEGER NOT NULL DEFAULT 0,
    "email" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ride" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL DEFAULT '',
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "pickupLocation" TEXT NOT NULL DEFAULT '',
    "dropoffLocation" TEXT NOT NULL DEFAULT '',
    "passenger" TEXT NOT NULL DEFAULT '',
    "driver" TEXT NOT NULL DEFAULT '',
    "dateTime" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amountPreTax" DOUBLE PRECISION NOT NULL,
    "hst" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "dateSent" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL DEFAULT '',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_accountId_key" ON "Company"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
