'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Adjustment {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  reasonCode: string;
  notes: string | null;
  employeeName: string;
  approvedByName: string | null;
  createdAt: string;
}

const REASON_COLORS: Record<string, string> = {
  damaged: 'bg-red-500/20 text-red-300',
  gifted: 'bg-purple-500/20 text-purple-300',
  internal_use: 'bg-blue-500/20 text-blue-300',
  theft: 'bg-orange-500/20 text-orange-300',
  expired: 'bg-amber-500/20 text-amber-300',
  correction: 'bg-slate-500/20 text-slate-300',
};

const REASON_LABELS: Record<string, string> = {
  damaged: 'Damaged',
  gifted: 'Gifted',
  internal_use: 'Internal Use',
  theft: 'Theft',
  expired: 'Expired',
  correction: 'Correction',
};

const REASON_CODES = [
  { value: '', label: 'All Reasons' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'gifted', label: 'Gifted' },
  { value: 'internal_use', label: 'Internal Use' },
  { value: 'theft', label: 'Theft' },
  { value: 'expired', label: 'Expired' },
  { value: 'correction', label: 'Correction' },
];

export function AdjustmentHistory() {
  const queryClient = useQueryClient();
  const [reasonFilter, setReasonFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: adjustments, isLoading, isError, error } = useQuery<Adjustment[]>({
    queryKey: ['adjustments', reasonFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (reasonFilter) params.reasonCode = reasonFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await api.get('/inventory/adjustments', { params });
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {REASON_CODES.map((rc) => (
              <option key={rc.value} value={rc.value}>
                {rc.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
            placeholder="From"
          />
          <span className="text-slate-500 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
            placeholder="To"
          />
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['adjustments'] })}
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-36" />
                <div className="h-4 bg-slate-700 rounded w-28" />
                <div className="h-4 bg-slate-700 rounded w-16" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-400 mb-2">Failed to load adjustments</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['adjustments'] })}
              className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Try again
            </button>
          </div>
        ) : !adjustments || adjustments.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-slate-400 text-lg mb-2">No adjustments found</p>
            <p className="text-sm text-slate-500">
              {reasonFilter || dateFrom || dateTo
                ? 'Try adjusting your filters'
                : 'Stock adjustments will appear here'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">Date</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Product</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Qty</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Reason</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Employee</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Approved By</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Notes</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adj) => (
                  <tr
                    key={adj.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                      {formatDate(adj.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">{adj.productName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono font-medium ${
                          adj.quantity > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {adj.quantity > 0 ? '+' : ''}
                        {adj.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          REASON_COLORS[adj.reasonCode] || 'bg-slate-500/20 text-slate-300'
                        }`}
                      >
                        {REASON_LABELS[adj.reasonCode] || adj.reasonCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{adj.employeeName}</td>
                    <td className="px-4 py-3 text-slate-300">
                      {adj.approvedByName || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate" title={adj.notes || ''}>
                      {adj.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
