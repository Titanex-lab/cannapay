import { config } from '../config';

// ── Tax rate lookup by tax category ──────────────────────────────────

export function getTaxRate(taxCategory: string): number {
  switch (taxCategory) {
    case 'excise_flower':
      return config.taxRateExciseFlower;
    case 'excise_edible':
      return config.taxRateExciseEdible;
    case 'excise_concentrate':
      return config.taxRateExciseConcentrate;
    case 'no_tax':
      return 0;
    default:
      return config.taxRateStandard;
  }
}

// ── Calculate tax for a single line item ─────────────────────────────

export function calculateLineTax(
  subtotal: number,
  taxCategory: string,
): { taxAmount: number; taxRate: number } {
  const rate = getTaxRate(taxCategory);
  const taxAmount = Math.round(subtotal * rate * 100) / 100;
  return { taxAmount, taxRate: rate };
}

// ── Calculate tax breakdown for an entire cart ───────────────────────

export function calculateCartTax(
  items: Array<{ subtotal: number; taxCategory: string }>,
): {
  taxTotal: number;
  taxBreakdown: Array<{
    taxCategory: string;
    taxRate: number;
    taxableAmount: number;
    taxAmount: number;
  }>;
} {
  // Group by tax category and accumulate
  const groups = new Map<
    string,
    { rate: number; taxableAmount: number; taxAmount: number }
  >();

  for (const item of items) {
    const rate = getTaxRate(item.taxCategory);
    const taxAmount = Math.round(item.subtotal * rate * 100) / 100;

    const existing = groups.get(item.taxCategory);
    if (existing) {
      existing.taxableAmount += item.subtotal;
      existing.taxAmount += taxAmount;
    } else {
      groups.set(item.taxCategory, {
        rate,
        taxableAmount: item.subtotal,
        taxAmount,
      });
    }
  }

  const breakdown = Array.from(groups.entries()).map(
    ([category, data]) => ({
      taxCategory: category,
      taxRate: data.rate,
      taxableAmount: Math.round(data.taxableAmount * 100) / 100,
      taxAmount: Math.round(data.taxAmount * 100) / 100,
    }),
  );

  const taxTotal =
    Math.round(breakdown.reduce((sum, b) => sum + b.taxAmount, 0) * 100) /
    100;

  return { taxTotal, taxBreakdown: breakdown };
}
