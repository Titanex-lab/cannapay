import { prisma } from '../index';
import { NotFoundError } from '../utils/errors';

// ── Types ────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku?: string;
  name: string;
  category: string;
  strainId?: string;
  batchId?: string;
  costPrice: number;
  sellPrice: number;
  unitType?: string;
  weightGrams?: number;
  barcode?: string;
  taxCategory?: string;
}

export interface UpdateProductInput extends Partial<CreateProductInput> {}

export interface ProductFilters {
  category?: string;
  strainId?: string;
  batchId?: string;
  isActive?: boolean;
  search?: string;
  locationId?: string;
  limit?: number;
  offset?: number;
}

// ── Decimal helpers ──────────────────────────────────────────────────

function serializeProduct(product: Record<string, unknown>) {
  return {
    ...product,
    costPrice: product.costPrice != null ? Number(product.costPrice) : null,
    sellPrice: product.sellPrice != null ? Number(product.sellPrice) : null,
    weightGrams:
      product.weightGrams != null ? Number(product.weightGrams) : null,
    inventory: Array.isArray(product.inventory)
      ? (product.inventory as Array<Record<string, unknown>>).map((inv) => ({
          ...inv,
          quantity: inv.quantity != null ? Number(inv.quantity) : null,
          reorderPoint:
            inv.reorderPoint != null ? Number(inv.reorderPoint) : null,
        }))
      : product.inventory,
  };
}

// ── SKU generator ────────────────────────────────────────────────────

function generateSku(): string {
  return `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
}

// ── List products ────────────────────────────────────────────────────

export async function listProducts(filters?: ProductFilters) {
  const {
    category,
    strainId,
    batchId,
    isActive,
    search,
    locationId,
    limit = 20,
    offset = 0,
  } = filters ?? {};

  const where: Record<string, unknown> = {};

  if (category) {
    where.category = category;
  }

  if (strainId) {
    where.strainId = strainId;
  }

  if (batchId) {
    where.batchId = batchId;
  }

  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { sku: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Build include conditionally — only include inventory filtered by
  // locationId when requested.
  const include: Record<string, unknown> = {
    strain: {
      select: { id: true, name: true, type: true },
    },
    batch: {
      select: { id: true, lotNumber: true },
    },
  };

  if (locationId) {
    include.inventory = {
      where: { locationId },
      select: {
        id: true,
        productId: true,
        locationId: true,
        quantity: true,
        reorderPoint: true,
      },
    };
  } else {
    include.inventory = {
      select: {
        id: true,
        productId: true,
        locationId: true,
        quantity: true,
        reorderPoint: true,
      },
    };
  }

  const [data, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { name: 'asc' },
      include: include as any,
    }),
    prisma.product.count({ where }),
  ]);

  return { data: data.map(serializeProduct), total };
}

// ── Get single product ───────────────────────────────────────────────

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      strain: {
        select: { id: true, name: true, type: true },
      },
      batch: {
        select: { id: true, lotNumber: true },
      },
      inventory: {
        select: {
          id: true,
          productId: true,
          locationId: true,
          quantity: true,
          reorderPoint: true,
        },
      },
    },
  });

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  return serializeProduct(product as unknown as Record<string, unknown>);
}

// ── Create product ───────────────────────────────────────────────────

export async function createProduct(data: CreateProductInput) {
  const sku = data.sku || generateSku();

  const product = await prisma.product.create({
    data: {
      sku,
      name: data.name,
      category: data.category as import('@prisma/client').ProductCategory,
      strainId: data.strainId ?? null,
      batchId: data.batchId ?? null,
      costPrice: data.costPrice,
      sellPrice: data.sellPrice,
      unitType:
        (data.unitType as import('@prisma/client').UnitType) || 'each',
      weightGrams: data.weightGrams ?? null,
      barcode: data.barcode ?? null,
      taxCategory:
        (data.taxCategory as import('@prisma/client').TaxCategory) ||
        'standard',
    },
    include: {
      strain: {
        select: { id: true, name: true, type: true },
      },
      batch: {
        select: { id: true, lotNumber: true },
      },
      inventory: {
        select: {
          id: true,
          productId: true,
          locationId: true,
          quantity: true,
          reorderPoint: true,
        },
      },
    },
  });

  return serializeProduct(product as unknown as Record<string, unknown>);
}

// ── Update product ───────────────────────────────────────────────────

export async function updateProduct(id: string, data: UpdateProductInput) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Product not found');
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.sku !== undefined && { sku: data.sku }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.category !== undefined && {
        category: data.category as import('@prisma/client').ProductCategory,
      }),
      ...(data.strainId !== undefined && { strainId: data.strainId }),
      ...(data.batchId !== undefined && { batchId: data.batchId }),
      ...(data.costPrice !== undefined && { costPrice: data.costPrice }),
      ...(data.sellPrice !== undefined && { sellPrice: data.sellPrice }),
      ...(data.unitType !== undefined && {
        unitType: data.unitType as import('@prisma/client').UnitType,
      }),
      ...(data.weightGrams !== undefined && {
        weightGrams: data.weightGrams,
      }),
      ...(data.barcode !== undefined && { barcode: data.barcode }),
      ...(data.taxCategory !== undefined && {
        taxCategory: data.taxCategory as import('@prisma/client').TaxCategory,
      }),
    },
    include: {
      strain: {
        select: { id: true, name: true, type: true },
      },
      batch: {
        select: { id: true, lotNumber: true },
      },
      inventory: {
        select: {
          id: true,
          productId: true,
          locationId: true,
          quantity: true,
          reorderPoint: true,
        },
      },
    },
  });

  return serializeProduct(product as unknown as Record<string, unknown>);
}

// ── Get products by category ─────────────────────────────────────────

export async function getProductsByCategory(
  category: string,
  locationId: string,
) {
  const products = await prisma.product.findMany({
    where: {
      category: category as import('@prisma/client').ProductCategory,
      isActive: true,
    },
    orderBy: { name: 'asc' },
    include: {
      strain: {
        select: { id: true, name: true, type: true },
      },
      batch: {
        select: { id: true, lotNumber: true },
      },
      inventory: {
        where: { locationId },
        select: {
          id: true,
          productId: true,
          locationId: true,
          quantity: true,
          reorderPoint: true,
        },
      },
    },
  });

  return products.map(serializeProduct);
}
