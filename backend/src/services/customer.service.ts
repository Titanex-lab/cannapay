import { prisma } from '../index';

export interface CreateCustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  locationId: string;
  consentSMS?: boolean;
}

export interface CustomerFilters {
  search?: string;
  locationId?: string;
  limit?: number;
  offset?: number;
}

export async function findOrCreate(input: CreateCustomerInput) {
  // Look up by email first
  if (input.email) {
    const existing = await prisma.customer.findFirst({
      where: { email: input.email, locationId: input.locationId },
    });
    if (existing) return existing;
  }

  // Look up by phone
  if (input.phone) {
    const existing = await prisma.customer.findFirst({
      where: { phone: input.phone, locationId: input.locationId },
    });
    if (existing) return existing;
  }

  // Create new customer
  return prisma.customer.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email || null,
      phone: input.phone || null,
      locationId: input.locationId,
      consentSMS: input.consentSMS ?? false,
    },
  });
}

export async function listCustomers(filters: CustomerFilters) {
  const { search, locationId, limit = 20, offset = 0 } = filters;

  const where: any = {};
  if (locationId) where.locationId = locationId;
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { lastName: 'asc' },
      include: { location: { select: { name: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    data: data.map((c) => ({
      ...c,
      totalSpend: Number(c.totalSpend),
      locationName: c.location.name,
    })),
    total,
  };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { location: { select: { name: true } } },
  });
  if (!customer) return null;
  return {
    ...customer,
    totalSpend: Number(customer.totalSpend),
    locationName: customer.location.name,
  };
}

export async function updateCustomer(id: string, data: Partial<CreateCustomerInput>) {
  return prisma.customer.update({
    where: { id },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.consentSMS !== undefined && { consentSMS: data.consentSMS }),
    },
  });
}

export async function exportCustomersCSV(filters: CustomerFilters): Promise<string> {
  const { data } = await listCustomers({ ...filters, limit: 10000, offset: 0 });
  const header = 'First Name,Last Name,Email,Phone,Location,Visits,Total Spend,Last Visit,Created\n';
  const rows = data.map((c: any) =>
    [
      `"${c.firstName}"`,
      `"${c.lastName}"`,
      `"${c.email || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.locationName}"`,
      c.totalVisits,
      c.totalSpend.toFixed(2),
      c.lastVisitAt ? `"${c.lastVisitAt}"` : '',
      `"${c.createdAt}"`,
    ].join(',')
  ).join('\n');
  return header + rows;
}

export async function incrementVisitStats(customerId: string, spendAmount: number) {
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      totalVisits: { increment: 1 },
      totalSpend: { increment: spendAmount },
      lastVisitAt: new Date(),
    },
  });
}
