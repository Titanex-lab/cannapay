import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { requireRole } from '../middleware/roleGuard';
import { NotFoundError } from '../utils/errors';
import { prisma } from '../index';

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
  name: z.string().min(1),
  quantity: z.number().positive('Quantity must be positive'),
  unitPrice: z.number().positive('Unit price must be positive'),
  category: z.string().min(1),
  strainName: z.string().optional(),
});

const holdCartSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Cart must have at least one item'),
  discountTotal: z.number().optional(),
  customerName: z.string().optional(),
  notes: z.string().optional(),
});

// ── POST /hold — Hold current cart ───────────────────────────────────

router.post(
  '/hold',
  authenticate,
  validate(holdCartSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { items, discountTotal, customerName, notes } = req.body as z.infer<
      typeof holdCartSchema
    >;

    const budtenderId = req.user!.id;
    const locationId = req.user!.locationId;

    if (!locationId) {
      res.status(400).json({
        error: {
          message: 'User must be assigned to a location to hold carts',
          statusCode: 400,
        },
      });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 hours

    const cartData = {
      items,
      discountTotal: discountTotal ?? 0,
      notes: notes ?? '',
    };

    const heldCart = await prisma.cartHold.create({
      data: {
        locationId,
        budtenderId,
        cartData: cartData as any,
        customerName: customerName ?? null,
        expiresAt,
      },
      select: {
        id: true,
        locationId: true,
        budtenderId: true,
        cartData: true,
        customerName: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    res.status(201).json(heldCart);
  }),
);

// ── GET /held — List non-expired held carts for this budtender ───────

router.get(
  '/held',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const budtenderId = req.user!.id;
    const locationId = req.user!.locationId;

    if (!locationId) {
      res.status(400).json({
        error: {
          message: 'User must be assigned to a location to view held carts',
          statusCode: 400,
        },
      });
      return;
    }

    const carts = await prisma.cartHold.findMany({
      where: {
        budtenderId,
        locationId,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        locationId: true,
        budtenderId: true,
        cartData: true,
        customerName: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    res.json(carts);
  }),
);

// ── DELETE /held/expired — Cleanup expired carts (admin / cron) ──────
// Must be declared BEFORE /held/:id to avoid "expired" being matched as :id

router.delete(
  '/held/expired',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const locationId = req.user!.locationId;

    const where: Record<string, any> = {
      expiresAt: { lt: new Date() },
    };

    // Scope to user's location if they have one
    if (locationId) {
      where.locationId = locationId;
    }

    const result = await prisma.cartHold.deleteMany({ where });

    res.json({ deleted: result.count });
  }),
);

// ── GET /held/:id — Get a specific held cart ─────────────────────────

router.get(
  '/held/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const budtenderId = req.user!.id;
    const locationId = req.user!.locationId;

    if (!locationId) {
      res.status(400).json({
        error: {
          message: 'User must be assigned to a location to view held carts',
          statusCode: 400,
        },
      });
      return;
    }

    const cart = await prisma.cartHold.findFirst({
      where: {
        id: req.params.id as string,
        budtenderId,
        locationId,
      },
    });

    if (!cart) {
      throw new NotFoundError('Held cart not found');
    }

    res.json({
      id: cart.id,
      locationId: cart.locationId,
      budtenderId: cart.budtenderId,
      cartData: cart.cartData,
      customerName: cart.customerName,
      createdAt: cart.createdAt,
      expiresAt: cart.expiresAt,
    });
  }),
);

// ── DELETE /held/:id — Resume cart (return data + delete hold) ───────

router.delete(
  '/held/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const budtenderId = req.user!.id;
    const locationId = req.user!.locationId;

    if (!locationId) {
      res.status(400).json({
        error: {
          message: 'User must be assigned to a location to resume carts',
          statusCode: 400,
        },
      });
      return;
    }

    // Find the cart first to verify ownership
    const cart = await prisma.cartHold.findFirst({
      where: {
        id: req.params.id as string,
        budtenderId,
        locationId,
      },
    });

    if (!cart) {
      throw new NotFoundError('Held cart not found');
    }

    // Delete the hold and return the cart data
    await prisma.cartHold.delete({ where: { id: cart.id } });

    res.json({
      id: cart.id,
      cartData: cart.cartData,
      customerName: cart.customerName,
      createdAt: cart.createdAt,
    });
  }),
);

export default router;
