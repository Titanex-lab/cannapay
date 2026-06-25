import { prisma } from '../index';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { Prisma } from '@prisma/client';
import { broadcastInventoryUpdate } from '../socket/inventorySync';

// ── Types ────────────────────────────────────────────────────────────

export interface StockFilters {
  category?: string;
  search?: string;
  lowStock?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdjustInventoryInput {
  productId: string;
  batchId?: string;
  locationId: string;
  quantity: number; // negative for removal, positive for addition
  reasonCode: string;
  notes?: string;
  employeeId: string;
  approvedBy?: string;
  value?: number;
}

export interface AdjustmentFilters {
  productId?: string;
  reasonCode?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function serializeDecimal(value: Prisma.Decimal | number | null | undefined): number {
  if (value instanceof Prisma.Decimal) return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

// ── Get all stock levels for a location ──────────────────────────────

export async function getStockLevels(
  locationId: string,
  filters?: StockFilters,
) {
  const { category, search, lowStock, limit = 20, offset = 0 } = filters ?? {};

  // Build where clause for the inventory product relation
  const where: Prisma.InventoryWhereInput = { locationId };

  if (category) {
    where.product = { category: category as Prisma.EnumProductCategoryFilter['equals'] };
  }

  if (search) {
    where.product = {
      ...(where.product as Prisma.ProductWhereInput ?? {}),
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  if (lowStock) {
    // Filtering two columns (quantity <= reorderPoint) is not directly
    // supported in Prisma's type-safe where. Since inventory records
    // per location are modest, we filter in the application layer below.
  }

  // Fetch without the lowStock column-comparison filter
  const [rawData, rawTotal] = await Promise.all([
    prisma.inventory.findMany({
      where,
      skip: lowStock ? undefined : offset,
      take: lowStock ? undefined : limit,
      orderBy: { product: { name: 'asc' } },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            sellPrice: true,
            unitType: true,
            weightGrams: true,
            strain: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    }),
    prisma.inventory.count({ where }),
  ]);

  // Apply lowStock filter in application layer if requested
  let filteredData = rawData;
  if (lowStock) {
    filteredData = rawData.filter(
      (inv) => Number(inv.quantity) <= Number(inv.reorderPoint),
    );
  }

  // Apply pagination manually when lowStock filter is active
  const total = lowStock ? filteredData.length : rawTotal;
  const data = lowStock
    ? filteredData.slice(offset, offset + limit)
    : filteredData;

  // Serialize Decimal fields for JSON
  const serialized = data.map((inv) => ({
    id: inv.id,
    productId: inv.productId,
    locationId: inv.locationId,
    quantity: serializeDecimal(inv.quantity),
    reorderPoint: serializeDecimal(inv.reorderPoint),
    updatedAt: inv.updatedAt,
    product: {
      ...inv.product,
      sellPrice: serializeDecimal(inv.product.sellPrice),
      weightGrams: inv.product.weightGrams ? serializeDecimal(inv.product.weightGrams) : null,
    },
  }));

  return { data: serialized, total };
}

// ── Get single stock level ───────────────────────────────────────────

export async function getStockLevel(productId: string, locationId: string) {
  let inventory = await prisma.inventory.findUnique({
    where: {
      productId_locationId: { productId, locationId },
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          category: true,
          sellPrice: true,
          unitType: true,
          weightGrams: true,
          strain: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });

  // Auto-create inventory record if it doesn't exist (quantity 0)
  if (!inventory) {
    // Verify product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    inventory = await prisma.inventory.create({
      data: {
        productId,
        locationId,
        quantity: 0,
        reorderPoint: 5,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            sellPrice: true,
            unitType: true,
            weightGrams: true,
            strain: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });
  }

  return {
    id: inventory.id,
    productId: inventory.productId,
    locationId: inventory.locationId,
    quantity: serializeDecimal(inventory.quantity),
    reorderPoint: serializeDecimal(inventory.reorderPoint),
    updatedAt: inventory.updatedAt,
    product: {
      ...inventory.product,
      sellPrice: serializeDecimal(inventory.product.sellPrice),
      weightGrams: inventory.product.weightGrams
        ? serializeDecimal(inventory.product.weightGrams)
        : null,
    },
  };
}

// ── Adjust inventory (non-sale stock change) ─────────────────────────

export async function adjustInventory(data: AdjustInventoryInput) {
  const { productId, batchId, locationId, quantity, reasonCode, notes, employeeId, approvedBy, value } = data;

  // 1. Verify product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sellPrice: true },
  });
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // 2. Ensure inventory record exists (upsert) and get current quantity
  const inventory = await prisma.inventory.upsert({
    where: { productId_locationId: { productId, locationId } },
    create: { productId, locationId, quantity: 0, reorderPoint: 5 },
    update: {},
  });

  const currentQuantity = serializeDecimal(inventory.quantity);
  const newQuantity = currentQuantity + quantity;

  // 3. Prevent negative stock
  if (newQuantity < 0) {
    throw new ValidationError(
      `Insufficient stock: current ${currentQuantity}, adjustment ${quantity}, would result in ${newQuantity}`,
    );
  }

  // 4. Manager approval check for high-value adjustments
  const adjustmentValue = value ?? Math.abs(quantity) * serializeDecimal(product.sellPrice);
  if (adjustmentValue > config.managerApprovalAdjustmentThreshold && !approvedBy) {
    throw new ForbiddenError(
      `Manager approval required for adjustments over ${config.managerApprovalAdjustmentThreshold}`,
    );
  }

  // 5. Atomic transaction: update stock, create adjustment record, write audit log
  const result = await prisma.$transaction(async (tx) => {
    // a. Update inventory quantity
    await tx.inventory.update({
      where: { id: inventory.id },
      data: { quantity: newQuantity },
    });

    // b. Create inventory_adjustments record
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        productId,
        batchId: batchId ?? null,
        locationId,
        quantity,
        reasonCode: reasonCode as any,
        notes: notes ?? null,
        employeeId,
        approvedBy: approvedBy ?? null,
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            sellPrice: true,
            unitType: true,
          },
        },
        batch: {
          select: {
            id: true,
            lotNumber: true,
          },
        },
        employee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    // c. Create audit_log record
    await tx.auditLog.create({
      data: {
        entityType: 'inventory',
        entityId: productId,
        action: 'adjust',
        changes: {
          previousQuantity: currentQuantity,
          adjustmentQuantity: quantity,
          newQuantity,
          reasonCode,
          notes: notes ?? null,
          approvedBy: approvedBy ?? null,
          value: adjustmentValue,
        },
        performedBy: employeeId,
        locationId,
      },
    });

    return adjustment;
  });

