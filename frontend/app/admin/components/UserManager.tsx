'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Types ───────────────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  role: string;
  locationId: string | null;
  locationName?: string;
  pin?: string;
  active: boolean;
  createdAt?: string;
}

interface LocationRecord {
  id: string;
  name: string;
}

interface UserFormData {
  fullName: string;
  email: string;
  password: string;
  pin: string;
  role: string;
  locationId: string;
  active: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const ROLES = ['budtender', 'shift_manager', 'store_manager', 'admin'];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/20 text-red-300 border border-red-500/30',
  store_manager: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  shift_manager: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  budtender: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  store_manager: 'Store Manager',
  shift_manager: 'Shift Manager',
  budtender: 'Budtender',
};

const EMPTY_FORM: UserFormData = {
  fullName: '',
  email: '',
  password: '',
  pin: '',
  role: 'budtender',
  locationId: '',
  active: true,
};

// ── Component ───────────────────────────────────────────────────────────────

export function UserManager() {
  const queryClient = useQueryClient();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // ── Queries ─────────────────────────────────────────────────────────────

  const { data: users, isLoading, isError, error } = useQuery<UserRecord[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data } = await api.get('/admin');
      return data.users ?? data;
    },
    retry: false,
  });

  const { data: locations } = useQuery<LocationRecord[]>({
    queryKey: ['admin', 'locations'],
    queryFn: async () => {
      const res = await api.get('/admin/locations');
      return res.data ?? [];
    },
    placeholderData: [],
  });

  // ── Mutations ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (formData: UserFormData) => {
      const payload = {
        fullName: formData.fullName,
        email: formData.email,
        role: formData.role,
        locationId: formData.locationId || null,
        active: formData.active,
        ...(formData.password ? { password: formData.password } : {}),
        ...(formData.pin ? { pin: formData.pin } : {}),
      };

      if (editingUser) {
        await api.put(`/admin/${editingUser.id}`, payload);
      } else {
        await api.post('/admin', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(editingUser ? 'User updated' : 'User created');
      closeModal();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Failed to save user';
      toast.error(msg);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: UserRecord) => {
      await api.patch(`/admin/${user.id}`, { active: !user.active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('User status updated');
    },
    onError: () => toast.error('Failed to update user status'),
  });

  const resetPinMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/admin/${userId}/reset-pin`);
    },
    onSuccess: () => {
      toast.success('PIN reset. New PIN has been generated.');
    },
    onError: () => toast.error('Failed to reset PIN'),
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (user: UserRecord) => {
    setEditingUser(user);
    setForm({
      fullName: user.fullName,
      email: user.email,
      password: '',
      pin: '',
      role: user.role,
      locationId: user.locationId || '',
      active: user.active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setSaving(false);
  };

  const handleSave = () => {
    if (!form.fullName.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (!editingUser && !form.password.trim()) {
      toast.error('Password is required for new users');
      return;
    }
    saveMutation.mutate(form);
  };

  const updateField = (field: keyof UserFormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Filter ─────────────────────────────────────────────────────────────

  const filtered = (users || []).filter((u) => {
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !u.fullName.toLowerCase().includes(s) &&
        !u.email.toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            <option value="All">All Roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-64"
          />
        </div>
        <button
          onClick={openAddModal}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          + Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-32" />
                <div className="h-4 bg-slate-700 rounded w-48" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-amber-400 mb-2">Unable to load users</p>
            <p className="text-sm text-slate-400 mb-4">
              {(error as Error)?.message || 'API endpoint not yet available'}
            </p>
            <div className="text-xs text-slate-500 max-w-md mx-auto space-y-1">
              <p>
                The admin user management backend routes need to be created at:
              </p>
              <code className="block bg-slate-700/50 px-2 py-1 rounded text-slate-400">
                GET /api/admin
              </code>
              <p className="mt-2">Once wired up, this table will populate automatically.</p>
            </div>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
              className="mt-4 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-slate-400 text-lg mb-2">No users found</p>
            <p className="text-sm text-slate-500 mb-4">
              {search || roleFilter !== 'All'
                ? 'Try adjusting your filters'
                : 'Add your first user to get started'}
            </p>
            {!search && roleFilter === 'All' && (
              <button
                onClick={openAddModal}
                className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + Add User
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Email</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Role</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Location</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => openEditModal(user)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{user.fullName}</td>
                    <td className="px-4 py-3 text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          ROLE_COLORS[user.role] || 'bg-slate-500/20 text-slate-300'
                        }`}
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {user.locationName || user.locationId || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          user.active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActiveMutation.mutate(user);
                          }}
                          disabled={toggleActiveMutation.isPending}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            user.active
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                          }`}
                        >
                          {user.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Reset PIN for ${user.fullName}? A new PIN will be generated.`)) {
                              resetPinMutation.mutate(user.id);
                            }
                          }}
                          disabled={resetPinMutation.isPending}
                          className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs font-medium transition-colors text-slate-300"
                        >
                          Reset PIN
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add / Edit User */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-700 shrink-0">
              <h2 className="font-bold text-lg">
                {editingUser ? 'Edit User' : 'Add User'}
              </h2>
              <button
                onClick={closeModal}
                className="text-slate-500 hover:text-white transition-colors p-1"
                aria-label="Close"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="john@dispensary.com"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Password{' '}
                  {!editingUser && <span className="text-red-400">*</span>}
                  {editingUser && (
                    <span className="text-slate-600"> (leave blank to keep unchanged)</span>
                  )}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Min. 8 characters'}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* PIN */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  PIN <span className="text-slate-600">(6-digit, for quick register login)</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    updateField('pin', digits);
                  }}
                  placeholder="000000"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors tracking-widest"
                />
              </div>

              {/* Role + Location (side by side) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => updateField('role', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Location</label>
                  <select
                    value={form.locationId}
                    onChange={(e) => updateField('locationId', e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="">— Select —</option>
                    {(locations || []).map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between bg-slate-800 rounded-lg p-3 border border-slate-700">
                <div>
                  <p className="text-sm text-slate-200 font-medium">Active</p>
                  <p className="text-xs text-slate-400">
                    Inactive users cannot log in
                  </p>
                </div>
                <button
                  onClick={() => updateField('active', !form.active)}
                  className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
                    form.active ? 'bg-emerald-600' : 'bg-slate-600'
                  }`}
                  role="switch"
                  aria-checked={form.active}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      form.active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center gap-3 p-5 border-t border-slate-700 shrink-0">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
              >
                {saveMutation.isPending ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
