'use client';

import { useSyncExternalStore } from 'react';
import { useCartStore } from '@/lib/store';
import { getStockOverride, subscribeStockOverrides, getStockVersion } from '@/hooks/useInventorySync';
import toast from 'react-hot-toast';

interface CartPanelProps {
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function CartPanel({ isMobile, isOpen, onClose }: CartPanelProps) {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);

  // Subscribe to real-time stock overrides from socket events
  useSyncExternalStore(subscribeStockOverrides, getStockVersion);

  // Compute stock warnings for cart items
  const stockWarnings: Array<{ productId: string; name: string; cartQty: number; stock: number }> = [];
  for (const item of items) {
    const override = getStockOverride(item.productId);
    if (override !== undefined && item.quantity > override) {
      stockWarnings.push({
        productId: item.productId,
        name: item.name,
        cartQty: item.quantity,
        stock: override,
      });
    }
  }

  // ── Empty state ──────────────────────────────────────────────────────
  const emptyState = (
    <div className="h-full flex flex-col items-center justify-center text-slate-500 p-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-12 w-12 mb-3 opacity-30"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
        />
      </svg>
      <p className="text-sm">Cart is empty</p>
      <p className="text-xs mt-1 text-slate-600">
        Search for products to add them
      </p>
    </div>
  );

  // ── Cart items list ──────────────────────────────────────────────────
  const cartContent = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-sm text-white">Cart ({items.length})</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={clearCart}
            className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
          {isMobile && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Close cart"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Stock warning banners */}
      {stockWarnings.length > 0 && (
        <div className="px-3 pt-3 space-y-2 shrink-0">
          {stockWarnings.map((w) => (
            <div
              key={w.productId}
              className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs"
            >
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>
                Stock for <strong>{w.name}</strong> dropped to{' '}
                <strong>{w.stock}</strong>. You have <strong>{w.cartQty}</strong>{' '}
                in cart. Please adjust quantity.
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {items.map((item) => (
          <div
            key={item.productId}
            className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-900 border border-slate-800/50 hover:border-slate-700/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-xs text-slate-400 truncate">
                {item.strainName && `${item.strainName} · `}
                {item.category} · {item.unitType}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() =>
                    updateQuantity(item.productId, Math.max(1, item.quantity - 1))
                  }
                  className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-sm
                             flex items-center justify-center transition-colors touch-sm"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-7 text-center text-sm tabular-nums">
                  {item.quantity}
                </span>
                <button
                  onClick={() =>
                    updateQuantity(item.productId, item.quantity + 1)
                  }
                  className="w-7 h-7 rounded bg-slate-700 hover:bg-slate-600 text-sm
                             flex items-center justify-center transition-colors touch-sm"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => {
                  removeItem(item.productId);
                  toast.success('Removed from cart');
                }}
                className="w-7 h-7 rounded text-slate-400 hover:text-red-400
                           hover:bg-red-400/10 flex items-center justify-center
                           transition-colors text-sm touch-sm"
                aria-label="Remove item"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Subtotal */}
      <div className="px-4 py-3 border-t border-slate-800 shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">Subtotal</span>
          <span className="text-base font-semibold tracking-tight">R {subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );

  // ── MOBILE: Bottom sheet overlay ─────────────────────────────────────
  if (isMobile) {
    if (!isOpen) return null;

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        {/* Sheet */}
        <div
          className={`fixed inset-x-0 bottom-0 z-50 max-h-[85vh] bg-slate-950 border-t border-slate-800 rounded-t-2xl shadow-2xl transform transition-transform duration-250 ease-out ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-700" />
          </div>
          {items.length === 0 ? (
            <div className="h-48">{emptyState}</div>
          ) : (
            <div className="h-[70vh]">{cartContent}</div>
          )}
        </div>
      </>
    );
  }

  // ── DESKTOP: Inline panel ────────────────────────────────────────────
  if (items.length === 0) return emptyState;
  return cartContent;
}