  // Broadcast inventory update to all clients in the location
  broadcastInventoryUpdate(data.locationId, {
    productId: data.productId,
    productName: product.name,
    newQuantity,
    timestamp: new Date().toISOString(),
  });

  // Serialize Decimal fields
  return {
    ...result,
    quantity: serializeDecimal(result.quantity),
    product: result.product
      ? { ...result.product, sellPrice: serializeDecimal(result.product.sellPrice) }
      : result.product,
  };
}

// ── Get adjustment history ───────────────────────────────────────────

export async function getAdjustmentHistory(
  locationId: string,
  filters?: AdjustmentFilters,
) {
  const { productId, reasonCode, from, to, limit = 20, offset = 0 } = filters ?? {};

  const where: Prisma.InventoryAdjustmentWhereInput = { locationId };

  if (productId) {
    where.productId = productId;
  }

  if (reasonCode) {
    where.reasonCode = reasonCode as any;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
    }
    if (to) {
      (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }
  }

  const [data, total] = await Promise.all([
    prisma.inventoryAdjustment.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            sellPrice: true,
            unitType: true,
          },
        },
        batch: {
          select: {
            id: true,
            lotNumber: true,
          },
        },
        employee: {
          select: {
            id: true,
            fullName: true,
          },
        },
        approver: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    }),
    prisma.inventoryAdjustment.count({ where }),
  ]);

  // Serialize Decimal fields
  const serialized = data.map((adj) => ({
    ...adj,
    quantity: serializeDecimal(adj.quantity),
    product: adj.product
      ? { ...adj.product, sellPrice: serializeDecimal(adj.product.sellPrice) }
      : adj.product,
  }));

  return { data: serialized, total };
}

