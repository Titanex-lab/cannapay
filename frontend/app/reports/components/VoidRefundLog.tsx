'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// ── Types ───────────────────────────────────────────────────────────────────

interface VoidRefundItem {
  transactionId: string;
  date: string;
  budtender: string;
  amount: number;
  status: 'voided' | 'refunded' | 'partial_refund';
  reason: string;
  approvedBy: string | null;
}

interface VoidRefundResponse {
  items: VoidRefundItem[];
  total: number;
  limit: number;
  offset: number;
}

interface Props {
  from: string;
  to: string;
  locationId: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_STYLES: Record<string, string> = {
  voided: 'bg-red-500/20 text-red-300 border-red-500/30',
  refunded: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  partial_refund: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  voided: 'Voided',
  refunded: 'Refunded',
  partial_refund: 'Partial Refund',
};

const REASON_CODES = [
  { value: '', label: 'All Reasons' },
  { value: 'customer_request', label: 'Customer Request' },
  { value: 'pricing_error', label: 'Pricing Error' },
  { value: 'product_damaged', label: 'Product Damaged' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'other', label: 'Other' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtRand(value: number): string {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-4 bg-slate-700 rounded w-20" />
          <div className="h-4 bg-slate-700 rounded w-32" />
          <div className="h-4 bg-slate-700 rounded w-24" />
          <div className="h-4 bg-slate-700 rounded w-16" />
          <div className="h-4 bg-slate-700 rounded w-20" />
          <div className="h-4 bg-slate-700 rounded flex-1" />
          <div className="h-4 bg-slate-700 rounded w-24" />
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function VoidRefundLog({ from, to, locationId }: Props) {
  const [offset, setOffset] = useState(0);
  const [reasonCode, setReasonCode] = useState('');

  const { data, isLoading, isError, error, refetch } =
    useQuery<VoidRefundResponse>({
      queryKey: [
        'reports',
        'voids-refunds',
        from,
        to,
        locationId,
        reasonCode,
        offset,
      ],
      queryFn: async () => {
        const params: Record<string, string> = {
          from,
          to,
          limit: String(PAGE_SIZE),
          offset: String(offset),
        };
        if (locationId) params.locationId = locationId;
        if (reasonCode) params.reasonCode = reasonCode;
        const { data } = await api.get('/reports/voids-refunds', { params });
        return data;
      },
      enabled: !!from && !!to,
    });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Reason:</label>
          <select
            value={reasonCode}
            onChange={(e) => {
              setReasonCode(e.target.value);
              setOffset(0);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {REASON_CODES.map((rc) => (
              <option key={rc.value} value={rc.value}>
                {rc.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {/* Loading */}
        {isLoading && (
          <div className="p-5">
            <div className="h-4 bg-slate-700 rounded w-48 mb-4 animate-pulse" />
            <SkeletonTable />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="p-12 text-center">
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
            <p className="text-red-400 mb-2">Failed to load void/refund log</p>
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
        )}

        {/* Empty */}
        {!isLoading && !isError && (!data || data.items.length === 0) && (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-400 text-lg mb-1">
              No voids or refunds found
            </p>
            <p className="text-sm text-slate-500">
              {from} → {to} — No matching transactions.
            </p>
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && data && data.items.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left">
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Transaction #
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Date / Time
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Budtender
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400 text-right">
                      Amount
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Status
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Reason
                    </th>
                    <th className="px-5 py-3 font-medium text-slate-400">
                      Approved By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr
                      key={item.transactionId}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-300">
                        {item.transactionId}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {fmtDateTime(item.date)}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {item.budtender}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {fmtRand(item.amount)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                            STATUS_STYLES[item.status] ||
                            'bg-slate-500/20 text-slate-300 border-slate-500/30'
                          }`}
                        >
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-sm max-w-xs truncate">
                        {item.reason || '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {item.approvedBy || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of{' '}
                {total} results
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-400">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  onClick={() =>
                    setOffset(offset + PAGE_SIZE)
                  }
                  disabled={offset + PAGE_SIZE >= total}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
