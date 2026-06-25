'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Strain {
  id: string;
  name: string;
  type: 'indica' | 'sativa' | 'hybrid';
  thcPercent: number | null;
  cbdPercent: number | null;
  terpeneProfile: string | null;
  aliases: string[];
}

const STRAIN_TYPE_COLORS: Record<string, string> = {
  indica: 'bg-purple-500/20 text-purple-300',
  sativa: 'bg-orange-500/20 text-orange-300',
  hybrid: 'bg-green-500/20 text-green-300',
};

const STRAIN_TYPES = ['indica', 'sativa', 'hybrid'];

interface StrainFormData {
  name: string;
  type: 'indica' | 'sativa' | 'hybrid';
  thcPercent: string;
  cbdPercent: string;
  terpeneProfile: string;
  aliases: string[];
}

const emptyForm: StrainFormData = {
  name: '',
  type: 'hybrid',
  thcPercent: '',
  cbdPercent: '',
  terpeneProfile: '',
  aliases: [],
};

export function StrainManager() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStrain, setEditingStrain] = useState<Strain | null>(null);
  const [formData, setFormData] = useState<StrainFormData>(emptyForm);
  const [aliasInput, setAliasInput] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: strains, isLoading, isError, error } = useQuery<Strain[]>({
    queryKey: ['strains'],
    queryFn: async () => {
      const res = await api.get('/strains');
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const openAdd = () => {
    setEditingStrain(null);
    setFormData(emptyForm);
    setAliasInput('');
    setModalOpen(true);
  };

  const openEdit = (strain: Strain) => {
    setEditingStrain(strain);
    setFormData({
      name: strain.name,
      type: strain.type,
      thcPercent: strain.thcPercent?.toString() || '',
      cbdPercent: strain.cbdPercent?.toString() || '',
      terpeneProfile: strain.terpeneProfile || '',
      aliases: strain.aliases || [],
    });
    setAliasInput('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingStrain(null);
  };

  const handleAddAlias = () => {
    const trimmed = aliasInput.trim();
    if (trimmed && !formData.aliases.includes(trimmed)) {
      setFormData((prev) => ({ ...prev, aliases: [...prev.aliases, trimmed] }));
    }
    setAliasInput('');
  };

  const handleAliasKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAlias();
    }
  };

  const removeAlias = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      aliases: prev.aliases.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Strain name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        thcPercent: formData.thcPercent ? parseFloat(formData.thcPercent) : null,
        cbdPercent: formData.cbdPercent ? parseFloat(formData.cbdPercent) : null,
        terpeneProfile: formData.terpeneProfile || null,
        aliases: formData.aliases,
      };

      if (editingStrain) {
        await api.put(`/strains/${editingStrain.id}`, payload);
        toast.success('Strain updated');
      } else {
        await api.post('/strains', payload);
        toast.success('Strain created');
      }

      queryClient.invalidateQueries({ queryKey: ['strains'] });
      closeModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.response?.data?.message || 'Failed to save strain');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Strain
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-32" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-16" />
                <div className="h-4 bg-slate-700 rounded w-16" />
                <div className="h-4 bg-slate-700 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-400 mb-2">Failed to load strains</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['strains'] })}
              className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Try again
            </button>
          </div>
        ) : !strains || strains.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">🌿</div>
            <p className="text-slate-400 text-lg mb-2">No strains defined</p>
            <p className="text-sm text-slate-500 mb-4">
              Add strains to categorize your products
            </p>
            <button
              onClick={openAdd}
              className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + Add Strain
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-4 py-3 font-medium text-slate-400">THC %</th>
                  <th className="px-4 py-3 font-medium text-slate-400">CBD %</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Aliases</th>
                </tr>
              </thead>
              <tbody>
                {strains.map((strain) => (
                  <tr
                    key={strain.id}
                    onClick={() => openEdit(strain)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{strain.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          STRAIN_TYPE_COLORS[strain.type] || 'bg-slate-500/20 text-slate-300'
                        }`}
                      >
                        {strain.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {strain.thcPercent != null ? `${strain.thcPercent}%` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {strain.cbdPercent != null ? `${strain.cbdPercent}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {strain.aliases?.length > 0
                          ? strain.aliases.slice(0, 3).map((a, i) => (
                              <span
                                key={i}
                                className="inline-block px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-300"
                              >
                                {a}
                              </span>
                            ))
                          : '—'}
                        {strain.aliases?.length > 3 && (
                          <span className="text-xs text-slate-500">
                            +{strain.aliases.length - 3}
                          </span>
                        )}
                      </div>
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
          <div className="relative bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto m-4">
            {/* Header */}
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="text-lg font-bold">
                {editingStrain ? 'Edit Strain' : 'Add Strain'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
              >
                ✕
              </button>
            </div>

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
                  placeholder="Strain name"
                  required
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {STRAIN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* THC % and CBD % */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    THC %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.thcPercent}
                    onChange={(e) => updateField('thcPercent', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    CBD %
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.cbdPercent}
                    onChange={(e) => updateField('cbdPercent', e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Terpene Profile */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Terpene Profile
                </label>
                <textarea
                  value={formData.terpeneProfile}
                  onChange={(e) => updateField('terpeneProfile', e.target.value)}
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                  placeholder="Describe the terpene profile..."
                />
              </div>

              {/* Aliases (tag input) */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Aliases
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {formData.aliases.map((alias, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-200"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => removeAlias(i)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aliasInput}
                    onChange={(e) => setAliasInput(e.target.value)}
                    onKeyDown={handleAliasKeyDown}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    placeholder="Type and press Enter to add"
                  />
                  <button
                    type="button"
                    onClick={handleAddAlias}
                    className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    Add
                  </button>
                </div>
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
                    : editingStrain
                    ? 'Update Strain'
                    : 'Create Strain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
