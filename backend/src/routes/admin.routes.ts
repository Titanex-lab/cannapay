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

// ── GET /diagnostic — Check users exist (temporary) ──────────────────

router.get(
  '/diagnostic',
  asyncHandler(async (req: Request, res: Response) => {
    const users = await prisma.user.findMany({ select: { email: true, fullName: true, role: true, isActive: true, locationId: true, pin: true } });
    const count = await prisma.user.count();
    const strains = await prisma.strain.count();
    const locations = await prisma.location.findMany({ select: { id: true, name: true } });
    res.json({ userCount: count, strains, locations, users });
  }),
);

// ── POST /seed — Seed production database ────────────────────────────

router.post(
  '/seed',
  asyncHandler(async (req: Request, res: Response) => {
    // Clear existing data in correct order (respecting FK constraints)
    await prisma.auditLog.deleteMany();
    await prisma.cartHold.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.transactionItem.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.inventoryAdjustment.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.cashDrawerSession.deleteMany();
    await prisma.product.deleteMany();
    await prisma.batch.deleteMany();
    await prisma.strain.deleteMany();
    await prisma.messagingLog.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.location.deleteMany();

    // Create locations
    const linbro = await prisma.location.create({
      data: { name: 'Linbro', address: '', licenseNumber: 'GP-DISP-2024-001' },
    });
    const fourways = await prisma.location.create({
      data: { name: 'Fourways', address: '', licenseNumber: 'GP-DISP-2024-002' },
    });

    // Create users
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('CannaPay2024!', 12);
    const costello = await prisma.user.create({ data: { email: 'costello@cannapay.app', passwordHash, fullName: 'Costello', pin: '000000', role: 'admin', locationId: linbro.id } });
    const maury = await prisma.user.create({ data: { email: 'maury@cannapay.app', passwordHash, fullName: 'Maury', pin: '000000', role: 'admin', locationId: linbro.id } });
    const djemba = await prisma.user.create({ data: { email: 'djemba@cannapay.app', passwordHash, fullName: 'Djemba', pin: '000000', role: 'admin', locationId: fourways.id } });

    // 20 strains
    const strains = [
      { name: 'Wedding Cake', type: 'hybrid' as const, thcPercent: 24.0, cbdPercent: 0.1, terpeneProfile: 'Earthy, vanilla, sweet', aliases: ['wed cake', 'wedding', 'pink cookies'] },
      { name: 'Girl Scout Cookies', type: 'hybrid' as const, thcPercent: 22.0, cbdPercent: 0.2, terpeneProfile: 'Earthy, sweet, minty', aliases: ['gsc', 'cookies', 'scout'] },
      { name: 'Blue Dream', type: 'sativa' as const, thcPercent: 18.0, cbdPercent: 0.5, terpeneProfile: 'Berry, sweet, earthy', aliases: ['blue d', 'bd', 'azure'] },
      { name: 'OG Kush', type: 'hybrid' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Pine, earthy, sour', aliases: ['og', 'kush', 'ogk'] },
      { name: 'Granddaddy Purple', type: 'indica' as const, thcPercent: 19.0, cbdPercent: 0.3, terpeneProfile: 'Grape, berry, sweet', aliases: ['gdp', 'purple', 'granddaddy'] },
      { name: 'Durban Poison', type: 'sativa' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Pine, earthy, sweet', aliases: ['durban', 'dp', 'poison'] },
      { name: 'Gelato', type: 'hybrid' as const, thcPercent: 21.0, cbdPercent: 0.1, terpeneProfile: 'Sweet, creamy, fruity', aliases: ['gelato 33', 'larry bird'] },
      { name: 'Northern Lights', type: 'indica' as const, thcPercent: 18.0, cbdPercent: 0.4, terpeneProfile: 'Pine, earthy, sweet', aliases: ['nl', 'northern', 'lights'] },
      { name: 'Green Crack', type: 'sativa' as const, thcPercent: 17.0, cbdPercent: 0.2, terpeneProfile: 'Citrus, mango, fruity', aliases: ['green', 'crack', 'gc'] },
      { name: 'Bubba Kush', type: 'indica' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Coffee, earthy, sweet', aliases: ['bubba', 'bk'] },
      { name: 'Sour Diesel', type: 'sativa' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Diesel, citrus, sour', aliases: ['sour d', 'diesel', 'sd'] },
      { name: 'White Widow', type: 'hybrid' as const, thcPercent: 19.0, cbdPercent: 0.3, terpeneProfile: 'Earthy, pine, sweet', aliases: ['widow', 'white', 'ww'] },
      { name: 'AK-47', type: 'hybrid' as const, thcPercent: 20.0, cbdPercent: 0.2, terpeneProfile: 'Earthy, floral, sweet', aliases: ['ak', 'ak47'] },
      { name: 'Pineapple Express', type: 'hybrid' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Pineapple, tropical, sweet', aliases: ['pineapple', 'express', 'pe'] },
      { name: 'Jack Herer', type: 'sativa' as const, thcPercent: 18.0, cbdPercent: 0.3, terpeneProfile: 'Pine, earthy, citrus', aliases: ['jack', 'herer', 'jh'] },
      { name: 'Cheese', type: 'hybrid' as const, thcPercent: 17.0, cbdPercent: 0.2, terpeneProfile: 'Cheese, earthy, sour', aliases: ['uk cheese', 'exodus'] },
      { name: 'Runtz', type: 'hybrid' as const, thcPercent: 22.0, cbdPercent: 0.1, terpeneProfile: 'Sweet, fruity, creamy', aliases: ['runtz og', 'white runtz'] },
      { name: 'Do-Si-Dos', type: 'indica' as const, thcPercent: 23.0, cbdPercent: 0.1, terpeneProfile: 'Earthy, floral, sweet', aliases: ['dosi', 'dosidos', 'dosi do'] },
      { name: 'Mimosa', type: 'sativa' as const, thcPercent: 19.0, cbdPercent: 0.2, terpeneProfile: 'Citrus, tropical, sweet', aliases: ['mimosa evo', 'clementine'] },
      { name: 'Zkittlez', type: 'indica' as const, thcPercent: 20.0, cbdPercent: 0.1, terpeneProfile: 'Berry, grape, fruity', aliases: ['zkittlez', 'skittles', 'zkittles'] },
    ];
    const createdStrains = [];
    for (const s of strains) {
      const strain = await prisma.strain.create({ data: s });
      createdStrains.push(strain);
    }

    // 10 batches
    const batches = [];
    const batchData = [
      { lotNumber: 'LOT-2026-WC-001', strainIdx: 0, supplier: 'Highveld Growers' },
      { lotNumber: 'LOT-2026-GSC-001', strainIdx: 1, supplier: 'Cape Cultivars' },
      { lotNumber: 'LOT-2026-BD-001', strainIdx: 2, supplier: 'Cape Cultivars' },
      { lotNumber: 'LOT-2026-OGK-001', strainIdx: 3, supplier: 'Highveld Growers' },
      { lotNumber: 'LOT-2026-GDP-001', strainIdx: 4, supplier: 'Durban Greens' },
      { lotNumber: 'LOT-2026-DP-001', strainIdx: 5, supplier: 'Durban Greens' },
      { lotNumber: 'LOT-2026-GEL-001', strainIdx: 6, supplier: 'Cape Cultivars' },
      { lotNumber: 'LOT-2026-NL-001', strainIdx: 7, supplier: 'Highveld Growers' },
      { lotNumber: 'LOT-2026-RUNTZ-001', strainIdx: 16, supplier: 'Cape Cultivars' },
      { lotNumber: 'LOT-2026-DOSI-001', strainIdx: 17, supplier: 'Durban Greens' },
    ];
    for (const b of batchData) {
      const strain = createdStrains[b.strainIdx];
      const batch = await prisma.batch.create({
        data: { lotNumber: b.lotNumber, strainId: strain.id, supplier: b.supplier, productionDate: new Date('2026-05-01'), currentPotencyThc: Number(strain.thcPercent) - 0.2, expirationDate: new Date('2027-05-01') },
      });
      batches.push(batch);
    }

    // 30 products + inventory
    const products = [
      { sku: 'FLR-WC-3.5', name: 'Wedding Cake 3.5g', category: 'flower' as const, strainIdx: 0, batchIdx: 0, costPrice: 200, sellPrice: 350, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-GSC-1', name: 'Girl Scout Cookies 1g', category: 'flower' as const, strainIdx: 1, batchIdx: 1, costPrice: 55, sellPrice: 100, unitType: 'gram' as const, weightGrams: 1.0, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-GSC-3.5', name: 'Girl Scout Cookies 3.5g', category: 'flower' as const, strainIdx: 1, batchIdx: 1, costPrice: 190, sellPrice: 340, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-BD-3.5', name: 'Blue Dream 3.5g', category: 'flower' as const, strainIdx: 2, batchIdx: 2, costPrice: 180, sellPrice: 320, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-BD-7', name: 'Blue Dream 7g', category: 'flower' as const, strainIdx: 2, batchIdx: 2, costPrice: 340, sellPrice: 600, unitType: 'quarter' as const, weightGrams: 7.0, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-OGK-3.5', name: 'OG Kush 3.5g', category: 'flower' as const, strainIdx: 3, batchIdx: 3, costPrice: 195, sellPrice: 350, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-GDP-3.5', name: 'Granddaddy Purple 3.5g', category: 'flower' as const, strainIdx: 4, batchIdx: 4, costPrice: 180, sellPrice: 320, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-DP-3.5', name: 'Durban Poison 3.5g', category: 'flower' as const, strainIdx: 5, batchIdx: 5, costPrice: 170, sellPrice: 300, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-GEL-3.5', name: 'Gelato 3.5g', category: 'flower' as const, strainIdx: 6, batchIdx: 6, costPrice: 210, sellPrice: 380, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-NL-3.5', name: 'Northern Lights 3.5g', category: 'flower' as const, strainIdx: 7, batchIdx: 7, costPrice: 170, sellPrice: 300, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-RUNTZ-3.5', name: 'Runtz 3.5g', category: 'flower' as const, strainIdx: 16, batchIdx: 8, costPrice: 220, sellPrice: 400, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'FLR-DOSI-3.5', name: 'Do-Si-Dos 3.5g', category: 'flower' as const, strainIdx: 17, batchIdx: 9, costPrice: 230, sellPrice: 420, unitType: 'eighth' as const, weightGrams: 3.5, taxCategory: 'excise_flower' as const },
      { sku: 'PRE-WC-1', name: 'Wedding Cake Pre-Roll', category: 'pre_roll' as const, strainIdx: 0, batchIdx: 0, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
      { sku: 'PRE-GSC-1', name: 'GSC Pre-Roll', category: 'pre_roll' as const, strainIdx: 1, batchIdx: 1, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
      { sku: 'PRE-BD-1', name: 'Blue Dream Pre-Roll', category: 'pre_roll' as const, strainIdx: 2, batchIdx: 2, costPrice: 40, sellPrice: 75, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
      { sku: 'PRE-OGK-1', name: 'OG Kush Pre-Roll', category: 'pre_roll' as const, strainIdx: 3, batchIdx: 3, costPrice: 45, sellPrice: 80, unitType: 'each' as const, weightGrams: 0.75, taxCategory: 'excise_flower' as const },
      { sku: 'VAP-WC-1', name: 'Wedding Cake Cart 1g', category: 'vape' as const, strainIdx: 0, batchIdx: 0, costPrice: 250, sellPrice: 450, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'VAP-GSC-1', name: 'GSC Cart 1g', category: 'vape' as const, strainIdx: 1, batchIdx: 1, costPrice: 250, sellPrice: 450, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'VAP-BD-1', name: 'Blue Dream Cart 1g', category: 'vape' as const, strainIdx: 2, batchIdx: 2, costPrice: 240, sellPrice: 430, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'VAP-GEL-1', name: 'Gelato Cart 1g', category: 'vape' as const, strainIdx: 6, batchIdx: 6, costPrice: 260, sellPrice: 480, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'EDB-GUM-10', name: 'Sour Cherry Gummies 10pk', category: 'edible' as const, strainIdx: 4, batchIdx: 4, costPrice: 120, sellPrice: 250, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
      { sku: 'EDB-CHOC-1', name: 'Dark Chocolate Bar 100mg', category: 'edible' as const, strainIdx: 7, batchIdx: 7, costPrice: 150, sellPrice: 300, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
      { sku: 'EDB-BROWN-1', name: 'Infused Brownie', category: 'edible' as const, strainIdx: 16, batchIdx: 8, costPrice: 80, sellPrice: 180, unitType: 'each' as const, taxCategory: 'excise_edible' as const },
      { sku: 'CON-WAX-WC', name: 'Wedding Cake Live Resin 1g', category: 'concentrate' as const, strainIdx: 0, batchIdx: 0, costPrice: 300, sellPrice: 550, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'CON-SHAT-GSC', name: 'GSC Shatter 1g', category: 'concentrate' as const, strainIdx: 1, batchIdx: 1, costPrice: 280, sellPrice: 500, unitType: 'each' as const, weightGrams: 1.0, taxCategory: 'excise_concentrate' as const },
      { sku: 'ACC-LIGHTER', name: 'Clipper Lighter', category: 'accessory' as const, costPrice: 15, sellPrice: 30, unitType: 'each' as const, taxCategory: 'standard' as const },
      { sku: 'ACC-GRINDER', name: '4-Piece Grinder', category: 'accessory' as const, costPrice: 80, sellPrice: 150, unitType: 'each' as const, taxCategory: 'standard' as const },
      { sku: 'ACC-PAPERS', name: 'RAW Rolling Papers', category: 'accessory' as const, costPrice: 10, sellPrice: 25, unitType: 'each' as const, taxCategory: 'standard' as const },
      { sku: 'ACC-TIPS', name: 'RAW Filter Tips', category: 'accessory' as const, costPrice: 8, sellPrice: 20, unitType: 'each' as const, taxCategory: 'standard' as const },
      { sku: 'ACC-TUBE', name: 'Doob Tube (5 pack)', category: 'accessory' as const, costPrice: 20, sellPrice: 45, unitType: 'each' as const, taxCategory: 'standard' as const },
    ];

    const createdProducts = [];
    for (const p of products) {
      const prod = await prisma.product.create({
        data: {
          sku: p.sku, name: p.name, category: p.category,
          strainId: p.strainIdx != null ? createdStrains[p.strainIdx].id : null,
          batchId: p.batchIdx != null ? batches[p.batchIdx].id : null,
          costPrice: p.costPrice, sellPrice: p.sellPrice,
          unitType: p.unitType, weightGrams: p.weightGrams, taxCategory: p.taxCategory,
        },
      });
      createdProducts.push(prod);
    }

    // Inventory for Linbro
    for (const prod of createdProducts) {
      await prisma.inventory.create({
        data: { productId: prod.id, locationId: linbro.id, quantity: prod.sku.startsWith('ACC') ? 30 : 20, reorderPoint: 5 },
      });
    }
    // Inventory for Fourways (same products, slightly different quantities)
    for (const prod of createdProducts) {
      await prisma.inventory.create({
        data: { productId: prod.id, locationId: fourways.id, quantity: prod.sku.startsWith('ACC') ? 25 : 15, reorderPoint: 5 },
      });
    }

    res.json({
      message: 'Database seeded successfully',
      locations: { linbro: linbro.id, fourways: fourways.id },
      counts: {
        locations: 2,
        users: 3,
        strains: createdStrains.length,
        batches: batches.length,
        products: createdProducts.length,
        inventory: createdProducts.length * 2,
      },
    });
  }),
);

export default router;
