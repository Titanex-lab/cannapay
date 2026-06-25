import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate } from '../middleware/validation';
import * as strainService from '../services/strain.service';

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

const createStrainSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  type: z.enum(['indica', 'sativa', 'hybrid']),
  thcPercent: z.number().min(0).max(100).optional(),
  cbdPercent: z.number().min(0).max(100).optional(),
  terpeneProfile: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

const updateStrainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['indica', 'sativa', 'hybrid']).optional(),
  thcPercent: z.number().min(0).max(100).optional(),
  cbdPercent: z.number().min(0).max(100).optional(),
  terpeneProfile: z.string().optional(),
  aliases: z.array(z.string()).optional(),
});

// ── GET / — List strains (budtender+) ────────────────────────────────

router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { type, search, limit, offset } = req.query;

    const result = await strainService.listStrains({
      type: type as string | undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  }),
);

// ── GET /:id — Get single strain (budtender+) ────────────────────────

router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const strain = await strainService.getStrain(req.params.id as string);
    res.json(strain);
  }),
);

// ── POST / — Create strain (manager+) ────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(createStrainSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const strain = await strainService.createStrain(req.body);
    res.status(201).json(strain);
  }),
);

// ── PUT /:id — Update strain (manager+) ────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  validate(updateStrainSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const strain = await strainService.updateStrain(req.params.id as string, req.body);
    res.json(strain);
  }),
);

// ── DELETE /:id — Delete strain (admin only) ─────────────────────────

router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await strainService.deleteStrain(req.params.id as string);
    res.json(result);
  }),
);

export default router;
