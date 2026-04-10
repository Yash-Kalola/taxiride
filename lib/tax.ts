/** Amount in sheet is tax-inclusive. base = total / 1.13, hst = total - base */

export function calcBase(totalInclusive: number): number {
  return Math.round((totalInclusive / 1.13) * 100) / 100;
}

export function calcHST(totalInclusive: number): number {
  const base = calcBase(totalInclusive);
  return Math.round((totalInclusive - base) * 100) / 100;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}
