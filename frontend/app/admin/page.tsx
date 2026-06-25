'use client';

import { useState } from 'react';
import RoleGate from '@/components/RoleGate';
import { UserManager } from './components/UserManager';
import { LocationSettings } from './components/LocationSettings';
import { CustomerManager } from './components/CustomerManager';

type Tab = 'users' | 'location' | 'customers';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'location', label: 'Location', icon: '📍' },
  { key: 'customers', label: 'Customers', icon: '👤' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users');

  return (
    <RoleGate allowedRoles={['admin', 'store_manager']}>
      <div className="h-screen w-screen flex flex-col bg-slate-900 text-white">
        {/* Header */}
        <header className="h-14 border-b border-slate-700 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-lg">Admin</h1>
            <span className="text-slate-600 text-sm">|</span>
            <span className="text-sm text-slate-400">
              Manage users, roles, and location settings
            </span>
          </div>
        </header>

        {/* Tab bar */}
        <nav className="flex border-b border-slate-700 shrink-0 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'users' && <UserManager />}
          {activeTab === 'location' && <LocationSettings />}
          {activeTab === 'customers' && <CustomerManager />}
        </main>
      </div>
    </RoleGate>
  );
}
