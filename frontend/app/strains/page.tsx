'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

interface Strain {
  id: string;
  name: string;
  type: 'indica' | 'sativa' | 'hybrid';
  thcPercent: number | null;
  cbdPercent: number | null;
  terpeneProfile: string | null;
  aliases: string[];
  _count?: { batches: number; products: number };
}

const TYPE_COLORS: Record<string, string> = {
  indica: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  sativa: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  hybrid: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

export default function StrainsPage() {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);

  // Resolve token with localStorage fallback
  const getToken = () => {
    if (token) return token;
    try {
      const raw = localStorage.getItem('auth-storage');
      if (raw) return JSON.parse(raw)?.state?.token;
    } catch {}
    return null;
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStrain, setEditingStrain] = useState<Strain | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<'indica' | 'sativa' | 'hybrid'>('hybrid');
  const [thcPercent, setThcPercent] = useState('');
  const [cbdPercent, setCbdPercent] = useState('');
  const [terpeneProfile, setTerpeneProfile] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);

  // Leafly lookup
  const [leaflyQuery, setLeaflyQuery] = useState('');
  const [leaflyLoading, setLeaflyLoading] = useState(false);
  const [leaflyResult, setLeaflyResult] = useState<any>(null);
  const [leaflySuggestions, setLeaflySuggestions] = useState<any[]>([]);

  // Debounced Leafly search (backend proxy)
  useEffect(() => {
    if (leaflyQuery.length < 1) { setLeaflyResult(null); setLeaflySuggestions([]); return; }
    const timer = setTimeout(async () => {
      setLeaflyLoading(true);
      try {
        // Detail lookup
        const { data } = await api.get('/strains/leafly', { params: { name: leaflyQuery } });
        setLeaflyResult(data);
        // Suggestions
        const { data: sugg } = await api.get('/strains/leafly/search', { params: { q: leaflyQuery } });
        setLeaflySuggestions(sugg || []);
      } catch { setLeaflyResult(null); setLeaflySuggestions([]); }
      finally { setLeaflyLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [leaflyQuery]);

  const { data: strains = [], isLoading, isError } = useQuery<Strain[]>({
    queryKey: ['strains'],
    queryFn: async () => {
      const res = await api.get('/strains');
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/strains/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strains'] });
      toast.success('Strain deleted');
    },
    onError: () => toast.error('Failed to delete strain'),
  });

  const openCreate = () => {
    setEditingStrain(null);
    setName('');
    setType('hybrid');
    setThcPercent('');
    setCbdPercent('');
    setTerpeneProfile('');
    setAliases([]);
    setAliasInput('');
    setModalOpen(true);
  };

  const openEdit = (s: Strain) => {
    setEditingStrain(s);
    setName(s.name);
    setType(s.type);
    setThcPercent(s.thcPercent?.toString() || '');
    setCbdPercent(s.cbdPercent?.toString() || '');
    setTerpeneProfile(s.terpeneProfile || '');
    setAliases(s.aliases || []);
    setAliasInput('');
    setModalOpen(true);
  };

  const addAlias = () => {
    const a = aliasInput.trim();
    if (a && !aliases.includes(a)) {
      setAliases([...aliases, a]);
      setAliasInput('');
    }
  };

  const removeAlias = (a: string) => setAliases(aliases.filter(x => x !== a));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (saving) return; // prevent double-submit
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        type,
        thcPercent: thcPercent ? parseFloat(thcPercent) : undefined,
        cbdPercent: cbdPercent ? parseFloat(cbdPercent) : undefined,
        terpeneProfile: terpeneProfile.trim() || undefined,
        aliases,
      };
      const headers: Record<string, string> = {};
      const t = getToken();
      if (t) headers.Authorization = `Bearer ${t}`;

      if (editingStrain) {
        await api.put(`/strains/${editingStrain.id}`, body, { headers });
        toast.success('Strain updated');
      } else {
        await api.post('/strains', body, { headers });
        toast.success('Strain created');
      }
      queryClient.invalidateQueries({ queryKey: ['strains'] });
      setModalOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err?.message
        || 'Failed to save strain';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Strains</h1>
            <p className="text-sm text-slate-400 mt-1">Manage cannabis strain catalog</p>
          </div>
          <button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Add Strain
          </button>
        </div>

        {/* Table */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {isLoading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-700 rounded animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-red-400">Failed to load strains</div>
          ) : strains.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3">🧬</div>
              <p className="text-slate-400">No strains yet</p>
              <button onClick={openCreate} className="mt-3 text-sm text-emerald-400 hover:text-emerald-300">Add your first strain</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-5 py-3 font-medium text-slate-400">Name</th>
                  <th className="px-5 py-3 font-medium text-slate-400">Type</th>
                  <th className="px-5 py-3 font-medium text-slate-400">THC%</th>
                  <th className="px-5 py-3 font-medium text-slate-400">CBD%</th>
                  <th className="px-5 py-3 font-medium text-slate-400">Aliases</th>
                  <th className="px-5 py-3 font-medium text-slate-400">Products</th>
                  <th className="px-5 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {strains.map((s) => (
                  <tr key={s.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{s.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[s.type] || 'bg-slate-500/20 text-slate-300'}`}>
                        {s.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{s.thcPercent != null ? `${s.thcPercent}%` : '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{s.cbdPercent != null ? `${s.cbdPercent}%` : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(s.aliases || []).slice(0, 3).map((a) => (
                          <span key={a} className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-400">{a}</span>
                        ))}
                        {(s.aliases || []).length > 3 && (
                          <span className="px-1.5 py-0.5 bg-slate-700 rounded text-xs text-slate-500">+{s.aliases.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-400">{(s._count?.products ?? 0)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(s)} className="text-sm text-emerald-400 hover:text-emerald-300">Edit</button>
                        <button onClick={() => { if (confirm(`Delete ${s.name}?`)) deleteMutation.mutate(s.id); }} className="text-sm text-red-400 hover:text-red-300">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setModalOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-white mb-4">{editingStrain ? 'Edit Strain' : 'New Strain'}</h2>
              <div className="space-y-4">
                {/* Leafly lookup */}
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Search Leafly for strain info</label>
                  <input value={leaflyQuery} onChange={e => setLeaflyQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. Blue Dream, Wedding Cake..." />
                  {leaflySuggestions.length > 0 && !leaflyResult && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                      {leaflySuggestions.map((s: any) => (
                        <button key={s.slug} onClick={async () => {
                          setLeaflyQuery(s.name);
                          // Trigger detail fetch for this specific strain
                          try {
                            const { data } = await api.get('/strains/leafly', { params: { name: s.slug } });
                            if (data?.name) {
                              setLeaflyResult(data);
                              setLeaflySuggestions([]);
                            }
                          } catch {}
                        }} className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 border-b border-slate-700 last:border-0">
                          <span className="font-medium text-white">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {leaflyLoading && <p className="text-xs text-slate-500 mt-1">Searching Leafly...</p>}
                  {leaflyResult && leaflyResult.name && (
                    <div className="mt-2 p-3 bg-slate-800/50 border border-emerald-500/30 rounded-lg">
                      <p className="text-sm font-medium text-emerald-400">{leaflyResult.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{leaflyResult.category} · THC {leaflyResult.thcPercent}% · CBD {leaflyResult.cbdPercent}%</p>
                      {leaflyResult.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{leaflyResult.description}</p>}
                      <button onClick={() => {
                        setName(leaflyResult.name);
                        const t = leaflyResult.category?.toLowerCase();
                        if (t === 'indica' || t === 'sativa' || t === 'hybrid') setType(t);
                        if (leaflyResult.thcPercent != null) setThcPercent(String(leaflyResult.thcPercent));
                        if (leaflyResult.cbdPercent != null) setCbdPercent(String(leaflyResult.cbdPercent));
                        if (leaflyResult.description) setTerpeneProfile(leaflyResult.description);
                        setLeaflyResult(null);
                        setLeaflyQuery('');
                        toast.success('Strain info loaded from Leafly');
                      }} className="mt-2 text-xs bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded font-medium transition-colors">
                        Fill Form
                      </button>
                    </div>
                  )}
                  {leaflyResult && !leaflyResult.name && leaflyQuery.length >= 2 && !leaflyLoading && (
                    <p className="text-xs text-slate-600 mt-1">No match found on Leafly</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="e.g. Wedding Cake" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Type</label>
                  <select value={type} onChange={e => setType(e.target.value as any)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500">
                    <option value="indica">Indica</option>
                    <option value="sativa">Sativa</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">THC%</label>
                    <input type="number" min="0" max="100" step="0.1" value={thcPercent} onChange={e => setThcPercent(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">CBD%</label>
                    <input type="number" min="0" max="100" step="0.1" value={cbdPercent} onChange={e => setCbdPercent(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Terpene Profile</label>
                  <textarea value={terpeneProfile} onChange={e => setTerpeneProfile(e.target.value)} rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="e.g. Earthy, vanilla, sweet" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Aliases</label>
                  <div className="flex gap-2">
                    <input value={aliasInput} onChange={e => setAliasInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias(); } }} className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="Add alias (Enter to add)" />
                    <button onClick={addAlias} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Add</button>
                  </div>
                  {aliases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {aliases.map(a => (
                        <span key={a} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300 flex items-center gap-1">
                          {a}
                          <button onClick={() => removeAlias(a)} className="text-slate-500 hover:text-red-400">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModalOpen(false)} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Saving...' : editingStrain ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
