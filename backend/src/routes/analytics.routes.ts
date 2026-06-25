import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validateQuery } from '../middleware/validation';
import { ValidationError } from '../utils/errors';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  return Number(v.toString());
}

// ── Zod schemas ──

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  locationId: z.string().uuid().optional(),
  category: z.string().optional(),
  limit: z.string().optional().transform(v => Math.min(Math.max(v ? parseInt(v) : 10, 1), 50)),
});

const slowMoverSchema = z.object({
  locationId: z.string().uuid().optional(),
  daysWindow: z.string().optional().transform(v => Math.min(Math.max(v ? parseInt(v) : 14, 1), 90)),
  limit: z.string().optional().transform(v => Math.min(Math.max(v ? parseInt(v) : 20, 1), 100)),
});

// ── GET /best-sellers ────────────────────────────────────────────────

router.get(
  '/best-sellers',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(dateRangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to, category } = req.query as unknown as { from: string; to: string; category?: string };
    const limit = (req.query as any).limit as number;
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');

    const categoryFilter = category ? Prisma.sql`AND p.category = ${category}::product_category` : Prisma.sql``;
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    // By units sold
    const byUnits = await prisma.$queryRaw<any[]>`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku,
        p.category,
        p.sell_price AS "sellPrice",
        s.name AS "strainName",
        COALESCE(SUM(ti.quantity), 0) AS "unitsSold",
        COALESCE(SUM(ti.total), 0) AS "revenue",
        COUNT(DISTINCT ti.transaction_id)::int AS "transactionCount"
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      LEFT JOIN strains s ON p.strain_id = s.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${fromDate}
        AND t.created_at <= ${toDate}
        AND t.status = 'completed'
        ${categoryFilter}
      GROUP BY p.id, p.name, p.sku, p.category, p.sell_price, s.name
      ORDER BY "unitsSold" DESC
      LIMIT ${limit}
    `;

    // By revenue
    const byRevenue = await prisma.$queryRaw<any[]>`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku,
        p.category,
        p.sell_price AS "sellPrice",
        COALESCE(SUM(ti.quantity), 0) AS "unitsSold",
        COALESCE(SUM(ti.total), 0) AS "revenue"
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${fromDate}
        AND t.created_at <= ${toDate}
        AND t.status = 'completed'
        ${categoryFilter}
      GROUP BY p.id, p.name, p.sku, p.category, p.sell_price
      ORDER BY "revenue" DESC
      LIMIT ${limit}
    `;

    res.json({
      from, to, locationId,
      byUnits: byUnits.map((r: any) => ({
        productId: r.productId, productName: r.productName, sku: r.sku,
        category: r.category, strainName: r.strainName ?? null,
        sellPrice: toNumber(r.sellPrice), unitsSold: toNumber(r.unitsSold),
        revenue: toNumber(r.revenue), transactionCount: r.transactionCount,
      })),
      byRevenue: byRevenue.map((r: any) => ({
        productId: r.productId, productName: r.productName, sku: r.sku,
        category: r.category, sellPrice: toNumber(r.sellPrice),
        unitsSold: toNumber(r.unitsSold), revenue: toNumber(r.revenue),
      })),
    });
  }),
);

// ── GET /slow-movers ─────────────────────────────────────────────────

