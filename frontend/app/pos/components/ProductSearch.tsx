'use client';

import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore, useCartStore, type CartItem } from '@/lib/store';
import { getStockOverride, subscribeStockOverrides, getStockVersion } from '@/hooks/useInventorySync';

interface SearchResult {
  productId: string;
  displayName: string;
  strainName: string;
  category: string;
  price: number;
  currentStock: number;
  unitType: string;
  score: number;
  matchedOn: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ProductSearch() {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  // Subscribe to real-time stock overrides from socket events
  const _stockTick = useSyncExternalStore(
    subscribeStockOverrides,
    () => getStockVersion(), // stable version counter from the pub/sub module
  );

  // Resolve effective stock: prefer live override, fall back to query data
  const getResolvedStock = (productId: string, queryStock: number): number => {
    const override = getStockOverride(productId);
    return override !== undefined ? override : queryStock;
  };

  // Check if a product in the cart exceeds its current stock
  const getCartStockWarning = (productId: string, newStock: number): string | null => {
    const cartItem = items.find((i) => i.productId === productId);
    if (cartItem && cartItem.quantity > newStock) {
      return `Cart has ${cartItem.quantity}, only ${newStock} available`;
    }
    return null;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['productSearch', debouncedQuery, user?.locationId],
    queryFn: () =>
      api
        .get('/search/products', {
          params: { q: debouncedQuery, locationId: user?.locationId, limit: 8 },
        })
        .then((r) => r.data.results as SearchResult[]),
    enabled: debouncedQuery.length >= 2,
  });

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [data]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && data && data.length > 0) {
      const items = listRef.current.querySelectorAll('[data-result-index]');
      const target = items[highlightIndex] as HTMLElement | undefined;
      if (target) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex, data]);

  const handleSelect = (result: SearchResult) => {
    const item: CartItem = {
      productId: result.productId,
      name: result.displayName,
      strainName: result.strainName,
      category: result.category,
      quantity: 1,
      unitPrice: result.price,
      unitType: result.unitType,
    };
    addItem(item);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !data?.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, data.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (data[highlightIndex]) handleSelect(data[highlightIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  };

  const stockColor = (stock: number) => {
    if (stock > 5) return 'text-green-400';
    if (stock > 0) return 'text-yellow-400';
    return 'text-red-400';
  };

  const stockLabel = (stock: number) => {
    if (stock > 0) return `${stock} in stock`;
    return 'Out of stock';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 shrink-0">
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          placeholder="Search strains or products..."
          className="w-full h-12 pl-10 pr-4 text-sm bg-slate-900 border border-slate-700 rounded-xl
                     text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50
                     focus:ring-1 focus:ring-emerald-500/20 transition-all"
        />
        </div>
      </div>

      {/* Results dropdown */}
      {isOpen && query.length >= 2 && (
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 pb-24 md:pb-4">
          {isLoading && (
            <div className="text-slate-400 text-center py-8">
              <span className="animate-pulse">Searching...</span>
            </div>
          )}

          {!isLoading && data && data.length === 0 && (
            <div className="text-slate-400 text-center py-8">
              No products found
            </div>
          )}

          {!isLoading &&
            data?.map((result, i) => {
              const resolvedStock = getResolvedStock(result.productId, result.currentStock);
              const warning = getCartStockWarning(result.productId, resolvedStock);
              return (
              <button
                key={result.productId}
                data-result-index={i}
                onClick={() => handleSelect(result)}
                className={`w-full text-left p-4 rounded-xl mb-1.5 transition flex items-center justify-between min-h-[64px]
                  ${
                    i === highlightIndex
                      ? 'bg-emerald-600/20 border border-emerald-500/50'
                      : 'hover:bg-slate-800 border border-transparent active:bg-slate-700'
                  }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{result.displayName}</div>
                  <div className="text-sm text-slate-400 truncate">
                    {result.strainName && <span>{result.strainName}</span>}
                    <span className="ml-2 px-1.5 py-0.5 bg-slate-700 rounded text-xs inline-block">
                      {result.category}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-bold text-emerald-400">
                    R {result.price.toFixed(2)}
                  </div>
                  <div className={`text-xs ${stockColor(resolvedStock)}`}>
                    {stockLabel(resolvedStock)}
                  </div>
                  {warning && (
                    <div className="text-xs text-amber-400 mt-1 max-w-[140px] leading-tight">
                      ⚠ {warning}
                    </div>
                  )}
                </div>
              </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
