export function discountedUnitPrice(priceRon: number, discountPercent: number) {
  if (discountPercent <= 0) return priceRon;
  return Math.max(1, Math.floor((priceRon * (100 - discountPercent) + 50) / 100));
}
