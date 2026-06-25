'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import RoleGate from '@/components/RoleGate';
import { DailySalesSummary } from './components/DailySalesSummary';
import { CashDrawerReconciliation } from './components/CashDrawerReconciliation';
import { VoidRefundLog } from './components/VoidRefundLog';

type Tab = 'daily-sales' | 'drawer-reconciliation' | 'voids-refunds';

function todayStr(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('daily-sales');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [locationId, setLocationId] = useState<string | null>(
    user?.locationId ?? null,
  );

  // For void/refund log date range
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: selectedDate,
    to: selectedDate,
  });

  const isMultiLocation = user?.role === 'admin' && !user?.locationId;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'daily-sales', label: 'Daily Sales' },
    { key: 'drawer-reconciliation', label: 'Drawer Reconciliation' },
    { key: 'voids-refunds', label: 'Voids & Refunds' },
  ];

  return (
    <RoleGate allowedRoles={['shift_manager', 'store_manager', 'admin']}>
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Header */}
        <header className="border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold">Reports</h1>
              <p className="text-sm text-slate-400 mt-1">
                Sales summaries, drawer reconciliation, and audit logs
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isMultiLocation && (
                <div className="text-sm">
                  <label className="text-slate-400 mr-2">Location:</label>
                  <select
                    value={locationId || ''}
                    onChange={(e) =>
                      setLocationId(e.target.value || null)
                    }
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  >
                    <option value="">All Locations</option>
                    <option value="loc-1">Downtown</option>
                    <option value="loc-2">Uptown</option>
                  </select>
                </div>
              )}
              <div className="text-sm text-slate-400">
                {user?.fullName} · {user?.role?.replace(/_/g, ' ')}
              </div>
            </div>
          </div>
        </header>

        {/* Date picker row */}
        <div className="border-b border-slate-700 px-6 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            {activeTab === 'voids-refunds' ? (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">From:</label>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, from: e.target.value }))
                    }
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">To:</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, to: e.target.value }))
                    }
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-400" htmlFor="report-date">
                  {activeTab === 'daily-sales'
                    ? 'Sales Date'
                    : 'Drawer Date'}
                  :
                </label>
                <input
                  id="report-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setDateRange({ from: e.target.value, to: e.target.value });
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <span className="text-sm text-slate-400">
                  {formatDateLabel(selectedDate)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700 px-6">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'daily-sales' && (
            <DailySalesSummary
              date={selectedDate}
              locationId={locationId}
            />
          )}
          {activeTab === 'drawer-reconciliation' && (
            <CashDrawerReconciliation
              date={selectedDate}
              locationId={locationId}
            />
          )}
          {activeTab === 'voids-refunds' && (
            <VoidRefundLog
              from={dateRange.from}
              to={dateRange.to}
              locationId={locationId}
            />
          )}
        </div>
      </div>
    </RoleGate>
  );
}
