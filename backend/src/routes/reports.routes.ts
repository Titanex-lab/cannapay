import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validateQuery } from '../middleware/validation';
import { ValidationError } from '../utils/errors';
import { prisma } from '../index';
import { Prisma } from '@prisma/client';

const router = Router();

// ── Error-handling wrapper ───────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert Decimal values to plain numbers (prisma $queryRaw returns Decimal objects) */
function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  // Prisma Decimal has toString() that returns the exact decimal string
  return Number(value.toString());
}

/** Format a date string (YYYY-MM-DD) as a Date range start */
function startOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Format a date string (YYYY-MM-DD) as a Date range end (start of next day) */
function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

// ── Zod schemas ──────────────────────────────────────────────────────

const dailySalesQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

const drawerReconciliationQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

const voidsRefundsQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  locationId: z.string().uuid('Invalid location ID').optional(),
  reasonCode: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 50;
      return Math.min(Math.max(n, 1), 200);
    }),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
});

// ── GET /daily-sales — Daily Sales Summary ──────────────────────────

router.get(
  '/daily-sales',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(dailySalesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.query as unknown as { date: string };
    const locationId =
      (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    // ── Summary aggregation ──────────────────────────────────────
    const summaryRows = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)::int AS "totalTransactions",
        COALESCE(SUM(subtotal), 0) AS "grossSales",
        COALESCE(SUM(discount_total), 0) AS "totalDiscounts",
        COALESCE(SUM(tax_total), 0) AS "totalTax",
        COALESCE(SUM(grand_total), 0) AS "netSales"
      FROM transactions
      WHERE location_id = ${locationId}::uuid
        AND created_at >= ${dayStart}
        AND created_at <= ${dayEnd}
        AND status = 'completed'
    `;

    // ── By payment method ────────────────────────────────────────
    const paymentMethodRows = await prisma.$queryRaw<any[]>`
      SELECT
        pm.payment_method AS "method",
        COUNT(*)::int AS "count",
        COALESCE(SUM(pm.amount), 0) AS "total"
      FROM payments pm
      JOIN transactions t ON pm.transaction_id = t.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${dayStart}
        AND t.created_at <= ${dayEnd}
        AND t.status = 'completed'
      GROUP BY pm.payment_method
      ORDER BY pm.payment_method
    `;

    // ── By category ──────────────────────────────────────────────
    const categoryRows = await prisma.$queryRaw<any[]>`
      SELECT
        p.category AS "category",
        COALESCE(SUM(ti.quantity), 0) AS "units",
        COALESCE(SUM(ti.total), 0) AS "revenue"
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      JOIN products p ON ti.product_id = p.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${dayStart}
        AND t.created_at <= ${dayEnd}
        AND t.status = 'completed'
      GROUP BY p.category
      ORDER BY revenue DESC
    `;

    // ── By budtender ─────────────────────────────────────────────
    const budtenderRows = await prisma.$queryRaw<any[]>`
      SELECT
        t.budtender_id AS "budtenderId",
        u.full_name AS "budtenderName",
        COUNT(*)::int AS "transactions",
        COALESCE(SUM(t.grand_total), 0) AS "revenue"
      FROM transactions t
      JOIN users u ON t.budtender_id = u.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${dayStart}
        AND t.created_at <= ${dayEnd}
        AND t.status = 'completed'
      GROUP BY t.budtender_id, u.full_name
      ORDER BY revenue DESC
    `;

    // ── Convert Decimal columns to numbers ──────────────────────
    const s = summaryRows[0] || {};

    res.json({
      date,
      locationId,
      summary: {
        totalTransactions: s.totalTransactions ?? 0,
        grossSales: decimalToNumber(s.grossSales),
        totalDiscounts: decimalToNumber(s.totalDiscounts),
        totalTax: decimalToNumber(s.totalTax),
        netSales: decimalToNumber(s.netSales),
      },
      byPaymentMethod: paymentMethodRows.map((r: any) => ({
        method: r.method,
        count: r.count,
        total: decimalToNumber(r.total),
      })),
      byCategory: categoryRows.map((r: any) => ({
        category: r.category,
        units: decimalToNumber(r.units),
        revenue: decimalToNumber(r.revenue),
      })),
      byBudtender: budtenderRows.map((r: any) => ({
        budtenderId: r.budtenderId,
        budtenderName: r.budtenderName,
        transactions: r.transactions,
        revenue: decimalToNumber(r.revenue),
      })),
    });
  }),
);

// ── GET /drawer-reconciliation — Drawer Reconciliation ──────────────

router.get(
  '/drawer-reconciliation',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(drawerReconciliationQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { date } = req.query as unknown as { date: string };
    const locationId =
      (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        cds.id,
        cds.user_id AS "userId",
        u.full_name AS "userName",
        cds.opening_amount AS "openingAmount",
        cds.expected_amount AS "expectedAmount",
        cds.closing_amount AS "closingAmount",
        cds.difference,
        cds.opened_at AS "openedAt",
        cds.closed_at AS "closedAt",
        cds.status
      FROM cash_drawer_sessions cds
      JOIN users u ON cds.user_id = u.id
      WHERE cds.location_id = ${locationId}::uuid
        AND cds.opened_at >= ${dayStart}
        AND cds.opened_at <= ${dayEnd}
      ORDER BY cds.opened_at
    `;

    const sessions = rows.map((r: any) => ({
      id: r.id,
      userId: r.userId,
      userName: r.userName,
      openingAmount: decimalToNumber(r.openingAmount),
      expectedAmount: r.expectedAmount != null ? decimalToNumber(r.expectedAmount) : null,
      closingAmount: r.closingAmount != null ? decimalToNumber(r.closingAmount) : null,
      difference: r.difference != null ? decimalToNumber(r.difference) : null,
      openedAt: r.openedAt,
      closedAt: r.closedAt,
      status: r.status,
      // convenience flag for frontend: positive difference = overage (more than expected),
      // negative = shortage (less than expected)
      differenceType:
        r.difference == null
          ? null
          : decimalToNumber(r.difference) > 0
            ? 'overage'
            : decimalToNumber(r.difference) < 0
              ? 'shortage'
              : 'balanced',
    }));

    res.json({
      date,
      locationId,
      sessions,
    });
  }),
);

