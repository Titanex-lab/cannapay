import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import * as searchService from '../services/search.service';

const router = Router();

// ── Error-handling wrapper ───────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Validation schema ────────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(100, 'Search query too long'),
  locationId: z.string().uuid('Invalid location ID').optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? parseInt(v, 10) : 8;
      return Math.min(Math.max(n, 1), 20); // clamp 1–20
    }),
});

// ── GET /api/search/products ─────────────────────────────────────────
// Autocomplete endpoint for the POS search bar.
// Query params: q (required, min 2 chars), locationId (optional, falls
// back to the authenticated user's assigned location), limit (1–20).

router.get(
  '/products',
  authenticate,
  validateQuery(searchQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { q, locationId, limit } = req.query as unknown as {
      q: string;
      locationId?: string;
      limit: number;
    };

    // Resolve locationId: explicit query param → user's assigned location
    const effectiveLocationId =
      locationId || req.user?.locationId;

    if (!effectiveLocationId) {
      res.status(400).json({
        error: {
          message:
            'locationId query parameter is required when user has no assigned location',
          statusCode: 400,
        },
      });
      return;
    }

    const results = await searchService.searchProducts(
      q,
      effectiveLocationId,
      limit,
    );

    res.json({
      query: q,
      locationId: effectiveLocationId,
      count: results.length,
      results,
    });
  }),
);

export default router;
