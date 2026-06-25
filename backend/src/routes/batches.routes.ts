import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate } from '../middleware/validation';
import * as batchService from '../services/batch.service';

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

const createBatchSchema = z.object({
  lotNumber: z.string().min(1).max(100).optional(),
  strainId: z.string().uuid('Invalid strain ID'),
  supplier: z.string().min(1).max(200).optional(),
  harvestDate: z.string().optional(),
  productionDate: z.string().optional(),
  labResults: z.record(z.unknown()).optional(),
  expirationDate: z.string().optional(),
  currentPotencyThc: z.number().min(0).max(100).optional(),
});

const updateBatchSchema = z.object({
  lotNumber: z.string().min(1).max(100).optional(),
  strainId: z.string().uuid('Invalid strain ID').optional(),
  supplier: z.string().min(1).max(200).optional(),
  harvestDate: z.string().optional(),
  productionDate: z.string().optional(),
  labResults: z.record(z.unknown()).optional(),
  expirationDate: z.string().optional(),
  currentPotencyThc: z.number().min(0).max(100).optional(),
});

// ── GET / — List batches (budtender+) ────────────────────────────────

router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { strainId, search, limit, offset } = req.query;

    const result = await batchService.listBatches({
      strainId: strainId as string | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  }),
);

// ── GET /by-strain/:strainId — List batches by strain (budtender+) ──

router.get(
  '/by-strain/:strainId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const batches = await batchService.getBatchesByStrain(req.params.strainId as string);
    res.json(batches);
  }),
);

// ── GET /:id — Get single batch (budtender+) ────────────────────────

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const batch = await batchService.getBatch(req.params.id as string);
    res.json(batch);
  }),
);

// ── POST / — Create batch (manager+) ────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(createBatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const batch = await batchService.createBatch(req.body);
    res.status(201).json(batch);
  }),
);

// ── PUT /:id — Update batch (manager+) ──────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(updateBatchSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const batch = await batchService.updateBatch(req.params.id as string, req.body);
    res.json(batch);
  }),
);

export default router;
