import { prisma } from '../index';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { calculateLineTax } from '../utils/tax';
import { writeAuditLog } from '../middleware/auditLogger';
import { Prisma } from '@prisma/client';
import { broadcastInventoryUpdates } from '../socket/inventorySync';

// ── Types ────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface CreateTransactionInput {
  locationId: string;
  budtenderId: string;
  items: CartItem[];
  discountTotal?: number;
  notes?: string;
  idVerified?: boolean;
  idVerifiedBy?: string;
  customerId?: string;
  paymentMethod: 'cash' | 'card' | 'other';
  cashTendered?: number;
  cardLastFour?: string;
}

export interface TransactionFilters {
  locationId: string;
  date?: string;
  budtenderId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// ── Decimal helpers ──────────────────────────────────────────────────

function serializeDecimal(
  value: Prisma.Decimal | number | null | undefined,
): number {
  if (value instanceof Prisma.Decimal) return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function serializeTransaction(record: Record<string, unknown>) {
  return {
    ...record,
    subtotal: serializeDecimal(record.subtotal as Prisma.Decimal | number),
    discountTotal: serializeDecimal(
      record.discountTotal as Prisma.Decimal | number,
    ),
    taxTotal: serializeDecimal(record.taxTotal as Prisma.Decimal | number),
    grandTotal: serializeDecimal(record.grandTotal as Prisma.Decimal | number),
    items: Array.isArray(record.items)
      ? (record.items as Array<Record<string, unknown>>).map(
          serializeTransactionItem,
        )
      : record.items,
    payments: Array.isArray(record.payments)
      ? (record.payments as Array<Record<string, unknown>>).map(
          serializePayment,
        )
      : record.payments,
  };
}

function serializeTransactionItem(item: Record<string, unknown>) {
  return {
    ...item,
    quantity: serializeDecimal(item.quantity as Prisma.Decimal | number),
    unitPrice: serializeDecimal(item.unitPrice as Prisma.Decimal | number),
    discountAmount: serializeDecimal(
      item.discountAmount as Prisma.Decimal | number,
    ),
    taxAmount: serializeDecimal(item.taxAmount as Prisma.Decimal | number),
    taxRate: serializeDecimal(item.taxRate as Prisma.Decimal | number),
    total: serializeDecimal(item.total as Prisma.Decimal | number),
  };
}

function serializePayment(payment: Record<string, unknown>) {
  return {
    ...payment,
    amount: serializeDecimal(payment.amount as Prisma.Decimal | number),
    cashTendered:
      payment.cashTendered != null
        ? serializeDecimal(payment.cashTendered as Prisma.Decimal | number)
        : null,
    changeDue:
      payment.changeDue != null
        ? serializeDecimal(payment.changeDue as Prisma.Decimal | number)
        : null,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getNextTransactionNumber(
  locationId: string,
): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const count = await prisma.transaction.count({
    where: {
      locationId,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  });

  return count + 1;
}

// ── CREATE TRANSACTION (sale) ────────────────────────────────────────

export async function createTransaction(
  data: CreateTransactionInput,
) {
  const {
    locationId,
    budtenderId,
    items,
    discountTotal: inputDiscountTotal = 0,
    notes,
    idVerified = false,
    idVerifiedBy,
    customerId,
    paymentMethod,
    cashTendered,
    cardLastFour,
  } = data;

  // 1. Validate cart not empty
  if (!items || items.length === 0) {
    throw new ValidationError('Cart must contain at least one item');
  }

  // 2. Get next transaction number
  const transactionNum = await getNextTransactionNumber(locationId);

  // 3. Resolve each cart item against the database
  const lineItems: Array<{
    productId: string;
    batchId: string | null;
    taxCategory: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    lineSubtotal: number; // qty * unitPrice
    lineTotal: number; // lineSubtotal - discount
    taxAmount: number;
    taxRate: number;
    finalTotal: number; // lineTotal + taxAmount
  }> = [];

  let cartSubtotal = 0;
  let cartDiscountTotal = 0;

  for (const item of items) {
    // a. Fetch product with batch info
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        category: true,
        taxCategory: true,
        batchId: true,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundError(`Product ${item.productId} not found`);
    }

    if (!product.isActive) {
      throw new ValidationError(
        `Product "${product.name}" is no longer active`,
      );
    }

    // batch is preferred for traceability but not required
    if (!product.batchId) {
      console.warn(
        `[txn] Product "${product.name}" has no batch assigned — traceability gap`,
      );
    }

    // b. Check inventory
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_locationId: {
          productId: item.productId,
          locationId,
        },
      },
    });

    const currentStock = inventory ? serializeDecimal(inventory.quantity) : 0;

    if (currentStock < item.quantity) {
      throw new ValidationError(
        `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${currentStock}`,
      );
    }

    // c. Calculate line amounts (rounded to 2 decimal places)
    const discountAmount = item.discountAmount ?? 0;
    const lineSubtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    const lineTotal = Math.round((lineSubtotal - discountAmount) * 100) / 100;

    if (lineTotal < 0) {
      throw new ValidationError(
        `Line total for "${product.name}" cannot be negative after discount`,
      );
    }

    // d. Calculate tax on the post-discount line total
    const { taxAmount, taxRate } = calculateLineTax(
      lineTotal,
      product.taxCategory,
    );

    const finalTotal = Math.round((lineTotal + taxAmount) * 100) / 100;

    lineItems.push({
      productId: item.productId,
      batchId: product.batchId,
      taxCategory: product.taxCategory,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount,
      lineSubtotal,
      lineTotal,
      taxAmount,
      taxRate,
      finalTotal,
    });

    cartSubtotal += lineSubtotal;
    cartDiscountTotal += discountAmount;
  }

