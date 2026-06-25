'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────────────────

interface PaymentMethodBreakdown {
  method: string;
  count: number;
  total: number;
}

interface CategoryBreakdown {
  category: string;
  units: number;
  revenue: number;
}

interface BudtenderBreakdown {
  name: string;
  transactions: number;
  revenue: number;
  avgPerTransaction: number;
}

interface DailySalesData {
  totalTransactions: number;
  grossSales: number;
  totalDiscounts: number;
  totalTax: number;
  netSales: number;
  byPaymentMethod: PaymentMethodBreakdown[];
  byCategory: CategoryBreakdown[];
  byBudtender: BudtenderBreakdown[];
}

interface Props {
  date: string;
  locationId: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  flower: 'Flower',
  pre_roll: 'Pre-roll',
  vape: 'Vape',
  concentrate: 'Concentrate',
  edible: 'Edible',
  topical: 'Topical',
  accessory: 'Accessory',
};

const CATEGORY_COLORS: Record<string, string> = {
  flower: 'bg-purple-500/20 text-purple-300',
  pre_roll: 'bg-amber-500/20 text-amber-300',
  vape: 'bg-cyan-500/20 text-cyan-300',
  concentrate: 'bg-orange-500/20 text-orange-300',
  edible: 'bg-pink-500/20 text-pink-300',
  topical: 'bg-teal-500/20 text-teal-300',
  accessory: 'bg-slate-500/20 text-slate-300',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  debit: 'Debit',
};

const PAYMENT_COLORS: Record<string, string> = {
  cash: 'bg-emerald-500',
  card: 'bg-blue-500',
  debit: 'bg-amber-500',
};

function fmtRand(value: number | null | undefined): string {
  if (value == null) return 'R 0.00';
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number, total: number): string {
  if (!total || total === 0) return '0.0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 animate-pulse">
      <div className="h-3 bg-slate-700 rounded w-24 mb-3" />
      <div className="h-6 bg-slate-700 rounded w-32 mb-1" />
    </div>
  );
}

function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex gap-4 animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-700 rounded"
          style={{ width: `${80 + i * 20}px` }}
        />
      ))}
    </div>
  );
}

function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DailySalesSummary({ date, locationId }: Props) {
  const { data, isLoading, isError, error, refetch } = useQuery<DailySalesData>(
    {
      queryKey: ['reports', 'daily-sales', date, locationId],
      queryFn: async () => {
        const params: Record<string, string> = { date };
        if (locationId) params.locationId = locationId;
        const { data } = await api.get('/reports/daily-sales', { params });
        // API returns { summary: {...}, byPaymentMethod: [...], ... } — flatten summary to root
        return {
          ...data.summary,
          byPaymentMethod: data.byPaymentMethod,
          byCategory: data.byCategory,
          byBudtender: data.byBudtender,
        };
      },
      enabled: !!date,
    },
  );

  const netSales = data?.netSales ?? 0;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Skeleton cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>

        {/* Skeleton breakdowns */}
        {['Payment Method', 'Category', 'Budtender'].map((title) => (
          <div
            key={title}
            className="bg-slate-800 rounded-xl border border-slate-700 p-5"
          >
            <div className="h-4 bg-slate-700 rounded w-32 mb-4 animate-pulse" />
            <SkeletonTable rows={4} />
          </div>
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
        <div className="rounded-full bg-red-500/10 w-12 h-12 mx-auto mb-3 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <p className="text-red-400 mb-2">Failed to load daily sales</p>
        <p className="text-sm text-slate-400">
          {(error as Error)?.message || 'Unknown error'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!data || data.totalTransactions === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-slate-400 text-lg mb-1">No sales data for this date</p>
        <p className="text-sm text-slate-500">
          {date} — No transactions were recorded.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">
            Transactions
          </p>
          <p className="text-2xl font-bold">{data.totalTransactions}</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">
            Gross Sales
          </p>
          <p className="text-2xl font-bold text-white">
            {fmtRand(data.grossSales)}
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">
            Discounts
          </p>
          <p className="text-2xl font-bold text-amber-400">
            {fmtRand(data.totalDiscounts)}
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">
            Tax
          </p>
          <p className="text-2xl font-bold text-blue-400">
            {fmtRand(data.totalTax)}
          </p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-emerald-500/30 p-5 ring-1 ring-emerald-500/20">
          <p className="text-xs text-emerald-400 mb-1 uppercase tracking-wide">
            Net Sales
          </p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmtRand(data.netSales)}
          </p>
        </div>
      </div>

      {/* ─── By Payment Method ──────────────────────────────────────────── */}
      {data.byPaymentMethod && data.byPaymentMethod.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-200">
              By Payment Method
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-5 py-3 font-medium text-slate-400 w-32">
                    Method
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Transactions
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Total
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    % of Net
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400 w-full">
                    Distribution
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byPaymentMethod.map((pm) => {
                  const barPct = netSales > 0 ? (pm.total / netSales) * 100 : 0;
                  const barColor =
                    PAYMENT_COLORS[pm.method?.toLowerCase()] || 'bg-slate-500';
                  return (
                    <tr
                      key={pm.method}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-medium capitalize">
                        {PAYMENT_LABELS[pm.method?.toLowerCase()] || pm.method}
                      </td>
                      <td className="px-5 py-3 text-slate-300">{pm.count}</td>
                      <td className="px-5 py-3 font-mono">{fmtRand(pm.total)}</td>
                      <td className="px-5 py-3 text-slate-400">
                        {pct(pm.total, netSales)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${barColor} transition-all`}
                            style={{ width: `${Math.min(barPct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── By Category ────────────────────────────────────────────────── */}
      {data.byCategory && data.byCategory.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-200">
              By Category
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-5 py-3 font-medium text-slate-400">Category</th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Units Sold
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">Revenue</th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    % of Net
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map((cat) => {
                  const label = CATEGORY_LABELS[cat.category] || cat.category;
                  const colors =
                    CATEGORY_COLORS[cat.category] || 'bg-slate-500/20 text-slate-300';
                  return (
                    <tr
                      key={cat.category}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors}`}
                        >
                          {label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-300">{cat.units}</td>
                      <td className="px-5 py-3 font-mono">
                        {fmtRand(cat.revenue)}
                      </td>
                      <td className="px-5 py-3 text-slate-400">
                        {pct(cat.revenue, netSales)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── By Budtender ───────────────────────────────────────────────── */}
      {data.byBudtender && data.byBudtender.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-200">
              By Budtender
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Budtender
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Transactions
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Revenue
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-400">
                    Avg / Transaction
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byBudtender.map((bt, i) => (
                  <tr
                    key={bt.name || i}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium">{bt.name}</td>
                    <td className="px-5 py-3 text-slate-300">
                      {bt.transactions}
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {fmtRand(bt.revenue)}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-300">
                      {fmtRand(bt.transactions > 0 ? bt.revenue / bt.transactions : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
