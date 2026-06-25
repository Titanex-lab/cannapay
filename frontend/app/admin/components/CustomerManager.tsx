'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  totalVisits: number;
  totalSpend: number;
  consentSMS: boolean;
  lastVisitAt: string | null;
  locationName: string;
  locationId: string;
  createdAt: string;
}

export function CustomerManager() {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompose, setShowCompose] = useState(false);
  const [messageChannel, setMessageChannel] = useState<'whatsapp' | 'telegram'>('whatsapp');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, locationFilter],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '100' };
      if (search) params.search = search;
      if (locationFilter) params.locationId = locationFilter;
      const { data } = await api.get('/customers', { params });
      return data as { data: Customer[]; total: number };
    },
  });

  const customers = data?.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (locationFilter) params.set('locationId', locationFilter);
    window.open(`/api/customers/export?${params.toString()}`, '_blank');
  };

  const handleSendMessage = async () => {
    if (!message.trim()) {
      toast.error('Message is required');
      return;
    }
    const ids = selectedIds.size > 0 ? [...selectedIds] : customers.map((c) => c.id);
    if (ids.length === 0) {
      toast.error('No recipients selected');
      return;
    }
    setSending(true);
    try {
      const { data } = await api.post(`/messaging/${messageChannel}`, {
        customerIds: ids,
        message: message.trim(),
      });
      toast.success(`Sent: ${data.sent}, Failed: ${data.failed}`);
      setShowCompose(false);
      setMessage('');
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to send messages');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full max-w-xs px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          />
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">All Locations</option>
            <option value="ff733496-c797-4700-92fd-db92e48c6808">CannaPay — Cape Town</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
            Export CSV
          </button>
          <button onClick={() => setShowCompose(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">
            ✉ Send Message
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={customers.length > 0 && selectedIds.size === customers.length}
                    onChange={selectAll} className="rounded border-slate-600 bg-slate-800" />
                </th>
                <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                <th className="px-4 py-3 font-medium text-slate-400">Email</th>
                <th className="px-4 py-3 font-medium text-slate-400">Phone</th>
                <th className="px-4 py-3 font-medium text-slate-400">Visits</th>
                <th className="px-4 py-3 font-medium text-slate-400">Spend</th>
                <th className="px-4 py-3 font-medium text-slate-400">Last Visit</th>
                <th className="px-4 py-3 font-medium text-slate-400">Location</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No customers found</td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)} className="rounded border-slate-600 bg-slate-800" />
                    </td>
                    <td className="px-4 py-3 font-medium">{c.firstName} {c.lastName}</td>
                    <td className="px-4 py-3 text-slate-400">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-400">{c.phone || '—'}</td>
                    <td className="px-4 py-3">{c.totalVisits}</td>
                    <td className="px-4 py-3 font-mono">R {c.totalSpend.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-400">{c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.locationName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
            {data.total} customer{data.total !== 1 ? 's' : ''}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </div>
        )}
      </div>

      {/* Compose panel */}
      {showCompose && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowCompose(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-bold">Send Message</h3>
              <div className="flex gap-2 mb-2">
                {(['whatsapp', 'telegram'] as const).map((ch) => (
                  <button key={ch} onClick={() => setMessageChannel(ch)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      messageChannel === ch ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}>
                    {ch === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-2">
                  Recipients: {selectedIds.size > 0 ? `${selectedIds.size} selected` : `All ${customers.length} customers`}
                </p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Message</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4} maxLength={1000}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500 resize-none"
                  placeholder="Type your message...&#10;&#10;Template format: Hello [name], [message] - CannaPay" />
                <p className="text-xs text-slate-500 mt-1">{message.length}/1000</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompose(false)}
                  className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
                <button onClick={handleSendMessage} disabled={sending || !message.trim()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium disabled:opacity-50">
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
