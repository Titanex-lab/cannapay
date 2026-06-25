import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate } from '../middleware/validation';
import * as productService from '../services/product.service';

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

const createProductSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  category: z.enum([
    'flower',
    'pre_roll',
    'vape',
    'concentrate',
    'edible',
    'topical',
    'accessory',
  ]),
  strainId: z.string().uuid('Invalid strain ID').optional(),
  batchId: z.string().uuid('Invalid batch ID').optional(),
  costPrice: z.number().positive('Cost price must be positive'),
  sellPrice: z.number().positive('Sell price must be positive'),
  unitType: z
    .enum(['each', 'gram', 'eighth', 'quarter', 'half', 'ounce'])
    .optional(),
  weightGrams: z.number().positive().optional(),
  barcode: z.string().optional(),
  taxCategory: z
    .enum([
      'standard',
      'excise_flower',
      'excise_edible',
      'excise_concentrate',
      'no_tax',
    ])
    .optional(),
});

const updateProductSchema = z.object({
  sku: z.string().optional(),
  name: z.string().min(1).max(200).optional(),
  category: z
    .enum([
      'flower',
      'pre_roll',
      'vape',
      'concentrate',
      'edible',
      'topical',
      'accessory',
    ])
    .optional(),
  strainId: z.string().uuid('Invalid strain ID').optional(),
  batchId: z.string().uuid('Invalid batch ID').optional(),
  costPrice: z.number().positive('Cost price must be positive').optional(),
  sellPrice: z.number().positive('Sell price must be positive').optional(),
  unitType: z
    .enum(['each', 'gram', 'eighth', 'quarter', 'half', 'ounce'])
    .optional(),
  weightGrams: z.number().positive().optional(),
  barcode: z.string().optional(),
  taxCategory: z
    .enum([
      'standard',
      'excise_flower',
      'excise_edible',
      'excise_concentrate',
      'no_tax',
    ])
    .optional(),
});

// ── GET / — List products (budtender+) ───────────────────────────────

router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { category, strainId, batchId, isActive, search, locationId, limit, offset } =
      req.query;

    const result = await productService.listProducts({
      category: category as string | undefined,
      strainId: strainId as string | undefined,
      batchId: batchId as string | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search: search as string | undefined,
      locationId: locationId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  }),
);

// ── GET /category/:category — By category with stock (budtender+) ────

router.get(
  '/category/:category',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { category } = req.params as Record<string, string>;
    const locationId = (req.query.locationId as string) || req.user?.locationId;

    if (!locationId) {
      res.status(400).json({
        error: {
          message:
            'locationId query parameter is required when user has no assigned location',
          statusCode: 400,
        },
      });
      return;
    }

    const products = await productService.getProductsByCategory(
      category,
      locationId,
    );

    res.json(products);
  }),
);

// ── GET /:id — Get single product (budtender+) ───────────────────────

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getProduct(req.params.id as string);
    res.json(product);
  }),
);

// ── POST / — Create product (manager+) ───────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(createProductSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.createProduct(req.body);
    res.status(201).json(product);
  }),
);

// ── PUT /:id — Update product (manager+) ─────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(updateProductSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.updateProduct(
      req.params.id as string,
      req.body,
    );
    res.json(product);
  }),
);

export default router;
