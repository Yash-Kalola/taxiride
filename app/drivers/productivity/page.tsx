import ProductivityClient from '@/components/drivers/ProductivityClient';

export const dynamic = 'force-dynamic';

export default function ProductivityPage() {
  const today = new Date();
  return (
    <div className="px-8 py-8 space-y-6">
      <ProductivityClient initialMonth={today.getMonth() + 1} initialYear={today.getFullYear()} />
    </div>
  );
}
