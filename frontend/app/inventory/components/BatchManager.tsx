'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Batch {
  id: string;
  lotNumber: string;
  strainId: string;
  strainName?: string;
  supplier: string;
  harvestDate: string | null;
  productionDate: string | null;
  expirationDate: string | null;
  currentPotencyThc: number | null;
  labResults: any;
}

interface Strain {
  id: string;
  name: string;
}

interface BatchFormData {
  lotNumber: string;
  strainId: string;
  supplier: string;
  harvestDate: string;
  productionDate: string;
  expirationDate: string;
  currentPotencyThc: string;
  labResults: string;
}

function generateLotNumber(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LOT-${datePart}-${random}`;
}

export function BatchManager() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [formData, setFormData] = useState<BatchFormData>({
    lotNumber: '',
    strainId: '',
    supplier: '',
    harvestDate: '',
    productionDate: '',
    expirationDate: '',
    currentPotencyThc: '',
    labResults: '',
  });
  const [saving, setSaving] = useState(false);
  const [labResultsExpanded, setLabResultsExpanded] = useState(false);

  const { data: batches, isLoading, isError, error } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => {
      const res = await api.get('/batches');
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const { data: strains } = useQuery<Strain[]>({
    queryKey: ['strains'],
    queryFn: async () => {
      const res = await api.get('/strains');
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const openAdd = () => {
    setEditingBatch(null);
    setFormData({
      lotNumber: generateLotNumber(),
      strainId: '',
      supplier: '',
      harvestDate: '',
      productionDate: '',
      expirationDate: '',
      currentPotencyThc: '',
      labResults: '',
    });
    setLabResultsExpanded(false);
    setModalOpen(true);
  };

  const openEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setFormData({
      lotNumber: batch.lotNumber,
      strainId: batch.strainId || '',
      supplier: batch.supplier || '',
      harvestDate: batch.harvestDate?.slice(0, 10) || '',
      productionDate: batch.productionDate?.slice(0, 10) || '',
      expirationDate: batch.expirationDate?.slice(0, 10) || '',
      currentPotencyThc: batch.currentPotencyThc?.toString() || '',
      labResults: batch.labResults ? JSON.stringify(batch.labResults, null, 2) : '',
    });
    setLabResultsExpanded(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBatch(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.lotNumber.trim()) {
      toast.error('Lot number is required');
      return;
    }

    // Parse lab results JSON
    let parsedLabResults = null;
    if (formData.labResults.trim()) {
      try {
        parsedLabResults = JSON.parse(formData.labResults);
      } catch {
        toast.error('Lab results must be valid JSON');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        lotNumber: formData.lotNumber.trim(),
        strainId: formData.strainId || null,
        supplier: formData.supplier || null,
        harvestDate: formData.harvestDate || null,
        productionDate: formData.productionDate || null,
        expirationDate: formData.expirationDate || null,
        currentPotencyThc: formData.currentPotencyThc
          ? parseFloat(formData.currentPotencyThc)
          : null,
        labResults: parsedLabResults,
      };

      if (editingBatch) {
        await api.put(`/batches/${editingBatch.id}`, payload);
        toast.success('Batch updated');
      } else {
        await api.post('/batches', payload);
        toast.success('Batch created');
      }

      queryClient.invalidateQueries({ queryKey: ['batches'] });
      closeModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save batch');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const isExpired = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    try {
      return new Date(dateStr) < new Date();
    } catch {
      return false;
    }
  };

  const isExpiringSoon = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      return d > now && d.getTime() - now.getTime() < thirtyDays;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Batch
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-28" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-400 mb-2">Failed to load batches</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['batches'] })}
              className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Try again
            </button>
          </div>
        ) : !batches || batches.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🧪</div>
            <p className="text-slate-400 text-lg mb-2">No batches defined</p>
            <p className="text-sm text-slate-500 mb-4">
              Add batches to track inventory lots
            </p>
            <button
              onClick={openAdd}
              className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Batch
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">Lot Number</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Strain</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Supplier</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Harvest Date</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Expiration</th>
                  <th className="px-4 py-3 font-medium text-slate-400">THC %</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    onClick={() => openEdit(batch)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">
                      {batch.lotNumber}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {batch.strainName || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {batch.supplier || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDate(batch.harvestDate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          isExpired(batch.expirationDate)
                            ? 'text-red-400 font-medium'
                            : isExpiringSoon(batch.expirationDate)
                            ? 'text-amber-400 font-medium'
                            : 'text-slate-300'
                        }
                      >
                        {formatDate(batch.expirationDate)}
                        {isExpired(batch.expirationDate) && (
                          <span className="ml-1 text-xs">(EXPIRED)</span>
                        )}
                        {isExpiringSoon(batch.expirationDate) && (
                          <span className="ml-1 text-xs">(soon)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {batch.currentPotencyThc != null
                        ? `${batch.currentPotencyThc}%`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-bold">
                {editingBatch ? 'Edit Batch' : 'Add Batch'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Lot Number */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Lot Number <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.lotNumber}
                    onChange={(e) => updateField('lotNumber', e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="LOT-..."
                    required
                  />
                  {!editingBatch && (
                    <button
                      type="button"
                      onClick={() => updateField('lotNumber', generateLotNumber())}
                      className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-xs transition-colors"
                    >
                      Generate
                    </button>
                  )}
                </div>
              </div>

              {/* Strain */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Strain
                </label>
                <select
                  value={formData.strainId}
                  onChange={(e) => updateField('strainId', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">Select strain...</option>
                  {strains?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Supplier
                </label>
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => updateField('supplier', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  placeholder="Supplier name"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Harvest Date
                  </label>
                  <input
                    type="date"
                    value={formData.harvestDate}
                    onChange={(e) => updateField('harvestDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Production Date
                  </label>
                  <input
                    type="date"
                    value={formData.productionDate}
                    onChange={(e) => updateField('productionDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => updateField('expirationDate', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Current THC %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.currentPotencyThc}
                    onChange={(e) => updateField('currentPotencyThc', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Lab Results */}
              <div>
                <button
                  type="button"
                  onClick={() => setLabResultsExpanded(!labResultsExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                >
                  <span
                    className={`transition-transform ${
                      labResultsExpanded ? 'rotate-90' : ''
                    }`}
                  >
                    ▶
                  </span>
                  Lab Results (JSON)
                </button>
                {labResultsExpanded && (
                  <textarea
                    value={formData.labResults}
                    onChange={(e) => updateField('labResults', e.target.value)}
                    rows={6}
                    className="mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                    placeholder='{"thc": 22.5, "cbd": 0.3, ...}'
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving
                    ? 'Saving...'
                    : editingBatch
                    ? 'Update Batch'
                    : 'Create Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
