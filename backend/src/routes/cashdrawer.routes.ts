import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate } from '../middleware/validation';
import { ValidationError, ForbiddenError } from '../utils/errors';
import * as cashDrawerService from '../services/cashdrawer.service';

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

const openSchema = z.object({
  openingAmount: z.number().positive('Opening amount must be positive'),
});

const closeSchema = z.object({
  closingAmount: z.number().positive('Closing amount must be positive'),
});

// ── POST /open — Open cash drawer (budtender+) ───────────────────────

router.post(
  '/open',
  authenticate,
  validate(openSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const locationId = req.user!.locationId;

    if (!locationId) {
      throw new ValidationError(
        'User is not assigned to a location — cannot open drawer',
      );
    }

    const result = await cashDrawerService.openDrawer(
      userId,
      locationId,
      req.body.openingAmount,
    );

    res.status(201).json(result);
  }),
);

// ── POST /:id/close — Close cash drawer (budtender+) ─────────────────

router.post(
  '/:id/close',
  authenticate,
  validate(closeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const sessionId = req.params.id as string;
    const closingAmount = req.body.closingAmount;

    // Fetch session to enforce ownership / manager override
    const session = await prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new ValidationError('Cash drawer session not found');
    }

    if (session.status !== 'open') {
      throw new ValidationError(
        `Cannot close drawer — status is already "${session.status}"`,
      );
    }

    // Only the user who opened the drawer OR a manager can close it
    const isOwner = session.userId === req.user!.id;
    const isManager = ['shift_manager', 'store_manager', 'admin'].includes(
      req.user!.role,
    );

    if (!isOwner && !isManager) {
      throw new ForbiddenError(
        'Only the user who opened the drawer or a manager can close it',
      );
    }

    const result = await cashDrawerService.closeDrawer(
      sessionId,
      closingAmount,
    );

    res.json(result);
  }),
);

// ── GET /active — Get active (open) drawer (budtender+) ──────────────

router.get(
  '/active',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const locationId =
      (req.query.locationId as string) || req.user!.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const result = await cashDrawerService.getActiveDrawer(locationId);
    res.json(result);
  }),
);

// ── GET /history — Drawer session history (manager+) ─────────────────

router.get(
  '/history',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const locationId =
      (req.query.locationId as string) || req.user!.locationId;

    if (!locationId) {
      throw new ValidationError('locationId is required');
    }

    const { from, to, userId, limit, offset } = req.query as Record<
      string,
      string | undefined
    >;

    const result = await cashDrawerService.getDrawerHistory(locationId, {
      from,
      to,
      userId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    res.json(result);
  }),
);

export default router;