  // 4. Compute cart-level totals
  cartSubtotal = Math.round(cartSubtotal * 100) / 100;
  cartDiscountTotal = Math.round(cartDiscountTotal * 100) / 100;
  // Additional cart-level discount (from inputDiscountTotal) — applied after line discounts
  const effectiveDiscountTotal =
    Math.round((cartDiscountTotal + inputDiscountTotal) * 100) / 100;
  const postDiscountSubtotal =
    Math.round((cartSubtotal - effectiveDiscountTotal) * 100) / 100;

  // Recalculate tax across all items proportionally after cart-level discount
  // (spread the cart-level discount proportionally across all taxable items)
  const taxLines = lineItems.map((li) => {
    // Proportion of this line in the cart subtotal
    const proportion = cartSubtotal > 0 ? li.lineSubtotal / cartSubtotal : 0;
    // This line's share of the cart-level discount
    const cartDiscountShare =
      Math.round(inputDiscountTotal * proportion * 100) / 100;
    // Adjusted line total after share of cart discount
    const adjustedLineTotal =
      Math.round((li.lineTotal - cartDiscountShare) * 100) / 100;
    const { taxAmount, taxRate } = calculateLineTax(
      adjustedLineTotal > 0 ? adjustedLineTotal : 0,
      li.taxCategory,
    );
    const finalTotal = Math.round((adjustedLineTotal + taxAmount) * 100) / 100;
    return { ...li, taxAmount, taxRate, finalTotal, adjustedLineTotal };
  });

  const taxTotal =
    Math.round(taxLines.reduce((sum, li) => sum + li.taxAmount, 0) * 100) /
    100;
  const grandTotal =
    Math.round((postDiscountSubtotal + taxTotal) * 100) / 100;

  // 5. Payment validation
  if (paymentMethod === 'cash') {
    if (cashTendered == null) {
      throw new ValidationError(
        'cashTendered is required for cash payments',
      );
    }
    if (cashTendered < grandTotal) {
      throw new ValidationError(
        `Cash tendered (${cashTendered}) is less than grand total (${grandTotal})`,
      );
    }
  }

  if (paymentMethod === 'card' && cardLastFour && cardLastFour.length !== 4) {
    throw new ValidationError('cardLastFour must be exactly 4 digits');
  }

  const changeDue =
    paymentMethod === 'cash' && cashTendered != null
      ? Math.round((cashTendered - grandTotal) * 100) / 100
      : null;

