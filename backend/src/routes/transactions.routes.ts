import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate, validateQuery } from '../middleware/validation';
import { ValidationError } from '../utils/errors';
import * as transactionService from '../services/transaction.service';

const router = Router();

// ── Error-handling wrapper ───────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Zod schemas ──────────────────────────────────────────────────────

const cartItemSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  discountAmount: z.number().nonnegative('Discount cannot be negative').optional(),
});

const createTransactionSchema = z.object({
  locationId: z.string().uuid('Invalid location ID'),
  items: z
    .array(cartItemSchema)
    .min(1, 'Cart must contain at least one item'),
  discountTotal: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  idVerified: z.boolean().optional(),
  idVerifiedBy: z.string().uuid('Invalid ID verifier').optional(),
  paymentMethod: z.enum(['cash', 'card', 'other']),
  cashTendered: z.number().positive('Cash tendered must be positive').optional(),
  cardLastFour: z
    .string()
    .length(4, 'Must be exactly 4 digits')
    .regex(/^\d{4}$/, 'Must be 4 digits')
    .optional(),
});

const voidTransactionSchema = z.object({
  reason: z.string().min(1, 'Void reason is required').max(500),
  approvedBy: z.string().uuid('Invalid approver ID').optional(),
});

const refundTransactionSchema = z.object({
  reason: z.string().min(1, 'Refund reason is required').max(500),
  itemIds: z
    .array(z.string().uuid('Invalid item ID'))
    .min(1)
    .optional(),
});

const listTransactionsQuerySchema = z.object({
  date: z.string().optional(),
  budtenderId: z.string().uuid('Invalid budtender ID').optional(),
  status: z
    .enum(['completed', 'voided', 'refunded', 'partial_refund'])
    .optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});

// ── POST / — Create sale (budtender+) ────────────────────────────────

router.post(
  '/',
  authenticate,
  validate(createTransactionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;

    // Auto-set budtenderId from authenticated user
    const budtenderId = req.user!.id;

    // Use user's location if none provided (budtender's assigned location)
    const locationId =
      body.locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const result = await transactionService.createTransaction({
      locationId,
      budtenderId,
      items: body.items,
      discountTotal: body.discountTotal,
      notes: body.notes,
      idVerified: body.idVerified,
      idVerifiedBy: body.idVerifiedBy,
      paymentMethod: body.paymentMethod,
      cashTendered: body.cashTendered,
      cardLastFour: body.cardLastFour,
    });

    res.status(201).json(result);
  }),
);

// ── GET / — List transactions (budtender+) ────────────────────────────

router.get(
  '/',
  authenticate,
  validateQuery(listTransactionsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const locationId = (req.user?.locationId as string) || (req.query.locationId as string);

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const { date, budtenderId, status, limit, offset } =
      req.query as any;

    const result = await transactionService.listTransactions({
      locationId,
      date,
      budtenderId,
      status,
      limit,
      offset,
    });

    res.json(result);
  }),
);

// ── GET /:id — Transaction detail (budtender+) ───────────────────────

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await transactionService.getTransaction(
      req.params.id as string,
    );

    res.json(result);
  }),
);

// ── POST /:id/void — Void transaction (budtender+) ───────────────────

router.post(
  '/:id/void',
  authenticate,
  validate(voidTransactionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const voidedBy = req.user!.id;
    const { reason, approvedBy } = req.body;

    const result = await transactionService.voidTransaction(
      req.params.id as string,
      voidedBy,
      reason,
      approvedBy,
    );

    res.json(result);
  }),
);

// ── POST /:id/refund — Refund transaction (manager+) ─────────────────

router.post(
  '/:id/refund',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(refundTransactionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refundedBy = req.user!.id;
    const { reason, itemIds } = req.body;

    // approvedBy is the authenticated user (who must be a manager)
    const result = await transactionService.refundTransaction(
      req.params.id as string,
      refundedBy,
      reason,
      refundedBy, // manager performing the refund is the approver
      itemIds,
    );

    res.json(result);
  }),
);

export default router;