router.get(
  '/slow-movers',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(slowMoverSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { daysWindow } = req.query as unknown as { daysWindow: number };
    const limit = (req.query as any).limit as number;
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - daysWindow);

    // Products with little/no sales in the window — exclude already inactive
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        p.id AS "productId",
        p.name AS "productName",
        p.sku,
        p.category,
        p.sell_price AS "sellPrice",
        s.name AS "strainName",
        COALESCE(i.quantity, 0) AS "currentStock",
        COALESCE(sales."unitsSold", 0) AS "unitsSold",
        COALESCE(sales."revenue", 0) AS "revenue",
        COALESCE(sales."lastSold", NULL) AS "lastSold"
      FROM products p
      LEFT JOIN strains s ON p.strain_id = s.id
      LEFT JOIN inventory i ON i.product_id = p.id AND i.location_id = ${locationId}::uuid
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(ti.quantity), 0) AS "unitsSold",
          COALESCE(SUM(ti.total), 0) AS "revenue",
          MAX(t.created_at) AS "lastSold"
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE ti.product_id = p.id
          AND t.location_id = ${locationId}::uuid
          AND t.created_at >= ${windowStart}
          AND t.status = 'completed'
      ) sales ON true
      WHERE p.is_active = true
        AND COALESCE(i.quantity, 0) > 0
        AND COALESCE(sales."unitsSold", 0) < 1
      ORDER BY COALESCE(sales."unitsSold", 0) ASC, COALESCE(i.quantity, 0) DESC
      LIMIT ${limit}
    `;

    res.json({
      locationId,
      daysWindow,
      total: rows.length,
      products: rows.map((r: any) => ({
        productId: r.productId, productName: r.productName, sku: r.sku,
        category: r.category, strainName: r.strainName ?? null,
        sellPrice: toNumber(r.sellPrice), currentStock: toNumber(r.currentStock),
        unitsSold: toNumber(r.unitsSold), revenue: toNumber(r.revenue),
        lastSold: r.lastSold ?? null,
      })),
    });
  }),
);

// ── GET /potency-decay ───────────────────────────────────────────────
// Flags batches whose THC% has dropped from the strain baseline by at
// least `minDrop` percentage points. Default 2.0 means a strain tested
// at 22% that now reads 19.5% (drop of 2.5%) will be flagged.
// Use `threshold` for absolute cutoff if preferred (legacy param).

router.get(
  '/potency-decay',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const useAbsolute = req.query.threshold !== undefined;
    const threshold = parseFloat((req.query.threshold as string) || '15');
    const minDrop = parseFloat((req.query.minDrop as string) || '2.0');
    const locationId = (req.query as any).locationId || req.user?.locationId;

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        b.id AS "batchId",
        b.lot_number AS "lotNumber",
        s.name AS "strainName",
        s.thc_percent AS "strainThc",
        b.current_potency_thc AS "currentThc",
        b.expiration_date AS "expirationDate",
        b.supplier,
        COUNT(DISTINCT p.id)::int AS "productCount",
        COALESCE(SUM(CASE WHEN i.location_id = ${locationId || '00000000-0000-0000-0000-000000000000'}::uuid THEN i.quantity ELSE 0 END), 0) AS "stockOnHand",
        (s.thc_percent - b.current_potency_thc) AS "potencyDrop"
      FROM batches b
      JOIN strains s ON b.strain_id = s.id
      JOIN products p ON p.batch_id = b.id
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.is_active = true
        AND b.current_potency_thc IS NOT NULL
        AND s.thc_percent IS NOT NULL
        AND ${
          useAbsolute
            ? Prisma.sql`b.current_potency_thc <= ${threshold}`
            : Prisma.sql`(s.thc_percent - b.current_potency_thc) >= ${minDrop}`
        }
      GROUP BY b.id, b.lot_number, s.name, s.thc_percent, b.current_potency_thc, b.expiration_date, b.supplier
      HAVING COALESCE(SUM(CASE WHEN i.location_id = ${locationId || '00000000-0000-0000-0000-000000000000'}::uuid THEN i.quantity ELSE 0 END), 0) > 0
      ORDER BY "potencyDrop" DESC
    `;

    res.json({
      mode: useAbsolute ? 'absolute' : 'relative',
      threshold: useAbsolute ? threshold : null,
      minDrop: useAbsolute ? null : minDrop,
      locationId: locationId || 'all',
      total: rows.length,
      batches: rows.map((r: any) => ({
        batchId: r.batchId, lotNumber: r.lotNumber,
        strainName: r.strainName, strainThc: toNumber(r.strainThc),
        currentThc: toNumber(r.currentThc),
        potencyDrop: toNumber(r.potencyDrop),
        expirationDate: r.expirationDate,
        supplier: r.supplier,
        productCount: r.productCount,
        stockOnHand: toNumber(r.stockOnHand),
      })),
    });
  }),
);

// ── Customer analytics schemas ──

const customerQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  minVisits: z.string().optional().transform(v => v ? parseInt(v) : 0),
  minSpend: z.string().optional().transform(v => v ? parseFloat(v) : 0),
  vipThreshold: z.string().optional().transform(v => v ? parseInt(v) : 5),
  limit: z.string().optional().transform(v => Math.min(Math.max(v ? parseInt(v) : 20, 1), 100)),
});

// ── GET /customers ───────────────────────────────────────────────────

router.get(
  '/customers',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(customerQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const locationId = (req.query as any).locationId || req.user?.locationId;
    const minVisits = (req.query as any).minVisits as number;
    const minSpend = (req.query as any).minSpend as number;
    const vipThreshold = (req.query as any).vipThreshold as number;
    const limit = (req.query as any).limit as number;
    if (!locationId) throw new ValidationError('locationId is required');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        t.customer_id AS "customerId",
        COUNT(DISTINCT t.id)::int AS "totalVisits",
        COALESCE(SUM(t.grand_total), 0) AS "lifetimeSpend",
        COALESCE(AVG(t.grand_total), 0) AS "avgSpendPerVisit",
        MAX(t.created_at) AS "lastVisit",
        MIN(t.created_at) AS "firstVisit",
        COUNT(DISTINCT DATE_TRUNC('week', t.created_at))::int AS "weeksActive",
        CASE
          WHEN COUNT(DISTINCT DATE_TRUNC('week', t.created_at)) > 0
          THEN ROUND(COUNT(DISTINCT t.id)::numeric / COUNT(DISTINCT DATE_TRUNC('week', t.created_at))::numeric, 1)
          ELSE 0
        END AS "visitsPerWeek"
      FROM transactions t
      WHERE t.location_id = ${locationId}::uuid
        AND t.customer_id IS NOT NULL
        AND t.status = 'completed'
      GROUP BY t.customer_id
      HAVING COUNT(DISTINCT t.id) >= ${minVisits}
        AND COALESCE(SUM(t.grand_total), 0) >= ${minSpend}
      ORDER BY "lifetimeSpend" DESC
      LIMIT ${limit}
    `;

    const customers = rows.map((r: any) => {
      const visits = r.totalVisits;
      const spend = toNumber(r.lifetimeSpend);
      const vip = visits >= vipThreshold || spend >= vipThreshold * 100;
      return {
        customerId: r.customerId, totalVisits: visits,
        lifetimeSpend: spend,
        avgSpendPerVisit: Math.round(toNumber(r.avgSpendPerVisit) * 100) / 100,
        lastVisit: r.lastVisit, firstVisit: r.firstVisit,
        visitsPerWeek: toNumber(r.visitsPerWeek), vip,
      };
    });

    res.json({ locationId, total: rows.length, vipThreshold, customers });
  }),
);

// ── GET /reports/weekly ──────────────────────────────────────────────

router.get(
  '/reports/weekly',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const weeks = parseInt((req.query.weeks as string) || '4');
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('week', t.created_at)::date AS "weekStart",
        COUNT(*)::int AS "totalTransactions",
        COALESCE(SUM(t.subtotal), 0) AS "grossSales",
        COALESCE(SUM(t.discount_total), 0) AS "totalDiscounts",
        COALESCE(SUM(t.tax_total), 0) AS "totalTax",
        COALESCE(SUM(t.grand_total), 0) AS "netSales"
      FROM transactions t
      WHERE t.location_id = ${locationId}::uuid
        AND t.status = 'completed'
        AND t.created_at >= NOW() - (${weeks} * INTERVAL '1 week')
      GROUP BY DATE_TRUNC('week', t.created_at)
      ORDER BY "weekStart" DESC
    `;

    res.json({
      locationId, weeks,
      data: rows.map((r: any) => ({
        weekStart: r.weekStart, totalTransactions: r.totalTransactions,
        grossSales: toNumber(r.grossSales), totalDiscounts: toNumber(r.totalDiscounts),
        totalTax: toNumber(r.totalTax), netSales: toNumber(r.netSales),
      })),
    });
  }),
);

// ── GET /reports/monthly ─────────────────────────────────────────────

