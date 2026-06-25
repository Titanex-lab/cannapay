'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────────────────

interface DrawerSession {
  id: string;
  budtenderName: string;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  status: 'open' | 'closed';
}

interface DrawerSummary {
  totalOpenings: number;
  totalExpected: number;
  totalActual: number;
  netDifference: number;
}

interface DrawerData {
  drawers: DrawerSession[];
  summary: DrawerSummary;
}

interface Props {
  date: string;
  locationId: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtRand(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getDifferenceColor(diff: number): string {
  if (diff === 0) return 'text-emerald-400';
  // shortage: expected > actual → diff < 0 if diff = actual - expected
  if (diff < 0) return 'text-red-400';
  // overage: actual > expected → diff > 0
  return 'text-amber-400';
}

function getDifferenceLabel(diff: number): string {
  if (diff === 0) return 'Balanced';
  if (diff < 0) return 'Shortage';
  return 'Overage';
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 bg-slate-700 rounded w-28" />
          <div className="h-4 bg-slate-700 rounded w-16" />
          <div className="h-4 bg-slate-700 rounded w-16" />
          <div className="h-4 bg-slate-700 rounded w-24" />
          <div className="h-4 bg-slate-700 rounded w-24" />
          <div className="h-4 bg-slate-700 rounded w-20" />
          <div className="h-4 bg-slate-700 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function CashDrawerReconciliation({ date, locationId }: Props) {
  const { data, isLoading, isError, error, refetch } = useQuery<DrawerData>({
    queryKey: ['reports', 'drawer-reconciliation', date, locationId],
    queryFn: async () => {
      const params: Record<string, string> = { date };
      if (locationId) params.locationId = locationId;
      const { data } = await api.get('/reports/drawer-reconciliation', {
        params,
      });
      return data;
    },
    enabled: !!date,
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="h-4 bg-slate-700 rounded w-40 mb-4 animate-pulse" />
        <SkeletonTable />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

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
        <p className="text-red-400 mb-2">Failed to load drawer data</p>
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

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (!data || !data.drawers || data.drawers.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-slate-400 text-lg mb-1">
          No drawer sessions for this date
        </p>
        <p className="text-sm text-slate-500">
          {date} — No cash drawer sessions recorded.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-200">
            Drawer Sessions — {date}
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
                  Opened
                </th>
                <th className="px-5 py-3 font-medium text-slate-400">
                  Closed
                </th>
                <th className="px-5 py-3 font-medium text-slate-400 text-right">
                  Opening
                </th>
                <th className="px-5 py-3 font-medium text-slate-400 text-right">
                  Expected
                </th>
                <th className="px-5 py-3 font-medium text-slate-400 text-right">
                  Actual
                </th>
                <th className="px-5 py-3 font-medium text-slate-400 text-right">
                  Difference
                </th>
                <th className="px-5 py-3 font-medium text-slate-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {data.drawers.map((drawer) => (
                <tr
                  key={drawer.id}
                  className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-5 py-3 font-medium">
                    {drawer.budtenderName}
                  </td>
                  <td className="px-5 py-3 text-slate-300">
                    {fmtTime(drawer.openedAt)}
                  </td>
                  <td className="px-5 py-3 text-slate-300">
                    {fmtTime(drawer.closedAt)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    {fmtRand(drawer.openingAmount)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-blue-400">
                    {fmtRand(drawer.expectedAmount)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    {fmtRand(drawer.actualAmount)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-mono font-medium ${getDifferenceColor(drawer.difference)}`}
                  >
                    {drawer.difference > 0 ? '+' : ''}
                    {fmtRand(drawer.difference)}
                    <span className="block text-xs opacity-70">
                      {getDifferenceLabel(drawer.difference)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        drawer.status === 'open'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-500/20 text-slate-400'
                      }`}
                    >
                      {drawer.status === 'open' ? 'Open' : 'Closed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Summary footer */}
            {data.summary && (
              <tfoot>
                <tr className="border-t-2 border-slate-600 bg-slate-800/50">
                  <td className="px-5 py-3 font-medium text-slate-300">
                    Summary
                  </td>
                  <td className="px-5 py-3 text-slate-400">
                    {data.summary.totalOpenings} session
                    {data.summary.totalOpenings !== 1 ? 's' : ''}
                  </td>
                  <td colSpan={2} />
                  <td className="px-5 py-3 text-right font-mono font-medium text-blue-400">
                    {fmtRand(data.summary.totalExpected)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-medium text-white">
                    {fmtRand(data.summary.totalActual)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-mono font-medium ${getDifferenceColor(data.summary.netDifference)}`}
                  >
                    {data.summary.netDifference > 0 ? '+' : ''}
                    {fmtRand(data.summary.netDifference)}
                    <span className="block text-xs opacity-70">
                      {getDifferenceLabel(data.summary.netDifference)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
