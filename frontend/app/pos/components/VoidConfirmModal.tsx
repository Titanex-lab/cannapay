'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ───────────────────────────────────────────────────────────────────

type Tab = 'void' | 'refund';

type ReasonCode =
  | 'customer_change'
  | 'product_issue'
  | 'pricing_error'
  | 'other';

interface TransactionItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface TransactionSummary {
  id: string;
  transactionNumber: number;
  date: string;
  budtenderName: string;
  items: TransactionItem[];
  total: number;
  paymentMethod: string;
  status: string;
}

const REASON_LABELS: Record<ReasonCode, string> = {
  customer_change: 'Customer Change',
  product_issue: 'Product Issue',
  pricing_error: 'Pricing Error',
  other: 'Other',
};

const REASON_CODES: ReasonCode[] = [
  'customer_change',
  'product_issue',
  'pricing_error',
  'other',
];

function isManagerOrAbove(user: { role: string } | null): boolean {
  if (!user) return false;
  const role = user.role.toLowerCase();
  return role === 'manager' || role === 'admin' || role === 'owner';
}

// ── Spinner ─────────────────────────────────────────────────────────────────

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface VoidConfirmModalProps {
  onClose: () => void;
}

export function VoidConfirmModal({ onClose }: VoidConfirmModalProps) {
  const { user } = useAuthStore();

  // Lookup state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [transaction, setTransaction] = useState<TransactionSummary | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Action state
  const [activeTab, setActiveTab] = useState<Tab>('void');
  const [reason, setReason] = useState<ReasonCode>('customer_change');
  const [managerPin, setManagerPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const manager = isManagerOrAbove(user);

  // ── Transaction Lookup ──────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Reset states
    setTransaction(null);
    setNotFound(false);
    setActionError(null);
    setSuccess(null);
    setIsSearching(true);

    try {
      const { data } = await api.get('/transactions', {
        params: { search: trimmed, limit: 5 },
      });

      // API may return an array or a single transaction
      const results: any[] = Array.isArray(data)
        ? data
        : data.transactions ?? [data];

      if (results.length === 0) {
        setNotFound(true);
        return;
      }

      // Find best match — prefer exact transactionNumber match
      let match = results[0];
      const numericSearch = parseInt(trimmed, 10);
      if (!isNaN(numericSearch)) {
        const exact = results.find(
          (t: any) =>
            t.transactionNumber === numericSearch ||
            t.id === trimmed,
        );
        if (exact) match = exact;
      }

      setTransaction({
        id: match.id,
        transactionNumber: match.transactionNumber ?? match.id,
        date: match.createdAt ?? match.date,
        budtenderName:
          match.budtender?.fullName ??
          match.budtenderName ??
          'Unknown',
        items: (match.items ?? []).map((item: any) => ({
          productId: item.productId ?? item.id,
          name: item.product?.name ?? item.name ?? 'Unknown Item',
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? item.price ?? 0,
          lineTotal: item.lineTotal ?? (item.quantity * (item.unitPrice ?? item.price ?? 0)),
        })),
        total: match.total ?? 0,
        paymentMethod: match.paymentMethod ?? 'unknown',
        status: match.status ?? 'completed',
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ??
        err.response?.data?.message ??
        'Failed to lookup transaction.';
      toast.error(message);
      setNotFound(true);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // ── Determine if the transaction is already voided/refunded ─────────────

  const isTerminal =
    transaction?.status === 'voided' || transaction?.status === 'refunded';

  // ── Void Action ─────────────────────────────────────────────────────────

  const handleVoid = useCallback(async () => {
    if (!transaction) return;
    setActionError(null);
    setPinError(null);
    setIsProcessing(true);

    try {
      await api.post(`/transactions/${transaction.id}/void`, {
        reason,
        approvedBy: manager ? user?.id : undefined,
        managerPin: !manager ? managerPin : undefined,
      });

      setSuccess('Transaction voided successfully.');
      toast.success('Transaction voided.');
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ??
        err.response?.data?.message ??
        'Failed to void transaction.';
      setActionError(message);
      toast.error(message);

      // If 401/403 on PIN, show pin error
      if (err.response?.status === 401 || err.response?.status === 403) {
        setPinError('Invalid or unauthorized PIN.');
      }
    } finally {
      setIsProcessing(false);
    }
  }, [transaction, reason, manager, user, managerPin]);

  // ── Refund Action ───────────────────────────────────────────────────────

  const handleRefund = useCallback(async () => {
    if (!transaction) return;
    if (!manager) {
      setActionError('Manager approval required for refunds.');
      return;
    }

    setActionError(null);
    setIsProcessing(true);

    const refundItemIds =
      selectedItems.size === 0 || selectedItems.size === transaction.items.length
        ? undefined // full refund
        : Array.from(selectedItems);

    try {
      await api.post(`/transactions/${transaction.id}/refund`, {
        reason,
        itemIds: refundItemIds,
      });

      setSuccess('Refund processed successfully.');
      toast.success('Refund processed.');
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ??
        err.response?.data?.message ??
        'Failed to process refund.';
      setActionError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }, [transaction, reason, manager, selectedItems]);

  // ── Item checkbox toggle ────────────────────────────────────────────────

  const toggleItem = (productId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleAllItems = () => {
    if (!transaction) return;
    if (selectedItems.size === transaction.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(transaction.items.map((i) => i.productId)));
    }
  };

  // ── Can void? ───────────────────────────────────────────────────────────

  const canVoid = Boolean(transaction && !isTerminal);
  const canRefund = Boolean(transaction && !isTerminal && manager);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <h2 className="font-bold text-lg text-white">Void / Refund</h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors p-1"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── Transaction Lookup ─────────────────────────────── */}
          <div className="space-y-2">
            <label className="block text-sm text-slate-400">
              Find Transaction
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setNotFound(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                placeholder="Transaction # or last 4 of card"
                className="flex-1 px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
              >
                {isSearching ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  'Search'
                )}
              </button>
            </div>
          </div>

          {/* ── Search feedback ───────────────────────────────── */}
          {isSearching && (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
              <Spinner className="w-5 h-5" />
              <span className="text-sm">Looking up transaction...</span>
            </div>
          )}

          {notFound && (
            <div className="p-4 bg-slate-800 rounded-xl border border-slate-700 text-center">
              <p className="text-slate-400 text-sm">
                No transaction found for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            </div>
          )}

          {/* ── Transaction Summary ───────────────────────────── */}
          {transaction && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">
                  Transaction #{transaction.transactionNumber}
                </h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    transaction.status === 'voided'
                      ? 'bg-red-600/20 text-red-400'
                      : transaction.status === 'refunded'
                      ? 'bg-amber-600/20 text-amber-400'
                      : 'bg-emerald-600/20 text-emerald-400'
                  }`}
                >
                  {transaction.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                <div>
                  <span className="text-slate-500">Date: </span>
                  {new Date(transaction.date).toLocaleString()}
                </div>
                <div>
                  <span className="text-slate-500">Budtender: </span>
                  {transaction.budtenderName}
                </div>
                <div>
                  <span className="text-slate-500">Payment: </span>
                  <span className="capitalize">{transaction.paymentMethod}</span>
                </div>
                <div>
                  <span className="text-slate-500">Total: </span>
                  <span className="text-white font-semibold">
                    R {transaction.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1 pt-1 border-t border-slate-700">
                {transaction.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-slate-400 truncate max-w-[60%]">
                      {item.name}{' '}
                      <span className="text-slate-600">×{item.quantity}</span>
                    </span>
                    <span className="text-slate-300 tabular-nums">
                      R {item.lineTotal.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {isTerminal && (
                <div className="p-2 rounded-lg bg-slate-700/50 border border-slate-600 text-center">
                  <p className="text-xs text-slate-400">
                    This transaction has already been{' '}
                    <span className="font-semibold text-slate-300">
                      {transaction.status}
                    </span>
                    . No further action available.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Tabs & Actions ────────────────────────────────── */}
          {transaction && !isTerminal && (
            <>
              {/* Tab bar */}
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => {
                    setActiveTab('void');
                    setActionError(null);
                    setPinError(null);
                  }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'void'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Void
                </button>
                <button
                  onClick={() => {
                    setActiveTab('refund');
                    setActionError(null);
                  }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'refund'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Refund
                </button>
              </div>

              {/* ── VOID TAB ──────────────────────────────────── */}
              {activeTab === 'void' && (
                <div className="space-y-4">
                  {/* Reason dropdown */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Reason for Void
                    </label>
                    <select
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value as ReasonCode)
                      }
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-red-500 transition-colors appearance-none cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.5rem center',
                        backgroundSize: '1.5rem',
                      }}
                    >
                      {REASON_CODES.map((code) => (
                        <option key={code} value={code}>
                          {REASON_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Manager PIN (budtender only) */}
                  {!manager && (
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Manager PIN{' '}
                        <span className="text-slate-600">
                          (required for void)
                        </span>
                      </label>
                      <input
                        type="password"
                        maxLength={6}
                        value={managerPin}
                        onChange={(e) => {
                          setManagerPin(e.target.value.replace(/\D/g, ''));
                          setPinError(null);
                        }}
                        placeholder="6-digit PIN"
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm tracking-widest text-center focus:outline-none focus:border-red-500 transition-colors"
                      />
                      {pinError && (
                        <p className="mt-1 text-xs text-red-400">{pinError}</p>
                      )}
                    </div>
                  )}

                  {manager && (
                    <div className="p-3 bg-emerald-600/10 border border-emerald-600/20 rounded-lg">
                      <p className="text-xs text-emerald-400">
                        ✓ Auto-approved — you have manager privileges
                      </p>
                    </div>
                  )}

                  {/* Error */}
                  {actionError && (
                    <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-lg">
                      <p className="text-sm text-red-400">{actionError}</p>
                    </div>
                  )}

                  {/* Void button */}
                  <button
                    onClick={handleVoid}
                    disabled={isProcessing || !canVoid || (!manager && managerPin.length !== 6)}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Spinner className="w-4 h-4" />
                        Voiding...
                      </>
                    ) : (
                      'Void Transaction'
                    )}
                  </button>
                </div>
              )}

              {/* ── REFUND TAB ────────────────────────────────── */}
              {activeTab === 'refund' && (
                <div className="space-y-4">
                  {/* Manager check */}
                  {!manager ? (
                    <div className="p-4 bg-red-600/10 border border-red-600/30 rounded-xl text-center">
                      <p className="text-sm text-red-400 mb-2">
                        Manager approval required
                      </p>
                      <p className="text-xs text-slate-500">
                        Only managers and above can process refunds.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Reason dropdown */}
                      <div>
                        <label className="block text-sm text-slate-400 mb-1">
                          Reason for Refund
                        </label>
                        <select
                          value={reason}
                          onChange={(e) =>
                            setReason(e.target.value as ReasonCode)
                          }
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 transition-colors appearance-none cursor-pointer"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 0.5rem center',
                            backgroundSize: '1.5rem',
                          }}
                        >
                          {REASON_CODES.map((code) => (
                            <option key={code} value={code}>
                              {REASON_LABELS[code]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Partial refund — item checkboxes */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm text-slate-400">
                            Items to Refund
                          </label>
                          <button
                            onClick={toggleAllItems}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            {selectedItems.size === transaction.items.length
                              ? 'Deselect All'
                              : 'Select All'}
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto bg-slate-800/50 rounded-lg border border-slate-700 p-2">
                          {transaction.items.map((item) => {
                            const isSelected = selectedItems.size === 0 || selectedItems.has(item.productId);
                            return (
                              <label
                                key={item.productId}
                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-amber-600/10 border border-amber-600/20'
                                    : 'hover:bg-slate-700/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleItem(item.productId)}
                                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-slate-300 truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    R {item.lineTotal.toFixed(2)} ×{item.quantity}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          {selectedItems.size === 0 || selectedItems.size === transaction.items.length
                            ? 'Full refund — all items will be refunded'
                            : `Partial refund — ${selectedItems.size} of ${transaction.items.length} items selected`}
                        </p>
                      </div>

                      {/* Refund amount summary */}
                      <div className="flex justify-between items-center p-3 bg-amber-600/10 border border-amber-600/20 rounded-lg">
                        <span className="text-sm text-amber-400">
                          Refund Amount
                        </span>
                        <span className="text-lg font-bold text-amber-400 tabular-nums">
                          R{' '}
                          {transaction.items
                            .filter(
                              (item) =>
                                selectedItems.size === 0 ||
                                selectedItems.has(item.productId),
                            )
                            .reduce((sum, item) => sum + item.lineTotal, 0)
                            .toFixed(2)}
                        </span>
                      </div>

                      {/* Error */}
                      {actionError && (
                        <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-lg">
                          <p className="text-sm text-red-400">{actionError}</p>
                        </div>
                      )}

                      {/* Refund button */}
                      <button
                        onClick={handleRefund}
                        disabled={isProcessing || !canRefund}
                        className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <>
                            <Spinner className="w-4 h-4" />
                            Processing Refund...
                          </>
                        ) : (
                          'Process Refund'
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Success overlay ────────────────────────────────── */}
        {success && (
          <div className="border-t border-slate-700 p-4 shrink-0">
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-600/20 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-white">{success}</p>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ── Close button (when no success) ────────────────── */}
        {!success && (
          <div className="border-t border-slate-700 p-4 shrink-0">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full py-2 text-sm text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