// ── Transfer stock between locations ─────────────────────────────────

export interface TransferInput {
  productId: string;
  batchId?: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  employeeId: string;
  notes?: string;
}

export async function transferStock(data: TransferInput) {
  const { productId, batchId, fromLocationId, toLocationId, quantity, employeeId, notes } = data;

  if (fromLocationId === toLocationId) {
    throw new ValidationError('Source and destination locations must be different');
  }

  if (quantity <= 0) {
    throw new ValidationError('Transfer quantity must be positive');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, sellPrice: true },
  });
  if (!product) throw new NotFoundError('Product not found');

  const [fromLoc, toLoc] = await Promise.all([
    prisma.location.findUnique({ where: { id: fromLocationId } }),
    prisma.location.findUnique({ where: { id: toLocationId } }),
  ]);
  if (!fromLoc) throw new NotFoundError('Source location not found');
  if (!toLoc) throw new NotFoundError('Destination location not found');

  const sourceInventory = await prisma.inventory.findUnique({
    where: { productId_locationId: { productId, locationId: fromLocationId } },
  });
  const sourceStock = sourceInventory ? Number(sourceInventory.quantity) : 0;
  if (sourceStock < quantity) {
    throw new ValidationError(
      `Insufficient stock at ${fromLoc.name}: available ${sourceStock}, requested ${quantity}`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.inventory.upsert({
      where: { productId_locationId: { productId, locationId: fromLocationId } },
      create: { productId, locationId: fromLocationId, quantity: 0, reorderPoint: 5 },
      update: { quantity: { decrement: quantity } },
    });

    await tx.inventory.upsert({
      where: { productId_locationId: { productId, locationId: toLocationId } },
      create: { productId, locationId: toLocationId, quantity, reorderPoint: 5 },
      update: { quantity: { increment: quantity } },
    });

    await tx.inventoryAdjustment.create({
      data: {
        productId, batchId: batchId ?? null, locationId: fromLocationId,
        quantity: -quantity, reasonCode: 'transfer_out',
        notes: `Transfer to ${toLoc.name}: ${notes || ''}`.trim(), employeeId,
      },
    });

    await tx.inventoryAdjustment.create({
      data: {
        productId, batchId: batchId ?? null, locationId: toLocationId,
        quantity: quantity, reasonCode: 'transfer_in',
        notes: `Transfer from ${fromLoc.name}: ${notes || ''}`.trim(), employeeId,
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: 'inventory', entityId: productId, action: 'transfer',
        changes: {
          productName: product.name, fromLocationId, fromLocationName: fromLoc.name,
          toLocationId, toLocationName: toLoc.name, quantity, notes: notes ?? null,
        },
        performedBy: employeeId, locationId: fromLocationId,
      },
    });

    return { fromLocation: fromLoc.name, toLocation: toLoc.name, quantity };
  });

  const fromStock = Number((await prisma.inventory.findUnique({
    where: { productId_locationId: { productId, locationId: fromLocationId } },
  }))?.quantity ?? 0);
  const toStock = Number((await prisma.inventory.findUnique({
    where: { productId_locationId: { productId, locationId: toLocationId } },
  }))?.quantity ?? 0);

  broadcastInventoryUpdate(fromLocationId, { productId, productName: product.name, newQuantity: fromStock, timestamp: new Date().toISOString() });
  broadcastInventoryUpdate(toLocationId, { productId, productName: product.name, newQuantity: toStock, timestamp: new Date().toISOString() });

  return result;
}