  // 6. Atomic write: transaction + items + payment + inventory + audit
  const result = await prisma.$transaction(async (tx) => {
    // a. Create transaction
    const transaction = await tx.transaction.create({
      data: {
        transactionNum,
        locationId,
        budtenderId,
        subtotal: cartSubtotal,
        discountTotal: effectiveDiscountTotal,
        taxTotal,
        grandTotal,
        status: 'completed',
        notes: notes ?? null,
        idVerified,
        idVerifiedBy: idVerifiedBy ?? null,
        customerId: customerId ?? null,
      },
    });

    // b. Create transaction items
    await tx.transactionItem.createMany({
      data: taxLines.map((li) => ({
        transactionId: transaction.id,
        productId: li.productId,
        batchId: li.batchId,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        discountAmount: li.discountAmount,
        taxAmount: li.taxAmount,
        taxRate: li.taxRate,
        total: li.finalTotal,
      })),
    });

    // c. Create payment
    await tx.payment.create({
      data: {
        transactionId: transaction.id,
        paymentMethod: paymentMethod as any,
        amount: grandTotal,
        cashTendered: cashTendered ?? null,
        changeDue,
        cardLastFour: cardLastFour ?? null,
      },
    });

    // d. Decrement inventory for each line item
    for (const li of taxLines) {
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: li.productId,
            locationId,
          },
        },
        data: {
          quantity: { decrement: li.quantity },
        },
      });
    }

    // e. Write audit log
    await tx.auditLog.create({
      data: {
        entityType: 'transaction',
        entityId: transaction.id,
        action: 'create',
        changes: {
          transactionNum,
          subtotal: cartSubtotal,
          discountTotal: effectiveDiscountTotal,
          taxTotal,
          grandTotal,
          paymentMethod,
          cashTendered: cashTendered ?? null,
          changeDue,
          cardLastFour: cardLastFour ?? null,
          items: taxLines.map((li) => ({
            productId: li.productId,
            batchId: li.batchId,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            discountAmount: li.discountAmount,
            taxAmount: li.taxAmount,
            taxRate: li.taxRate,
            total: li.finalTotal,
          })),
        },
        performedBy: budtenderId,
        locationId,
      },
    });

    return transaction;
  });

  // 7a. Update customer visit stats (non-blocking)
  if (customerId) {
    import('./customer.service').then(({ incrementVisitStats }) => {
      incrementVisitStats(customerId, grandTotal).catch((e: Error) =>
        console.error('[txn] Failed to update customer stats:', e.message),
      );
    });
  }

  // 7b. Fetch full transaction with relations
  const fullTransaction = await prisma.transaction.findUnique({
    where: { id: result.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              category: true,
              unitType: true,
            },
          },
          batch: {
            select: {
              id: true,
              lotNumber: true,
            },
          },
        },
      },
      payments: true,
      budtender: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  // 8. Broadcast inventory updates to all clients in the location
  const productIds = data.items.map((item) => item.productId);
  const updatedInventories = await prisma.inventory.findMany({
    where: {
      locationId: data.locationId,
      productId: { in: productIds },
    },
    include: {
      product: {
        select: { id: true, name: true },
      },
    },
  });

  const updates = updatedInventories.map((inv) => ({
    productId: inv.productId,
    productName: inv.product.name,
    newQuantity: serializeDecimal(inv.quantity),
  }));
  broadcastInventoryUpdates(data.locationId, updates);

  // 9. Send email receipt (non-blocking)
  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, firstName: true, lastName: true },
    });
    if (customer?.email) {
      const txn = fullTransaction as any;
      const loc = await prisma.location.findUnique({
        where: { id: data.locationId },
        select: { name: true },
      });
      const receiptData = {
        transactionId: txn.id,
        customerName: `${customer.firstName} ${customer.lastName}`,
        items: (txn.items || []).map((ti: any) => ({
          name: ti.product?.name || 'Product',
          quantity: Number(ti.quantity),
          unitPrice: Number(ti.unitPrice),
          lineTotal: Number(ti.total),
        })),
        subtotal: serializeDecimal(txn.subtotal),
        discount: serializeDecimal(txn.discountTotal),
        tax: serializeDecimal(txn.taxTotal),
        total: serializeDecimal(txn.grandTotal),
        paymentMethod: data.paymentMethod,
        budtenderName: txn.budtender?.fullName || 'Staff',
        locationName: loc?.name || 'CannaPay',
        date: new Date().toLocaleDateString('en-ZA'),
      };
      import('./email.service').then(({ sendReceiptEmail }) => {
        sendReceiptEmail(customer.email!, receiptData).catch((e: Error) =>
          console.error('[txn] Email receipt failed:', e.message),
        );
      }).catch((e: Error) =>
        console.error('[txn] Email module load failed:', e.message),
      );
    }
  }

  return serializeTransaction(fullTransaction as unknown as Record<string, unknown>);
}

// ── VOID TRANSACTION ─────────────────────────────────────────────────

