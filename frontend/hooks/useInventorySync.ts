'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import toast from 'react-hot-toast';

interface InventoryUpdate {
  productId: string;
  productName?: string;
  newQuantity: number;
  timestamp: string;
}

interface BatchUpdate {
  updates: Array<{
    productId: string;
    productName?: string;
    newQuantity: number;
  }>;
  timestamp: string;
}

// Shared stock overrides that components can read for real-time display.
// Keyed by productId, stores the latest known quantity from socket events.
const stockOverrides = new Map<string, number>();
const stockOverrideListeners = new Set<() => void>();
let stockVersion = 0; // monotonic counter — stable between updates

export function getStockVersion(): number {
  return stockVersion;
}

export function getStockOverride(productId: string): number | undefined {
  return stockOverrides.get(productId);
}

export function subscribeStockOverrides(callback: () => void): () => void {
  stockOverrideListeners.add(callback);
  return () => {
    stockOverrideListeners.delete(callback);
  };
}

function notifyStockOverrideListeners(): void {
  stockOverrideListeners.forEach((cb) => cb());
}

function applyStockOverride(productId: string, newQuantity: number): void {
  stockOverrides.set(productId, newQuantity);
  stockVersion++;
  notifyStockOverrideListeners();
}

/**
 * Hook to mount once in the POS page. Connects to the Socket.io server,
 * listens for inventory events, invalidates React Query caches, and
 * shows toast notifications. Cleans up on unmount.
 */
export function useInventorySync() {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Keep token in a ref so socket event handlers always read latest
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const handleInventoryUpdate = useCallback(
    (data: InventoryUpdate) => {
      const { productId, productName, newQuantity } = data;

      // Update shared stock overrides for real-time UI
      applyStockOverride(productId, newQuantity);

      // Invalidate React Query caches so data refetches in background
      queryClient.invalidateQueries({ queryKey: ['productSearch'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });

      // Show toast
      const name = productName || productId;
      toast(`Stock updated: ${name} now ${newQuantity}`, {
        icon: '📦',
        style: {
          background: '#18181b',
          color: '#e4e4e7',
          border: '1px solid #27272a',
        },
        duration: 3000,
      });
    },
    [queryClient],
  );

  const handleBatchUpdate = useCallback(
    (data: BatchUpdate) => {
      const { updates } = data;

      // Update stock overrides for each item in the batch
      for (const u of updates) {
        applyStockOverride(u.productId, u.newQuantity);
      }

      // Invalidate all product/inventory queries
      queryClient.invalidateQueries({ queryKey: ['productSearch'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });

      const count = updates.length;
      toast(`${count} product${count !== 1 ? 's' : ''} updated via batch sync`, {
        icon: '📦',
        style: {
          background: '#18181b',
          color: '#e4e4e7',
          border: '1px solid #27272a',
        },
        duration: 4000,
      });
    },
    [queryClient],
  );

  useEffect(() => {
    if (!isAuthenticated || !tokenRef.current) {
      disconnectSocket();
      return;
    }

    // Connect (or reconnect if token changed)
    const s = connectSocket();

    // Remove previous listeners to avoid duplicates on re-renders
    s.off('inventory:update', handleInventoryUpdate);
    s.off('inventory:batch-update', handleBatchUpdate);

    s.on('inventory:update', handleInventoryUpdate);
    s.on('inventory:batch-update', handleBatchUpdate);

    return () => {
      s.off('inventory:update', handleInventoryUpdate);
      s.off('inventory:batch-update', handleBatchUpdate);
    };
  }, [isAuthenticated, token, handleInventoryUpdate, handleBatchUpdate]);

  // Full cleanup on unmount (when leaving POS page)
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);
}
