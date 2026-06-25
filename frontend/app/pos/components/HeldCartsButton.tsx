'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCartStore } from '@/lib/store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface HeldCart {
  id: string;
  items: Array<{
    productId: string;
    name: string;
    strainName?: string;
    category: string;
    quantity: number;
    unitPrice: number;
    unitType: string;
  }>;
  discountTotal: number;
  customerName?: string;
  notes?: string;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

async function fetchHeldCarts(): Promise<HeldCart[]> {
  const { data } = await api.get('/cart/held');
  return data;
}

async function resumeCart(id: string): Promise<HeldCart> {
  const { data } = await api.delete(`/cart/held/${id}`);
  return data;
}

export function HeldCartsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const queryClient = useQueryClient();
  const { clearCart, addItem } = useCartStore();

  // Fetch held carts
  const { data: heldCarts = [], isLoading } = useQuery({
    queryKey: ['heldCarts'],
    queryFn: fetchHeldCarts,
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: resumeCart,
    onSuccess: (cartData) => {
      // Populate cart from returned cartData
      clearCart();
      if (cartData.items && cartData.items.length > 0) {
        cartData.items.forEach((item) => {
          addItem({
            productId: item.productId,
            name: item.name,
            strainName: item.strainName,
            category: item.category,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitType: item.unitType,
          });
        });
      }
      // Apply discount if present
      if (cartData.discountTotal) {
        useCartStore.getState().setDiscount(cartData.discountTotal);
      }

      toast.success('Cart resumed');
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['heldCarts'] });
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to resume cart';
      toast.error(message);
    },
    onSettled: () => {
      setResumingId(null);
    },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleResume = (id: string) => {
    setResumingId(id);
    resumeMutation.mutate(id);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="text-sm px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600
                   text-slate-300 hover:bg-slate-700 hover:border-slate-500
                   transition-colors flex items-center gap-2"
        title="View held carts"
      >
        Held Carts
        {heldCarts.length > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-xs font-bold text-white">
            {heldCarts.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700
                     rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-white text-sm">
              Held Carts{heldCarts.length > 0 && ` (${heldCarts.length})`}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-white transition-colors p-0.5"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="animate-spin w-5 h-5 text-slate-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {!isLoading && heldCarts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-8 mb-2 opacity-30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
                  />
                </svg>
                <p className="text-sm">No held carts</p>
              </div>
            )}

            {!isLoading &&
              heldCarts.map((cart) => {
                const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);
                const total = cart.items.reduce(
                  (sum, i) => sum + i.unitPrice * i.quantity,
                  0,
                ) - (cart.discountTotal || 0);

                return (
                  <button
                    key={cart.id}
                    onClick={() => handleResume(cart.id)}
                    disabled={resumingId === cart.id}
                    className="w-full text-left px-4 py-3 hover:bg-slate-800/50 border-b border-slate-800
                               last:border-b-0 disabled:opacity-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {cart.customerName || 'No name'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {itemCount} items · R {total.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-xs text-slate-600">
                          {timeAgo(cart.createdAt)}
                        </span>
                        {resumingId === cart.id ? (
                          <svg
                            className="animate-spin w-4 h-4 text-emerald-500"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        )}
                      </div>
                    </div>
                    {cart.notes && (
                      <p className="text-xs text-slate-600 mt-1 truncate italic">
                        {cart.notes}
                      </p>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