router.get(
  '/reports/monthly',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const months = parseInt((req.query.months as string) || '6');
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('month', t.created_at)::date AS "monthStart",
        COUNT(*)::int AS "totalTransactions",
        COALESCE(SUM(t.subtotal), 0) AS "grossSales",
        COALESCE(SUM(t.discount_total), 0) AS "totalDiscounts",
        COALESCE(SUM(t.tax_total), 0) AS "totalTax",
        COALESCE(SUM(t.grand_total), 0) AS "netSales"
      FROM transactions t
      WHERE t.location_id = ${locationId}::uuid
        AND t.status = 'completed'
        AND t.created_at >= NOW() - (${months} * INTERVAL '1 month')
      GROUP BY DATE_TRUNC('month', t.created_at)
      ORDER BY "monthStart" DESC
    `;

    res.json({
      locationId, months,
      data: rows.map((r: any) => ({
        monthStart: r.monthStart, totalTransactions: r.totalTransactions,
        grossSales: toNumber(r.grossSales), totalDiscounts: toNumber(r.totalDiscounts),
        totalTax: toNumber(r.totalTax), netSales: toNumber(r.netSales),
      })),
    });
  }),
);

// ── GET /reports/by-budtender ────────────────────────────────────────

router.get(
  '/reports/by-budtender',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const from = (req.query.from as string) || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const to = (req.query.to as string) || new Date().toISOString().split('T')[0];
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');
    const f = new Date(from + 'T00:00:00.000Z');
    const t = new Date(to + 'T23:59:59.999Z');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT u.id AS "budtenderId", u.full_name AS "budtenderName", u.role,
        COUNT(DISTINCT t.id)::int AS "transactions",
        COALESCE(SUM(t.grand_total), 0) AS "revenue",
        COALESCE(SUM(t.discount_total), 0) AS "discountsGiven",
        COALESCE(AVG(t.grand_total), 0) AS "avgTransactionValue"
      FROM transactions t JOIN users u ON t.budtender_id = u.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${f} AND t.created_at <= ${t}
        AND t.status = 'completed'
      GROUP BY u.id, u.full_name, u.role
      ORDER BY "revenue" DESC
    `;

    res.json({
      from, to, locationId,
      budtenders: rows.map((r: any) => ({
        budtenderId: r.budtenderId, budtenderName: r.budtenderName, role: r.role,
        transactions: r.transactions, revenue: toNumber(r.revenue),
        discountsGiven: toNumber(r.discountsGiven),
        avgTransactionValue: Math.round(toNumber(r.avgTransactionValue) * 100) / 100,
      })),
    });
  }),
);

// ── GET /reports/tax-breakdown ───────────────────────────────────────

