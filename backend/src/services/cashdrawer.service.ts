import { prisma } from '../index';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { Prisma } from '@prisma/client';

// ── Types ────────────────────────────────────────────────────────────

export interface DrawerHistoryFilters {
  from?: string;
  to?: string;
  userId?: string;
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

function serializeSession(record: Record<string, unknown>) {
  return {
    ...record,
    openingAmount: serializeDecimal(
      record.openingAmount as Prisma.Decimal | number,
    ),
    closingAmount:
      record.closingAmount != null
        ? serializeDecimal(record.closingAmount as Prisma.Decimal | number)
        : null,
    expectedAmount:
      record.expectedAmount != null
        ? serializeDecimal(record.expectedAmount as Prisma.Decimal | number)
        : null,
    difference:
      record.difference != null
        ? serializeDecimal(record.difference as Prisma.Decimal | number)
        : null,
  };
}

// ── Open drawer ──────────────────────────────────────────────────────

export async function openDrawer(
  userId: string,
  locationId: string,
  openingAmount: number,
) {
  // Check for existing open drawer at this location
  const existing = await prisma.cashDrawerSession.findFirst({
    where: {
      locationId,
      status: 'open',
    },
  });

  if (existing) {
    throw new ConflictError(
      'An open cash drawer session already exists for this location',
    );
  }

  // Create the session
  const session = await prisma.cashDrawerSession.create({
    data: {
      locationId,
      userId,
      openingAmount,
      status: 'open',
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  return serializeSession(session as unknown as Record<string, unknown>);
}

// ── Close drawer (with reconciliation) ───────────────────────────────

export async function closeDrawer(sessionId: string, closingAmount: number) {
  // 1. Fetch session — must exist and be 'open'
  const session = await prisma.cashDrawerSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundError('Cash drawer session not found');
  }

  if (session.status !== 'open') {
    throw new ValidationError(
      `Cannot close drawer — status is already "${session.status}"`,
    );
  }

  const openAmount = serializeDecimal(session.openingAmount);
  const closedAt = new Date();

  // 2. Compute expectedAmount via raw SQL aggregation
  //    expected = openingAmount
  //               + cash received from completed sales after openedAt
  //               - cash refunded (refunded / partial_refund) after openedAt
  const rows = await prisma.$queryRaw<Array<{ cash_received: string; cash_refunded: string }>>`
    SELECT
      COALESCE(SUM(
        CASE WHEN t.status = 'completed' THEN p.amount ELSE 0 END
      ), '0') AS cash_received,
      COALESCE(SUM(
        CASE WHEN t.status IN ('refunded', 'partial_refund') THEN p.amount ELSE 0 END
      ), '0') AS cash_refunded
    FROM payments p
    JOIN transactions t ON p.transaction_id = t.id
    WHERE t.location_id = ${session.locationId}::uuid
      AND p.payment_method = 'cash'::public."PaymentMethod"
      AND t.created_at > ${session.openedAt}::timestamptz
      AND t.created_at <= ${closedAt}::timestamptz
  `;

  const cashReceived = Number(rows[0]?.cash_received ?? '0');
  const cashRefunded = Number(rows[0]?.cash_refunded ?? '0');
  const expectedAmount =
    Math.round((openAmount + cashReceived - cashRefunded) * 100) / 100;

  // 3. Compute difference: positive = shortage (expected > actual),
  //    negative = overage (actual > expected)
  const difference =
    Math.round((expectedAmount - closingAmount) * 100) / 100;

  // 4. Update session
  const updated = await prisma.cashDrawerSession.update({
    where: { id: sessionId },
    data: {
      closingAmount,
      expectedAmount,
      difference,
      closedAt,
      status: 'closed',
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  });

  return serializeSession(updated as unknown as Record<string, unknown>);
}

// ── Get active drawer ────────────────────────────────────────────────

export async function getActiveDrawer(locationId: string) {
  const session = await prisma.cashDrawerSession.findFirst({
    where: {
      locationId,
      status: 'open',
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
    orderBy: {
      openedAt: 'desc',
    },
  });

  if (!session) return null;

  return serializeSession(session as unknown as Record<string, unknown>);
}

// ── Drawer history ───────────────────────────────────────────────────

export async function getDrawerHistory(
  locationId: string,
  filters?: DrawerHistoryFilters,
) {
  const { from, to, userId, limit = 50, offset = 0 } = filters ?? {};

  const where: Prisma.CashDrawerSessionWhereInput = {
    locationId,
  };

  if (from || to) {
    where.openedAt = {};
    if (from) where.openedAt.gte = new Date(from);
    if (to) where.openedAt.lte = new Date(to);
  }

  if (userId) {
    where.userId = userId;
  }

  const [data, total] = await Promise.all([
    prisma.cashDrawerSession.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        openedAt: 'desc',
      },
      take: limit,
      skip: offset,
    }),
    prisma.cashDrawerSession.count({ where }),
  ]);

  return {
    data: data.map((s) =>
      serializeSession(s as unknown as Record<string, unknown>),
    ),
    total,
  };
}
