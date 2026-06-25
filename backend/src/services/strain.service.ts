import { prisma } from '../index';
import { NotFoundError } from '../utils/errors';

// ── Types ────────────────────────────────────────────────────────────

export interface CreateStrainInput {
  name: string;
  type: 'indica' | 'sativa' | 'hybrid';
  thcPercent?: number;
  cbdPercent?: number;
  terpeneProfile?: string;
  aliases?: string[];
}

export interface UpdateStrainInput extends Partial<CreateStrainInput> {}

export interface StrainFilters {
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ── List strains ─────────────────────────────────────────────────────

export async function listStrains(filters?: StrainFilters) {
  const { type, search, limit = 20, offset = 0 } = filters ?? {};

  const where: Record<string, unknown> = {};

  if (type) {
    where.type = type;
  }

  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive',
    };
  }

  const [data, total] = await Promise.all([
    prisma.strain.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            batches: true,
            products: true,
          },
        },
      },
    }),
    prisma.strain.count({ where }),
  ]);

  // Convert Decimal fields to numbers for JSON serialization
  const serialized = data.map((strain) => ({
    ...strain,
    thcPercent: strain.thcPercent ? Number(strain.thcPercent) : null,
    cbdPercent: strain.cbdPercent ? Number(strain.cbdPercent) : null,
  }));

  return { data: serialized, total };
}

// ── Get single strain ────────────────────────────────────────────────

export async function getStrain(id: string) {
  const strain = await prisma.strain.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          batches: true,
          products: true,
        },
      },
    },
  });

  if (!strain) {
    throw new NotFoundError('Strain not found');
  }

  return {
    ...strain,
    thcPercent: strain.thcPercent ? Number(strain.thcPercent) : null,
    cbdPercent: strain.cbdPercent ? Number(strain.cbdPercent) : null,
  };
}

// ── Create strain ────────────────────────────────────────────────────

export async function createStrain(data: CreateStrainInput) {
  const strain = await prisma.strain.create({
    data: {
      name: data.name,
      type: data.type,
      thcPercent: data.thcPercent,
      cbdPercent: data.cbdPercent,
      terpeneProfile: data.terpeneProfile,
      aliases: data.aliases ?? [],
    },
  });

  return {
    ...strain,
    thcPercent: strain.thcPercent ? Number(strain.thcPercent) : null,
    cbdPercent: strain.cbdPercent ? Number(strain.cbdPercent) : null,
  };
}

// ── Update strain ────────────────────────────────────────────────────

export async function updateStrain(id: string, data: UpdateStrainInput) {
  const existing = await prisma.strain.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Strain not found');
  }

  const strain = await prisma.strain.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.thcPercent !== undefined && { thcPercent: data.thcPercent }),
      ...(data.cbdPercent !== undefined && { cbdPercent: data.cbdPercent }),
      ...(data.terpeneProfile !== undefined && { terpeneProfile: data.terpeneProfile }),
      ...(data.aliases !== undefined && { aliases: data.aliases }),
    },
  });

  return {
    ...strain,
    thcPercent: strain.thcPercent ? Number(strain.thcPercent) : null,
    cbdPercent: strain.cbdPercent ? Number(strain.cbdPercent) : null,
  };
}

// ── Delete strain ────────────────────────────────────────────────────

/**
 * Soft-delete strategy: we return success but keep the DB row
 * for referential integrity (batches/products still reference strains).
 * Admin-only operation.
 */
export async function deleteStrain(id: string) {
  const existing = await prisma.strain.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Strain not found');
  }

  // Row stays in DB — referential integrity for batches and products.
  // A future isActive flag could be added to the Strain model for soft-deletes.
  return { deleted: true };
}