router.get(
  '/reports/tax-breakdown',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const from = (req.query.from as string) || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const to = (req.query.to as string) || new Date().toISOString().split('T')[0];
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');
    const f = new Date(from + 'T00:00:00.000Z');
    const t = new Date(to + 'T23:59:59.999Z');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT p.tax_category AS "taxCategory",
        COUNT(DISTINCT ti.transaction_id)::int AS "transactionCount",
        COALESCE(SUM(ti.quantity), 0) AS "unitsSold",
        COALESCE(SUM(ti.total - ti.tax_amount), 0) AS "taxableAmount",
        COALESCE(SUM(ti.tax_amount), 0) AS "taxCollected"
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${f} AND t.created_at <= ${t}
        AND t.status = 'completed'
      GROUP BY p.tax_category
      ORDER BY "taxCollected" DESC
    `;

    const totalTax = rows.reduce((sum: number, r: any) => sum + toNumber(r.taxCollected), 0);
    res.json({
      from, to, locationId,
      totalTaxCollected: Math.round(totalTax * 100) / 100,
      breakdown: rows.map((r: any) => ({
        taxCategory: r.taxCategory, transactionCount: r.transactionCount,
        unitsSold: toNumber(r.unitsSold), taxableAmount: toNumber(r.taxableAmount),
        taxCollected: toNumber(r.taxCollected),
      })),
    });
  }),
);

// ── GET /reports/discounts ───────────────────────────────────────────

router.get(
  '/reports/discounts',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const from = (req.query.from as string) || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
    const to = (req.query.to as string) || new Date().toISOString().split('T')[0];
    const locationId = (req.query as any).locationId || req.user?.locationId;
    if (!locationId) throw new ValidationError('locationId is required');
    const f = new Date(from + 'T00:00:00.000Z');
    const t = new Date(to + 'T23:59:59.999Z');

    const byBudtender = await prisma.$queryRaw<any[]>`
      SELECT u.id AS "budtenderId", u.full_name AS "budtenderName",
        COUNT(DISTINCT t.id)::int AS "transactionsWithDiscount",
        COALESCE(SUM(t.discount_total), 0) AS "totalDiscounted"
      FROM transactions t JOIN users u ON t.budtender_id = u.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${f} AND t.created_at <= ${t}
        AND t.status = 'completed' AND t.discount_total > 0
      GROUP BY u.id, u.full_name
      ORDER BY "totalDiscounted" DESC
    `;

    const totalDiscounted = byBudtender.reduce((sum: number, r: any) => sum + toNumber(r.totalDiscounted), 0);
    const totalDiscountTxns = byBudtender.reduce((sum: number, r: any) => sum + r.transactionsWithDiscount, 0);
    res.json({
      from, to, locationId,
      summary: {
        totalDiscounted: Math.round(totalDiscounted * 100) / 100,
        transactionsWithDiscount: totalDiscountTxns,
      },
      byBudtender: byBudtender.map((r: any) => ({
        budtenderId: r.budtenderId, budtenderName: r.budtenderName,
        transactionsWithDiscount: r.transactionsWithDiscount,
        totalDiscounted: toNumber(r.totalDiscounted),
      })),
    });
  }),
);

// ── GET /compliance-export ───────────────────────────────────────────

router.get(
  '/compliance-export',
  authenticate,
  requireRole('store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const from = (req.query.from as string);
    const to = (req.query.to as string);
    const locationId = (req.query as any).locationId || req.user?.locationId;
    const format = (req.query.format as string) || 'json';
    if (!from || !to) throw new ValidationError('from and to are required');
    if (!locationId) throw new ValidationError('locationId is required');
    const f = new Date(from + 'T00:00:00.000Z');
    const t = new Date(to + 'T23:59:59.999Z');

    const rows = await prisma.$queryRaw<any[]>`
      SELECT t.created_at AS "date", loc.name AS "location",
        t.id AS "transactionId", t.transaction_num AS "transactionNum",
        b.lot_number AS "batchLotNumber", p.name AS "productName", p.category,
        ti.quantity, p.unit_type AS "unit", ti.unit_price AS "price",
        ti.tax_amount AS "tax", t.budtender_id AS "budtenderId",
        u.full_name AS "budtenderName", t.customer_id AS "customerId"
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      JOIN batches b ON ti.batch_id = b.id
      JOIN locations loc ON t.location_id = loc.id
      JOIN users u ON t.budtender_id = u.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${f} AND t.created_at <= ${t}
        AND t.status IN ('completed', 'refunded', 'partial_refund')
      ORDER BY t.created_at, t.transaction_num
    `;

    const items = rows.map((r: any) => ({
      date: r.date, location: r.location, transactionId: r.transactionId,
      transactionNum: r.transactionNum, batchLotNumber: r.batchLotNumber,
      productName: r.productName, category: r.category,
      quantity: toNumber(r.quantity), unit: r.unit, price: toNumber(r.price),
      tax: toNumber(r.tax), budtenderId: r.budtenderId,
      budtenderName: r.budtenderName, customerId: r.customerId,
    }));

    if (format === 'csv') {
      const h = 'date,location,transactionId,transactionNum,batchLotNumber,productName,category,quantity,unit,price,tax,budtenderId,budtenderName,customerId';
      const csvRows = items.map((i: any) =>
        [i.date, '"' + i.location + '"', i.transactionId, i.transactionNum, i.batchLotNumber,
         '"' + i.productName + '"', i.category, i.quantity, i.unit, i.price, i.tax,
         i.budtenderId, '"' + i.budtenderName + '"', i.customerId || ''].join(',')
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="compliance-' + from + '-' + to + '.csv"');
      res.send([h, ...csvRows].join('\n'));
    } else {
      res.json({ from, to, locationId, totalItems: items.length, items });
    }
  }),
);

export default router;
