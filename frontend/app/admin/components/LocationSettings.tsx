'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ───────────────────────────────────────────────────────────────────

interface LocationSettingsData {
  id: string;
  name: string;
  address: string;
  licenseNumber: string;
  taxStandardRate: number;
  taxExciseFlowerRate: number;
  taxExciseEdibleRate: number;
  taxExciseConcentrateRate: number;
  voidRefundThreshold: number;
  inventoryAdjustmentThreshold: number;
}

const EMPTY_SETTINGS: LocationSettingsData = {
  id: '',
  name: '',
  address: '',
  licenseNumber: '',
  taxStandardRate: 15.0,
  taxExciseFlowerRate: 0.0,
  taxExciseEdibleRate: 0.0,
  taxExciseConcentrateRate: 0.0,
  voidRefundThreshold: 500,
  inventoryAdjustmentThreshold: 1000,
};

// ── Component ───────────────────────────────────────────────────────────────

export function LocationSettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<LocationSettingsData>(EMPTY_SETTINGS);
  const [dirty, setDirty] = useState(false);

  // ── Query ──────────────────────────────────────────────────────────────

  const {
    data: fetched,
    isLoading,
    isError,
    error,
  } = useQuery<LocationSettingsData>({
    queryKey: ['admin', 'location-settings'],
    queryFn: async () => {
      const { data } = await api.get('/admin/location');
      return data.location ?? data;
    },
    retry: false,
  });

  // Sync fetched data into local state
  useEffect(() => {
    if (fetched) {
      setSettings({
        id: fetched.id || '',
        name: fetched.name || '',
        address: fetched.address || '',
        licenseNumber: fetched.licenseNumber || '',
        taxStandardRate: fetched.taxStandardRate ?? 15.0,
        taxExciseFlowerRate: fetched.taxExciseFlowerRate ?? 0.0,
        taxExciseEdibleRate: fetched.taxExciseEdibleRate ?? 0.0,
        taxExciseConcentrateRate: fetched.taxExciseConcentrateRate ?? 0.0,
        voidRefundThreshold: fetched.voidRefundThreshold ?? 500,
        inventoryAdjustmentThreshold: fetched.inventoryAdjustmentThreshold ?? 1000,
      });
      setDirty(false);
    }
  }, [fetched]);

  // ── Mutation ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (data: LocationSettingsData) => {
      await api.put('/admin/location', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'location-settings'] });
      setDirty(false);
      toast.success('Location settings saved');
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Failed to save settings';
      toast.error(msg);
    },
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  const updateField = useCallback(
    (field: keyof LocationSettingsData, value: string | number) => {
      setSettings((prev) => ({ ...prev, [field]: value }));
      setDirty(true);
    },
    [],
  );

  const handleSave = () => {
    if (!settings.name.trim()) {
      toast.error('Location name is required');
      return;
    }
    saveMutation.mutate(settings);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-48" />
        <div className="h-10 bg-slate-700 rounded w-full" />
        <div className="h-10 bg-slate-700 rounded w-full" />
        <div className="h-10 bg-slate-700 rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* API wiring notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
        <span className="text-amber-400 shrink-0 text-sm mt-0.5">⚠️</span>
        <div className="text-sm text-amber-300">
          <p className="mb-1">
            Backend API route at <code className="text-amber-400 bg-amber-500/10 px-1 rounded">/api/admin/location</code> is not yet wired.
            The form is ready — settings will persist once the route is added.
          </p>
          <span className="text-amber-400/70 text-xs">
            Expected endpoints: GET /api/admin/location, PUT /api/admin/location
          </span>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="p-6 bg-slate-800 rounded-xl border border-slate-700 text-center">
          <p className="text-amber-400 mb-2">Unable to load location settings</p>
          <p className="text-sm text-slate-400 mb-3">
            {(error as Error)?.message || 'API endpoint not yet available'}
          </p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'location-settings'] })}
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Location Info */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
          📋 Location Details
        </h3>

        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={settings.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Main Street Dispensary"
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Address</label>
          <input
            type="text"
            value={settings.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="123 Main Street, Cape Town"
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">License Number</label>
          <input
            type="text"
            value={settings.licenseNumber}
            onChange={(e) => updateField('licenseNumber', e.target.value)}
            placeholder="LIC-2024-XXXX"
            className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Tax Configuration */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
          💰 Tax Configuration
        </h3>
        <p className="text-xs text-slate-500 -mt-2">
          Tax rates are applied per category during checkout
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Standard Tax Rate */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Standard Tax Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.taxStandardRate}
                onChange={(e) => updateField('taxStandardRate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                %
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Applied to accessories, paraphernalia, and non-cannabis items
            </p>
          </div>

          {/* Excise Flower Rate */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Excise Flower Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.taxExciseFlowerRate}
                onChange={(e) => updateField('taxExciseFlowerRate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                %
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Additional excise on flower and pre-rolls
            </p>
          </div>

          {/* Excise Edible Rate */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Excise Edible Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.taxExciseEdibleRate}
                onChange={(e) => updateField('taxExciseEdibleRate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                %
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Additional excise on edibles and infused products
            </p>
          </div>

          {/* Excise Concentrate Rate */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Excise Concentrate Rate (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.taxExciseConcentrateRate}
                onChange={(e) =>
                  updateField('taxExciseConcentrateRate', parseFloat(e.target.value) || 0)
                }
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                %
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Additional excise on concentrates, vapes, and extracts
            </p>
          </div>
        </div>

        {/* Tax summary */}
        <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-xs text-slate-500 space-y-1">
          <p>
            <span className="text-slate-400">Effective rates per category:</span>
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Standard:</span>
            <span className="text-emerald-400 font-mono">
              {settings.taxStandardRate.toFixed(2)}%
            </span>
            <span>Flower:</span>
            <span className="text-emerald-400 font-mono">
              {(settings.taxStandardRate + settings.taxExciseFlowerRate).toFixed(2)}%
            </span>
            <span>Edible:</span>
            <span className="text-emerald-400 font-mono">
              {(settings.taxStandardRate + settings.taxExciseEdibleRate).toFixed(2)}%
            </span>
            <span>Concentrate:</span>
            <span className="text-emerald-400 font-mono">
              {(settings.taxStandardRate + settings.taxExciseConcentrateRate).toFixed(2)}%
            </span>
          </div>
        </div>
      </div>

      {/* Approval Thresholds */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-400">
          🛡️ Manager Approval Thresholds
        </h3>
        <p className="text-xs text-slate-500 -mt-2">
          Actions exceeding these amounts require manager approval
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Void/Refund Threshold */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Void / Refund Threshold
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                R
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.voidRefundThreshold}
                onChange={(e) =>
                  updateField('voidRefundThreshold', parseFloat(e.target.value) || 0)
                }
                className="w-full pl-8 pr-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Voids/refunds above this amount need a manager PIN
            </p>
          </div>

          {/* Inventory Adjustment Threshold */}
          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Inventory Adjustment Threshold
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                R
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={settings.inventoryAdjustmentThreshold}
                onChange={(e) =>
                  updateField('inventoryAdjustmentThreshold', parseFloat(e.target.value) || 0)
                }
                className="w-full pl-8 pr-3 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-right text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Adjustments above this value need a manager PIN
            </p>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || !dirty}
          className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>

        {dirty && (
          <span className="text-xs text-amber-400">Unsaved changes</span>
        )}

        {saveMutation.isError && (
          <span className="text-xs text-red-400">Save failed — see error above</span>
        )}
      </div>
    </div>
  );
}
