'use client';

import { useState } from 'react';
import { useCartStore } from '@/lib/store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface HoldCartModalProps {
  onClose: () => void;
}

export function HoldCartModal({ onClose }: HoldCartModalProps) {
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [isHolding, setIsHolding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useCartStore((s) => s.items);
  const discountTotal = useCartStore((s) => s.discountTotal);
  const subtotal = useCartStore((s) => s.subtotal());
  const itemCount = useCartStore((s) => s.itemCount());
  const clearCart = useCartStore((s) => s.clearCart);

  const handleHold = async () => {
    if (items.length === 0) {
      setError('Cart is empty');
      return;
    }

    setError(null);
    setIsHolding(true);

    try {
      await api.post('/cart/hold', {
        items: items.map((item) => ({
          productId: item.productId,
          name: item.name,
          strainName: item.strainName,
          category: item.category,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitType: item.unitType,
        })),
        discountTotal,
        customerName: customerName.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      clearCart();
      toast.success('Cart held');
      onClose();
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to hold cart. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsHolding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-bold text-lg text-white">Hold Cart</h2>
          <button
            onClick={onClose}
            disabled={isHolding}
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Cart summary */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-slate-400">Cart Summary</span>
              <span className="text-xs text-slate-500">{itemCount} items</span>
            </div>

            <div className="max-h-32 overflow-y-auto space-y-1.5 mb-3">
              {items.map((item) => (
                <div key={item.productId} className="flex justify-between text-sm">
                  <span className="text-slate-300 truncate max-w-[60%]">
                    {item.name}{' '}
                    <span className="text-slate-500">×{item.quantity}</span>
                  </span>
                  <span className="text-white tabular-nums">
                    R {(item.unitPrice * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-700 pt-2 flex justify-between font-bold text-white">
              <span>Total</span>
              <span className="tabular-nums">R {subtotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Customer Name */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Customer Name{' '}
              <span className="text-slate-600">(optional)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. John Doe"
              disabled={isHolding}
              className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm
                         placeholder:text-slate-600 focus:outline-none focus:border-emerald-500
                         disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Notes{' '}
              <span className="text-slate-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this held cart..."
              disabled={isHolding}
              rows={2}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm
                         placeholder:text-slate-600 focus:outline-none focus:border-emerald-500
                         disabled:opacity-50 transition-colors resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={isHolding}
              className="flex-1 py-2.5 bg-slate-800 border border-slate-600 hover:border-slate-500
                         text-slate-300 hover:text-white rounded-lg text-sm font-medium
                         disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleHold}
              disabled={isHolding || items.length === 0}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg
                         text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors flex items-center justify-center gap-2"
            >
              {isHolding ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Holding...
                </>
              ) : (
                'Hold Cart'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