// ── GET /voids-refunds — Void & Refund Log ──────────────────────────

router.get(
  '/voids-refunds',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(voidsRefundsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to, reasonCode } = req.query as unknown as {
      from: string;
      to: string;
      reasonCode?: string;
      limit: number;
      offset: number;
    };
    const limit = (req.query as any).limit as number;
    const offset = (req.query as any).offset as number;
    const locationId =
      (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const fromStart = startOfDay(from);
    const toEnd = endOfDay(to);

    // Build optional reason filter safely (avoid empty $queryRaw parameter slot)
    const reasonFilter = reasonCode ? Prisma.sql`AND t.void_reason = ${reasonCode}` : Prisma.sql``;

    // ── Count query (for total) ──────────────────────────────────
    const countResult = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS "total"
      FROM transactions t
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${fromStart}
        AND t.created_at <= ${toEnd}
        AND t.status IN ('voided', 'refunded', 'partial_refund')
        ${reasonFilter}
    `;

    const total = countResult[0]?.total ?? 0;

    // ── Data query ───────────────────────────────────────────────
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        t.id,
        t.transaction_num AS "transactionNum",
        t.created_at AS "date",
        u.full_name AS "budtenderName",
        t.grand_total AS "grandTotal",
        t.status,
        t.void_reason AS "voidReason",
        vu.full_name AS "approvedByName"
      FROM transactions t
      JOIN users u ON t.budtender_id = u.id
      LEFT JOIN users vu ON t.void_approved_by = vu.id
      WHERE t.location_id = ${locationId}::uuid
        AND t.created_at >= ${fromStart}
        AND t.created_at <= ${toEnd}
        AND t.status IN ('voided', 'refunded', 'partial_refund')
        ${reasonFilter}
      ORDER BY t.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const items = rows.map((r: any) => ({
      id: r.id,
      transactionNum: r.transactionNum,
      date: r.date,
      budtenderName: r.budtenderName,
      grandTotal: decimalToNumber(r.grandTotal),
      status: r.status,
      voidReason: r.voidReason ?? null,
      approvedByName: r.approvedByName ?? null,
    }));

    res.json({
      from,
      to,
      locationId,
      total,
      limit,
      offset,
      items,
    });
  }),
);

const shrinkageQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

// ── GET /shrinkage — Inventory Shrinkage by Reason ──────────────────

router.get(
  '/shrinkage',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validateQuery(shrinkageQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to } = req.query as unknown as { from: string; to: string };
    const locationId =
      (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const fromStart = startOfDay(from);
    const toEnd = endOfDay(to);

    // ── Loss adjustments by reason code (excludes 'correction') ──────
    // Only negative adjustments (actual removals from inventory).
    // 'correction' is excluded because cycle counts can go either direction —
    // a found-stock correction is not a loss, and even a negative correction
    // is a count-fix, not a genuine shrink event.
    const lossRows = await prisma.$queryRaw<any[]>`
      SELECT
        ia.reason_code AS "reasonCode",
        COUNT(*)::int AS "adjustmentCount",
        COALESCE(SUM(ABS(ia.quantity)), 0) AS "totalUnits",
        COALESCE(SUM(ABS(ia.quantity) * p.sell_price), 0) AS "estimatedLossValue"
      FROM inventory_adjustments ia
      JOIN products p ON ia.product_id = p.id
      WHERE ia.location_id = ${locationId}::uuid
        AND ia.created_at >= ${fromStart}
        AND ia.created_at <= ${toEnd}
        AND ia.quantity < 0
        AND ia.reason_code NOT IN ('correction', 'transfer_out', 'transfer_in')
      GROUP BY ia.reason_code
      ORDER BY "estimatedLossValue" DESC
    `;

    const byReason = lossRows.map((r: any) => ({
      reasonCode: r.reasonCode,
      adjustmentCount: r.adjustmentCount,
      totalUnits: decimalToNumber(r.totalUnits),
      estimatedLossValue: decimalToNumber(r.estimatedLossValue),
    }));

    // ── Corrections (reported separately — not losses) ──────────────
    const correctionRows = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*)::int AS "adjustmentCount",
        COALESCE(SUM(CASE WHEN ia.quantity > 0 THEN ia.quantity ELSE 0 END), 0) AS "unitsFound",
        COALESCE(SUM(CASE WHEN ia.quantity < 0 THEN ABS(ia.quantity) ELSE 0 END), 0) AS "unitsLost",
        COALESCE(SUM(ia.quantity), 0) AS "netUnits",
        COALESCE(SUM(
          CASE WHEN ia.quantity > 0 THEN ia.quantity * p.sell_price
               WHEN ia.quantity < 0 THEN ia.quantity * p.sell_price
               ELSE 0 END
        ), 0) AS "netValue"
      FROM inventory_adjustments ia
      JOIN products p ON ia.product_id = p.id
      WHERE ia.location_id = ${locationId}::uuid
        AND ia.created_at >= ${fromStart}
        AND ia.created_at <= ${toEnd}
        AND ia.reason_code = 'correction'
    `;

    const c = correctionRows[0] || {};
    const corrections = {
      adjustmentCount: c.adjustmentCount ?? 0,
      unitsFound: decimalToNumber(c.unitsFound),
      unitsLost: decimalToNumber(c.unitsLost),
      netUnits: decimalToNumber(c.netUnits),
      netValue: decimalToNumber(c.netValue),
    };

    // Totals (loss reasons only — corrections are separate)
    const totalAdjustments = byReason.reduce((sum, r) => sum + r.adjustmentCount, 0);
    const totalUnits = byReason.reduce((sum, r) => sum + r.totalUnits, 0);
    const totalLossValue = byReason.reduce((sum, r) => sum + r.estimatedLossValue, 0);

    res.json({
      from,
      to,
      locationId,
      summary: {
        totalAdjustments,
        totalUnits,
        totalLossValue,
      },
      byReason,
      corrections,
    });
  }),
);

export default router;
