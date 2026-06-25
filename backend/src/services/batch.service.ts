import { prisma } from '../index';
import { NotFoundError } from '../utils/errors';

// ── Types ────────────────────────────────────────────────────────────

export interface CreateBatchInput {
  lotNumber?: string; // auto-generate if not provided: "LOT-" + timestamp
  strainId: string;
  supplier?: string;
  harvestDate?: string; // ISO date
  productionDate?: string;
  labResults?: Record<string, unknown>;
  expirationDate?: string;
  currentPotencyThc?: number;
}

export interface UpdateBatchInput extends Partial<CreateBatchInput> {}

export interface BatchFilters {
  strainId?: string;
  search?: string; // search by lot number
  limit?: number;
  offset?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateLotNumber(): string {
  return `LOT-${Date.now()}`;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

// ── List batches ─────────────────────────────────────────────────────

export async function listBatches(filters?: BatchFilters) {
  const { strainId, search, limit = 20, offset = 0 } = filters ?? {};

  const where: Record<string, unknown> = {};

  if (strainId) {
    where.strainId = strainId;
  }

  if (search) {
    where.lotNumber = {
      contains: search,
      mode: 'insensitive',
    };
  }

  const [data, total] = await Promise.all([
    prisma.batch.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        strain: {
          select: { id: true, name: true },
        },
        _count: {
          select: { products: true },
        },
      },
    }),
    prisma.batch.count({ where }),
  ]);

  // Serialize Decimal fields
  const serialized = data.map((batch) => ({
    ...batch,
    currentPotencyThc: batch.currentPotencyThc
      ? Number(batch.currentPotencyThc)
      : null,
  }));

  return { data: serialized, total };
}

// ── Get single batch ─────────────────────────────────────────────────

export async function getBatch(id: string) {
  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      strain: {
        select: { id: true, name: true },
      },
      products: {
        select: { id: true, sku: true, name: true, category: true },
      },
    },
  });

  if (!batch) {
    throw new NotFoundError('Batch not found');
  }

  return {
    ...batch,
    currentPotencyThc: batch.currentPotencyThc
      ? Number(batch.currentPotencyThc)
      : null,
  };
}

// ── Create batch ─────────────────────────────────────────────────────

export async function createBatch(data: CreateBatchInput) {
  const lotNumber = data.lotNumber || generateLotNumber();

  const batch = await prisma.batch.create({
    data: {
      lotNumber,
      strainId: data.strainId,
      supplier: data.supplier,
      harvestDate: parseDate(data.harvestDate),
      productionDate: parseDate(data.productionDate),
      labResults: (data.labResults ?? undefined) as any,
      expirationDate: parseDate(data.expirationDate),
      currentPotencyThc: data.currentPotencyThc,
    },
    include: {
      strain: {
        select: { id: true, name: true },
      },
    },
  });

  return {
    ...batch,
    currentPotencyThc: batch.currentPotencyThc
      ? Number(batch.currentPotencyThc)
      : null,
  };
}

// ── Update batch ─────────────────────────────────────────────────────

export async function updateBatch(id: string, data: UpdateBatchInput) {
  const existing = await prisma.batch.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Batch not found');
  }

  const batch = await prisma.batch.update({
    where: { id },
    data: {
      ...(data.lotNumber !== undefined && { lotNumber: data.lotNumber }),
      ...(data.strainId !== undefined && { strainId: data.strainId }),
      ...(data.supplier !== undefined && { supplier: data.supplier }),
      ...(data.harvestDate !== undefined && {
        harvestDate: parseDate(data.harvestDate),
      }),
      ...(data.productionDate !== undefined && {
        productionDate: parseDate(data.productionDate),
      }),
      ...(data.labResults !== undefined && { labResults: data.labResults }),
      ...(data.expirationDate !== undefined && {
        expirationDate: parseDate(data.expirationDate),
      }),
      ...(data.currentPotencyThc !== undefined && {
        currentPotencyThc: data.currentPotencyThc,
      }),
    } as any,
    include: {
      strain: {
        select: { id: true, name: true },
      },
    },
  });

  return {
    ...batch,
    currentPotencyThc: batch.currentPotencyThc
      ? Number(batch.currentPotencyThc)
      : null,
  };
}

// ── Get batches by strain ────────────────────────────────────────────

export async function getBatchesByStrain(strainId: string) {
  const batches = await prisma.batch.findMany({
    where: { strainId },
    orderBy: { productionDate: 'desc' },
    select: {
      id: true,
      lotNumber: true,
      productionDate: true,
      currentPotencyThc: true,
      expirationDate: true,
    },
  });

  return batches.map((batch) => ({
    ...batch,
    currentPotencyThc: batch.currentPotencyThc
      ? Number(batch.currentPotencyThc)
      : null,
  }));
}