export async function voidTransaction(
  transactionId: string,
  voidedBy: string,
  reason: string,
  approvedBy?: string,
) {
  // 1. Fetch transaction — must exist and be 'completed'
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  if (transaction.status !== 'completed') {
    throw new ValidationError(
      `Cannot void a transaction with status "${transaction.status}"`,
    );
  }

  // 2. Check permission — self-void allowed within 5 minutes
  const isSelfVoid =
    transaction.budtenderId === voidedBy &&
    Date.now() - new Date(transaction.createdAt).getTime() < 5 * 60 * 1000;

  if (!isSelfVoid && !approvedBy) {
    throw new ForbiddenError(
      'Manager approval required to void this transaction',
    );
  }

  // 3. Atomic: update status, return stock, write audit
  await prisma.$transaction(async (tx) => {
    // a. Update transaction status
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'voided',
        voidReason: reason,
        voidApprovedBy: approvedBy ?? null,
      },
    });

    // b. Return stock to inventory (reversal)
    for (const item of transaction.items) {
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: transaction.locationId,
          },
        },
        data: {
          quantity: { increment: serializeDecimal(item.quantity) },
        },
      });
    }

    // c. Write audit log
    await tx.auditLog.create({
      data: {
        entityType: 'transaction',
        entityId: transactionId,
        action: 'void',
        changes: {
          voidReason: reason,
          approvedBy: approvedBy ?? null,
          selfVoid: isSelfVoid,
          previousStatus: 'completed',
          returnedItems: transaction.items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            quantity: serializeDecimal(item.quantity),
          })),
        },
        performedBy: voidedBy,
        locationId: transaction.locationId,
      },
    });
  });

  // 4. Return updated transaction
  const updated = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              category: true,
            },
          },
          batch: {
            select: {
              id: true,
              lotNumber: true,
            },
          },
        },
      },
      payments: true,
      budtender: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  return serializeTransaction(updated as unknown as Record<string, unknown>);
}

// ── REFUND TRANSACTION ───────────────────────────────────────────────

export async function refundTransaction(
  transactionId: string,
  refundedBy: string,
  reason: string,
  approvedBy: string,
  itemIds?: string[],
) {
  // 1. Manager approval is always required
  if (!approvedBy) {
    throw new ForbiddenError('Manager approval is required for refunds');
  }

  // 2. Fetch transaction with items
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true },
          },
        },
      },
      payments: true,
    },
  });

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  if (transaction.status !== 'completed' && transaction.status !== 'partial_refund') {
    throw new ValidationError(
      `Cannot refund a transaction with status "${transaction.status}"`,
    );
  }

  // 3. Determine full vs partial refund
  const isPartial = itemIds && itemIds.length > 0;
  let refundItems = transaction.items;

  if (isPartial) {
    // Filter to only the specified items
    refundItems = transaction.items.filter((item) =>
      itemIds!.includes(item.id),
    );

    if (refundItems.length === 0) {
      throw new ValidationError(
        'None of the specified item IDs were found on this transaction',
      );
    }

    // Check if all specified items are from this transaction
    const foundIds = new Set(refundItems.map((i) => i.id));
    const missingIds = itemIds!.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new ValidationError(
        `Item(s) not found on this transaction: ${missingIds.join(', ')}`,
      );
    }

    // Check if any of the requested items were already refunded
    const alreadyRefunded = refundItems.filter(
      (item) => serializeDecimal(item.quantity) <= 0,
    );
    if (alreadyRefunded.length > 0) {
      throw new ValidationError(
        `Some items have already been fully refunded`,
      );
    }
  }

  // Determine new status
  const remainingItems = transaction.items.filter(
    (item) => !refundItems.some((ri) => ri.id === item.id),
  );
  const allItemsRefunded =
    !isPartial || remainingItems.length === 0;
  const newStatus: 'refunded' | 'partial_refund' = allItemsRefunded
    ? 'refunded'
    : 'partial_refund';

  // 4. Calculate refund amount
  const refundSubtotal = refundItems.reduce(
    (sum, item) =>
      sum +
      serializeDecimal(item.quantity) * serializeDecimal(item.unitPrice),
    0,
  );
  const refundDiscount = refundItems.reduce(
    (sum, item) => sum + serializeDecimal(item.discountAmount),
    0,
  );
  const refundTax = refundItems.reduce(
    (sum, item) => sum + serializeDecimal(item.taxAmount),
    0,
  );
  const refundTotal =
    Math.round((refundSubtotal - refundDiscount + refundTax) * 100) / 100;

  // 5. Atomic: update status, return stock, write audit
  await prisma.$transaction(async (tx) => {
    // a. Update transaction status
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: newStatus,
        voidReason: reason, // reuse voidReason for refund reason
        voidApprovedBy: approvedBy,
      },
    });

    // b. Return stock for refunded items
    for (const item of refundItems) {
      await tx.inventory.update({
        where: {
          productId_locationId: {
            productId: item.productId,
            locationId: transaction.locationId,
          },
        },
        data: {
          quantity: { increment: serializeDecimal(item.quantity) },
        },
      });
    }

    // c. Write audit log
    await tx.auditLog.create({
      data: {
        entityType: 'transaction',
        entityId: transactionId,
        action: 'refund',
        changes: {
          refundType: isPartial ? 'partial' : 'full',
          reason,
          approvedBy,
          refundAmount: refundTotal,
          refundSubtotal: Math.round(refundSubtotal * 100) / 100,
          refundDiscount: Math.round(refundDiscount * 100) / 100,
          refundTax: Math.round(refundTax * 100) / 100,
          previousStatus: transaction.status,
          newStatus,
          refundedItems: refundItems.map((item) => ({
            itemId: item.id,
            productId: item.productId,
            productName: item.product.name,
            quantity: serializeDecimal(item.quantity),
            unitPrice: serializeDecimal(item.unitPrice),
          })),
        },
        performedBy: refundedBy,
        locationId: transaction.locationId,
      },
    });
  });

  // 6. Return updated transaction
  const updated = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              category: true,
            },
          },
          batch: {
            select: {
              id: true,
              lotNumber: true,
            },
          },
        },
      },
      payments: true,
      budtender: {
        select: {
          id: true,
          fullName: true,
        },
      },
      voidApprover: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  return {
    ...serializeTransaction(updated as unknown as Record<string, unknown>),
    refundSummary: {
      refundTotal: Math.round(refundTotal * 100) / 100,
      partial: isPartial,
      itemCount: refundItems.length,
    },
  };
}

