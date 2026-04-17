-- CreateTable
CREATE TABLE "CompanyExpense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "note" TEXT NOT NULL DEFAULT '',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" TIMESTAMP(3),
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyExpenseAttachment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT '',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyExpenseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyExpense_month_year_idx" ON "CompanyExpense"("month", "year");

-- CreateIndex
CREATE INDEX "CompanyExpense_date_idx" ON "CompanyExpense"("date");

-- CreateIndex
CREATE INDEX "CompanyExpense_category_idx" ON "CompanyExpense"("category");

-- AddForeignKey
ALTER TABLE "CompanyExpenseAttachment" ADD CONSTRAINT "CompanyExpenseAttachment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "CompanyExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

