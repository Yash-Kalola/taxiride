-- AlterTable: Driver + Broker email fields
ALTER TABLE "Driver" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Broker" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- CreateTable: EmailSender
CREATE TABLE "EmailSender" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSender_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSender_email_key" ON "EmailSender"("email");
CREATE INDEX "EmailSender_isDefault_idx" ON "EmailSender"("isDefault");

-- CreateTable: EmailLog
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "month" INTEGER,
    "year" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_recipientType_recipientId_idx" ON "EmailLog"("recipientType", "recipientId");
CREATE INDEX "EmailLog_recipientType_recipientId_month_year_idx" ON "EmailLog"("recipientType", "recipientId", "month", "year");
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");
