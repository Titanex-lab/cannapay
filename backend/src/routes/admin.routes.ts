import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { validate } from '../middleware/validation';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { prisma } from '../index';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Zod schemas ──

const createUserSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required').max(200),
  pin: z.string().length(6, 'PIN must be exactly 6 digits').optional(),
  role: z.enum(['budtender', 'shift_manager', 'store_manager', 'admin']),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

const updateUserSchema = z.object({
  email: z.string().email('Valid email required').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
  fullName: z.string().min(1).max(200).optional(),
  pin: z.string().length(6, 'PIN must be exactly 6 digits').optional(),
  role: z.enum(['budtender', 'shift_manager', 'store_manager', 'admin']).optional(),
  locationId: z.string().uuid('Invalid location ID').optional().nullable(),
  isActive: z.boolean().optional(),
});

const resetPinSchema = z.object({
  pin: z.string().length(6, 'PIN must be exactly 6 digits'),
});

// ── GET /locations — List all locations ──────────────────────────────

router.get(
  '/locations',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true, licenseNumber: true },
      orderBy: { name: 'asc' },
    });
    res.json(locations);
  }),
);

// ── GET / — List all users ───────────────────────────────────────────

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const search = (req.query.search as string) || '';
    const role = req.query.role as string | undefined;

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        pin: true,
        locationId: true,
        isActive: true,
        createdAt: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    res.json(users.map(u => ({
      ...u,
      pin: u.pin ? '••••••' : null, // never expose plain PIN
    })));
  }),
);

// ── POST / — Create user ─────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  validate(createUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, fullName, pin, role, locationId } = req.body;

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        pin: pin ?? null,
        role,
        locationId: locationId ?? null,
      },
      select: {
        id: true, email: true, fullName: true, role: true, pin: true,
        locationId: true, isActive: true, createdAt: true,
        location: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({
      ...user,
      pin: user.pin ? '••••••' : null,
    });
  }),
);

// ── PUT /:id — Update user ───────────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('admin'),
  validate(updateUserSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { email, password, fullName, pin, role, locationId, isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User not found');

    // Check email uniqueness if changing
    if (email && email !== existing.email) {
      const dup = await prisma.user.findUnique({ where: { email } });
      if (dup) throw new ConflictError('A user with this email already exists');
    }

    const data: any = {};
    if (email !== undefined) data.email = email;
    if (password !== undefined) data.passwordHash = await bcrypt.hash(password, 12);
    if (fullName !== undefined) data.fullName = fullName;
    if (pin !== undefined) data.pin = pin;
    if (role !== undefined) data.role = role;
    if (locationId !== undefined) data.locationId = locationId;
    if (isActive !== undefined) data.isActive = isActive;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, email: true, fullName: true, role: true, pin: true,
        locationId: true, isActive: true, createdAt: true,
        location: { select: { id: true, name: true } },
      },
    });

    res.json({
      ...user,
      pin: user.pin ? '••••••' : null,
    });
  }),
);

// ── POST /:id/reset-pin — Reset PIN ──────────────────────────────────

router.post(
  '/:id/reset-pin',
  authenticate,
  requireRole('admin'),
  validate(resetPinSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { pin } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User not found');

    await prisma.user.update({
      where: { id },
      data: { pin },
    });

    res.json({ message: 'PIN reset successfully' });
  }),
);

export default router;
