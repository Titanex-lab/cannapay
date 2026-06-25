import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate, validateQuery } from '../middleware/validation';
import { ValidationError } from '../utils/errors';
import { prisma } from '../index';
import * as inventoryService from '../services/inventory.service';

const router = Router();

// ── Error-handling wrapper ───────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Validation schemas ───────────────────────────────────────────────

const stockListQuerySchema = z.object({
  locationId: z.string().uuid('Invalid location ID').optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  lowStock: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});

const adjustSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  batchId: z.string().uuid('Invalid batch ID').optional(),
  locationId: z.string().uuid('Invalid location ID').optional(),
  quantity: z
    .number()
    .refine((v) => v !== 0, 'Quantity must be non-zero'),
  reasonCode: z.enum([
    'damaged',
    'gifted',
    'internal_use',
    'theft',
    'expired',
    'correction',
  ]),
  notes: z.string().optional(),
  approvedBy: z.string().uuid('Invalid approver ID').optional(),
});

const adjustmentHistoryQuerySchema = z.object({
  locationId: z.string().uuid('Invalid location ID').optional(),
  productId: z.string().uuid('Invalid product ID').optional(),
  reasonCode: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined)),
});

// ── GET / — Stock levels (budtender+) ────────────────────────────────

router.get(
  '/',
  authenticate,
  validateQuery(stockListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    // Default to user's location if not provided
    const locationId = (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const { category, search, lowStock, limit, offset } = req.query as any;

    const result = await inventoryService.getStockLevels(locationId, {
      category,
      search,
      lowStock,
      limit,
      offset,
    });

    res.json(result);
  }),
);

// ── GET /adjustments — Adjustment history ────────────────────────────

router.get(
  '/adjustments',
  authenticate,
  validateQuery(adjustmentHistoryQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    // Default to user's location
    const locationId = (req.query as any).locationId || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const { productId, reasonCode, from, to, limit, offset } = req.query as any;

    const result = await inventoryService.getAdjustmentHistory(locationId, {
      productId,
      reasonCode,
      from,
      to,
      limit,
      offset,
    });

    res.json(result);
  }),
);

// ── POST /adjust — Create adjustment (budtender+) ─────────────────────

router.post(
  '/adjust',
  authenticate,
  validate(adjustSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;

    // Auto-set employeeId from authenticated user
    const employeeId = req.user!.id;

    // Auto-set locationId from user's assigned location if not provided
    // Budtenders can only adjust their own location
    let locationId: string;
    if (body.locationId) {
      locationId = body.locationId;
    } else if (req.user?.locationId) {
      locationId = req.user.locationId;
    } else {
      throw new ValidationError('locationId is required');
    }

    // Look up product sellPrice to calculate adjustment value
    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, sellPrice: true },
    });

    if (!product) {
      throw new ValidationError('Product not found');
    }

    // Calculate value: product.sellPrice * Math.abs(quantity)
    const value =
      Number(product.sellPrice) * Math.abs(body.quantity);

    const result = await inventoryService.adjustInventory({
      productId: body.productId,
      batchId: body.batchId,
      locationId,
      quantity: body.quantity,
      reasonCode: body.reasonCode,
      notes: body.notes,
      employeeId,
      approvedBy: body.approvedBy,
      value,
    });

    res.status(201).json(result);
  }),
);

// ── GET /:productId — Single stock level (budtender+) ────────────────

router.get(
  '/:productId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    // Default to user's location if not provided in query
    const locationId = (req.query.locationId as string) || req.user?.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const result = await inventoryService.getStockLevel(
      req.params.productId as string,
      locationId,
    );

    res.json(result);
  }),
);

// ── POST /transfer — Move stock between locations (manager+) ───────

const transferSchema = z.object({
  productId: z.string().uuid(),
  batchId: z.string().uuid().optional(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
});

router.post(
  '/transfer',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await inventoryService.transferStock({
      ...req.body,
      employeeId: req.user!.id,
    });
    res.status(201).json(result);
  }),
);

export default router;
