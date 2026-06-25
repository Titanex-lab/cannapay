import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import * as customerService from '../services/customer.service';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ── Schemas ──────────────────────────────────────────────────────────

const createCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  locationId: z.string().uuid(),
  consentSMS: z.boolean().optional(),
});

// ── GET / — List customers ───────────────────────────────────────────

router.get(
  '/',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, locationId, limit, offset } = req.query;
    const result = await customerService.listCustomers({
      search: search as string | undefined,
      locationId: locationId as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(result);
  }),
);

// ── GET /export — CSV export ─────────────────────────────────────────

router.get(
  '/export',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { search, locationId } = req.query;
    const csv = await customerService.exportCustomersCSV({
      search: search as string | undefined,
      locationId: locationId as string | undefined,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
    res.send(csv);
  }),
);

// ── GET /:id — Single customer ──────────────────────────────────────

router.get(
  '/:id',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getCustomer(req.params.id as string);
    if (!customer) {
      res.status(404).json({ error: { message: 'Customer not found', statusCode: 404 } });
      return;
    }
    res.json(customer);
  }),
);

// ── POST / — Create/find customer (budtender+) ─────────────────────

router.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createCustomerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: parsed.error.errors[0]?.message || 'Validation failed', statusCode: 400 } });
      return;
    }
    const { firstName, lastName, email, phone, locationId, consentSMS } = parsed.data;
    const customer = await customerService.findOrCreate({
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      locationId,
      consentSMS,
    });
    res.status(201).json(customer);
  }),
);

// ── PUT /:id — Update customer ──────────────────────────────────────

router.put(
  '/:id',
  authenticate,
  requireRole('shift_manager', 'store_manager', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.updateCustomer(req.params.id as string, req.body);
    res.json(customer);
  }),
);

export default router;
