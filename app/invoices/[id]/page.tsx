import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import InvoiceDetailClient from '@/components/dashboard/InvoiceDetailClient';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  let invoice: any = null;
  try {
    invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { company: true, rides: true },
    });
  } catch {}
  if (!invoice) notFound();

  return (
    <div className="px-8 py-8">
      <InvoiceDetailClient invoice={invoice} />
    </div>
  );
}
