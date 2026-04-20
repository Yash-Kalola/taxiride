-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "subject" TEXT NOT NULL DEFAULT 'Invoice #{{invoiceNumber}} — Rides for {{month}} {{year}}',
    "intro" TEXT NOT NULL DEFAULT 'Please find your invoice for transportation services provided in {{month}} {{year}} attached to this email as a PDF.',
    "closing" TEXT NOT NULL DEFAULT 'Please remit payment by the due date indicated above. If you have any questions regarding this invoice, please don''t hesitate to reach out.

Thank you for your business.',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