// ── GET TRANSACTION BY ID ────────────────────────────────────────────

export async function getTransaction(id: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              category: true,
              unitType: true,
            },
          },
          batch: {
            select: {
              id: true,
              lotNumber: true,
            },
          },
        },
      },
      payments: true,
      budtender: {
        select: {
          id: true,
          fullName: true,
        },
      },
      voidApprover: {
        select: {
          id: true,
          fullName: true,
        },
      },
      idVerifier: {
        select: {
          id: true,
          fullName: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  return serializeTransaction(transaction as unknown as Record<string, unknown>);
}

// ── LIST TRANSACTIONS ────────────────────────────────────────────────

export async function listTransactions(filters: TransactionFilters) {
  const {
    locationId,
    date,
    budtenderId,
    status,
    limit = 20,
    offset = 0,
  } = filters;

  const where: Record<string, unknown> = { locationId };

  if (budtenderId) {
    where.budtenderId = budtenderId;
  }

  if (status) {
    where.status = status;
  }

  if (date) {
    const dateStart = new Date(date);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    if (isNaN(dateStart.getTime())) {
      throw new ValidationError('Invalid date format');
    }

    where.createdAt = {
      gte: dateStart,
      lte: dateEnd,
    };
  }

  const [data, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        budtender: {
          select: {
            id: true,
            fullName: true,
          },
        },
        payments: {
          select: {
            id: true,
            paymentMethod: true,
            amount: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const serialized = data.map((tx) => ({
    id: tx.id,
    transactionNum: tx.transactionNum,
    locationId: tx.locationId,
    subtotal: serializeDecimal(tx.subtotal),
    discountTotal: serializeDecimal(tx.discountTotal),
    taxTotal: serializeDecimal(tx.taxTotal),
    grandTotal: serializeDecimal(tx.grandTotal),
    status: tx.status,
    paymentMethod: tx.payments[0]?.paymentMethod ?? null,
    itemCount: tx._count.items,
    budtenderName: tx.budtender.fullName,
    createdAt: tx.createdAt,
  }));

  return {
    data: serialized,
    total,
    summary: {
      totalSales: serialized
        .filter((tx) => tx.status === 'completed')
        .reduce((sum, tx) => sum + tx.grandTotal, 0),
      totalVoids: serialized
        .filter((tx) => tx.status === 'voided')
        .reduce((sum, tx) => sum + tx.grandTotal, 0),
      totalRefunds: serialized
        .filter((tx) => tx.status === 'refunded' || tx.status === 'partial_refund')
        .reduce((sum, tx) => sum + tx.grandTotal, 0),
    },
  };
}
