import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { ValidationError } from '../utils/errors';

const router = Router();

// ── Validation schemas ──────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const pinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 characters'),
  locationId: z.string().uuid('Invalid location ID'),
});

// ── Error-handling wrapper ───────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── POST /login ──────────────────────────────────────────────────────

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message || 'Validation failed');
    }

    const { email, password } = parsed.data;
    const result = await authService.login(email, password);

    res.json(result);
  })
);

// ── POST /pin ────────────────────────────────────────────────────────

router.post(
  '/pin',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = pinSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message || 'Validation failed');
    }

    const { pin, locationId } = parsed.data;
    const result = await authService.loginWithPin(pin, locationId);

    res.json(result);
  })
);

// ── GET /me ──────────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.getUserFromToken({
      userId: req.user!.id,
      role: req.user!.role,
      locationId: req.user!.locationId,
    });

    res.json({ user });
  })
);

export default router;
