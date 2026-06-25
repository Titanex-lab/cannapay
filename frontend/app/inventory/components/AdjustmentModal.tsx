'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  productName: string;
  currentStock: number;
}

const REASON_CODES = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'gifted', label: 'Gifted' },
  { value: 'internal_use', label: 'Internal Use' },
  { value: 'theft', label: 'Theft' },
  { value: 'expired', label: 'Expired' },
  { value: 'correction', label: 'Correction' },
] as const;

const REASON_COLORS: Record<string, string> = {
  damaged: 'bg-red-500/20 text-red-300',
  gifted: 'bg-purple-500/20 text-purple-300',
  internal_use: 'bg-blue-500/20 text-blue-300',
  theft: 'bg-orange-500/20 text-orange-300',
  expired: 'bg-amber-500/20 text-amber-300',
  correction: 'bg-slate-500/20 text-slate-300',
};

const MANAGER_APPROVAL_THRESHOLD = 50;

export function AdjustmentModal({
  open,
  onClose,
  productId,
  productName,
  currentStock,
}: Props) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [reasonCode, setReasonCode] = useState('correction');
  const [notes, setNotes] = useState('');
  const [approverPin, setApproverPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [newStock, setNewStock] = useState(currentStock);

  const qty = parseFloat(quantity) || 0;
  const isAddition = qty >= 0;
  const absQty = Math.abs(qty);
  const requiresApproval = absQty >= MANAGER_APPROVAL_THRESHOLD;

  useEffect(() => {
    if (open) {
      setQuantity('');
      setReasonCode('correction');
      setNotes('');
      setApproverPin('');
      setNewStock(currentStock);
    }
  }, [open, currentStock]);

  useEffect(() => {
    setNewStock(currentStock + qty);
  }, [qty, currentStock]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId) {
      toast.error('No product selected');
      return;
    }

    if (qty === 0) {
      toast.error('Quantity cannot be zero');
      return;
    }

    if (requiresApproval && !approverPin.trim()) {
      toast.error('Manager approval PIN is required for this adjustment');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        productId,
        quantity: qty,
        reasonCode,
        notes: notes.trim() || null,
      };

      if (requiresApproval) {
        payload.approverPin = approverPin;
      }

      await api.post('/inventory/adjust', payload);
      toast.success(
        `Stock ${isAddition ? 'increased' : 'decreased'} by ${absQty}`
      );

      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to adjust inventory'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md m-4">
        {/* Header */}
        <div className="border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Adjust Inventory</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Product Info (read-only) */}
          <div className="bg-slate-900 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Product</span>
              <span className="text-sm font-medium">{productName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Current Stock</span>
              <span className="text-sm font-medium font-mono">{currentStock}</span>
            </div>
            <div className="border-t border-slate-700 pt-2 flex justify-between items-center">
              <span className="text-sm text-slate-400">New Stock</span>
              <span
                className={`text-sm font-bold font-mono ${
                  newStock < 0
                    ? 'text-red-400'
                    : newStock === 0
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {newStock}
              </span>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Quantity
              <span className="text-xs text-slate-500 ml-2">
                ({isAddition ? 'positive = add' : 'negative = remove'})
              </span>
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="e.g. 10 or -5"
            />
            {qty !== 0 && (
              <p className="mt-1 text-xs text-slate-400">
                {isAddition
                  ? `Adding ${absQty} units to stock`
                  : `Removing ${absQty} units from stock`}
              </p>
            )}
          </div>

          {/* Reason Code */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Reason Code
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {REASON_CODES.map((rc) => (
                <option key={rc.value} value={rc.value}>
                  {rc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Manager Approval */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-slate-300">
                Manager Approval
              </span>
              {requiresApproval ? (
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300">
                  Required
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300">
                  Not required
                </span>
              )}
            </div>
            {requiresApproval && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Approved By (Manager PIN)
                </label>
                <input
                  type="password"
                  value={approverPin}
                  onChange={(e) => setApproverPin(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Enter manager PIN"
                  maxLength={6}
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Adjustments of {MANAGER_APPROVAL_THRESHOLD}+ units require manager approval
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || qty === 0}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                isAddition
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {saving
                ? 'Processing...'
                : isAddition
                ? `Add ${absQty || ''}`
                : `Remove ${absQty || ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
