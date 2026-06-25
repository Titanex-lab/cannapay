'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  strainId: string | null;
  strainName?: string;
  price: number;
  costPrice: number;
  unitType: string;
  weight: number | null;
  barcode: string | null;
  taxCategory: string;
  active: boolean;
  stock: number;
  batchId?: string;
  batchLotNumber?: string;
}

interface Strain {
  id: string;
  name: string;
}

interface Batch {
  id: string;
  lotNumber: string;
  strainId: string;
}

interface Props {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  'Flower',
  'Pre-roll',
  'Vape',
  'Edible',
  'Concentrate',
  'Topical',
  'Accessory',
];

const UNIT_TYPES = ['each', 'gram', 'eighth', 'quarter', 'half', 'ounce'];

const TAX_CATEGORIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'excise_flower', label: 'Excise - Flower' },
  { value: 'excise_edible', label: 'Excise - Edible' },
  { value: 'excise_concentrate', label: 'Excise - Concentrate' },
  { value: 'no_tax', label: 'No Tax' },
];

const WEIGHT_UNITS = ['gram', 'eighth', 'quarter', 'half', 'ounce'];

function generateSKU(): string {
  const prefix = 'PRD';
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

export function ProductForm({ product, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(product);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Flower',
    strainId: '',
    batchId: '',
    costPrice: '',
    sellPrice: '',
    unitType: 'each',
    weight: '',
    barcode: '',
    taxCategory: 'standard',
    active: true,
  });
  const [strainSearch, setStrainSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch strains
  const { data: strains } = useQuery<Strain[]>({
    queryKey: ['strains'],
    queryFn: async () => {
      const res = await api.get('/strains');
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  // Fetch batches filtered by strain
  const { data: batches } = useQuery<Batch[]>({
    queryKey: ['batches', formData.strainId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (formData.strainId) params.strainId = formData.strainId;
      const res = await api.get('/batches', { params });
      return res.data.data ?? [];
    },
    enabled: Boolean(formData.strainId),
    placeholderData: [],
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        sku: product.sku,
        category: product.category,
        strainId: product.strainId || '',
        batchId: product.batchId || '',
        costPrice: product.costPrice?.toString() || '',
        sellPrice: product.price?.toString() || '',
        unitType: product.unitType,
        weight: product.weight?.toString() || '',
        barcode: product.barcode || '',
        taxCategory: product.taxCategory,
        active: product.active ?? true,
      });
    } else {
      setFormData((prev) => ({ ...prev, sku: generateSKU() }));
    }
  }, [product]);

  const filteredStrains = strains?.filter((s) =>
    s.name.toLowerCase().includes(strainSearch.toLowerCase())
  ) || [];

  const isWeightBased = WEIGHT_UNITS.includes(formData.unitType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku,
        category: formData.category,
        strainId: formData.strainId || null,
        batchId: formData.batchId || null,
        costPrice: parseFloat(formData.costPrice) || 0,
        price: parseFloat(formData.sellPrice) || 0,
        unitType: formData.unitType,
        weight: isWeightBased ? (parseFloat(formData.weight) || null) : null,
        barcode: formData.barcode || null,
        taxCategory: formData.taxCategory,
        active: formData.active,
      };

      if (isEdit && product) {
        await api.put(`/products/${product.id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product created');
      }

      queryClient.invalidateQueries({ queryKey: ['products'] });
      onSuccess();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // Reset batch when strain changes
      if (field === 'strainId') {
        next.batchId = '';
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-lg font-bold">
            {isEdit ? 'Edit Product' : 'Add Product'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="Product name"
              required
            />
          </div>

          {/* SKU (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              SKU
            </label>
            <input
              type="text"
              value={formData.sku}
              readOnly
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono cursor-not-allowed"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => updateField('category', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Strain (searchable select) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Strain
            </label>
            <div className="relative">
              <input
                type="text"
                value={
                  formData.strainId
                    ? strains?.find((s) => s.id === formData.strainId)?.name || strainSearch
                    : strainSearch
                }
                onChange={(e) => {
                  setStrainSearch(e.target.value);
                  if (!e.target.value) updateField('strainId', '');
                }}
                placeholder="Search strains..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
              {formData.strainId && (
                <button
                  type="button"
                  onClick={() => {
                    updateField('strainId', '');
                    setStrainSearch('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>
            {strainSearch && !formData.strainId && (
              <div className="mt-1 bg-slate-900 border border-slate-700 rounded-lg max-h-36 overflow-y-auto">
                {filteredStrains.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500">No strains found</div>
                ) : (
                  filteredStrains.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        updateField('strainId', s.id);
                        setStrainSearch('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors"
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Batch */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Batch
            </label>
            <select
              value={formData.batchId}
              onChange={(e) => updateField('batchId', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
              disabled={!formData.strainId}
            >
              <option value="">{formData.strainId ? 'Select batch...' : 'Select a strain first'}</option>
              {batches?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.lotNumber}
                </option>
              ))}
            </select>
          </div>

          {/* Price fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Cost Price (R)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.costPrice}
                onChange={(e) => updateField('costPrice', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Sell Price (R)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.sellPrice}
                onChange={(e) => updateField('sellPrice', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Unit Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Unit Type
            </label>
            <select
              value={formData.unitType}
              onChange={(e) => updateField('unitType', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Weight (only for weight-based units) */}
          {isWeightBased && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Weight (grams)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.weight}
                onChange={(e) => updateField('weight', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Barcode */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Barcode (optional)
            </label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => updateField('barcode', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="Scan or type barcode"
            />
          </div>

          {/* Tax Category */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Tax Category
            </label>
            <select
              value={formData.taxCategory}
              onChange={(e) => updateField('taxCategory', e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              {TAX_CATEGORIES.map((tc) => (
                <option key={tc.value} value={tc.value}>
                  {tc.label}
                </option>
              ))}
            </select>
          </div>

          {/* Active checkbox */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => updateField('active', e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50"
            />
            <span className="text-sm text-slate-300">Active</span>
          </label>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
