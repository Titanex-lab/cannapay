'use client';

import { useState } from 'react';
import { ProductTable } from './components/ProductTable';
import { StrainManager } from './components/StrainManager';
import { BatchManager } from './components/BatchManager';
import { AdjustmentModal } from './components/AdjustmentModal';
import { AdjustmentHistory } from './components/AdjustmentHistory';
import { useAuthStore } from '@/lib/store';

type Tab = 'products' | 'strains' | 'batches' | 'adjustments';

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>('products');

  // Shared state for cross-component communication
  const [adjustmentProductId, setAdjustmentProductId] = useState<string | null>(null);
  const [adjustmentProductName, setAdjustmentProductName] = useState<string>('');
  const [adjustmentCurrentStock, setAdjustmentCurrentStock] = useState<number>(0);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  const openAdjustment = (productId: string, name: string, stock: number) => {
    setAdjustmentProductId(productId);
    setAdjustmentProductName(name);
    setAdjustmentCurrentStock(stock);
    setAdjustmentOpen(true);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'products', label: 'Products' },
    { key: 'strains', label: 'Strains' },
    { key: 'batches', label: 'Batches' },
    { key: 'adjustments', label: 'Adjustments' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Inventory Management</h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage products, strains, batches, and stock adjustments
            </p>
          </div>
          <div className="text-sm text-slate-400">
            {user?.fullName} · {user?.role}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-700 px-3 sm:px-6">
        <nav className="flex gap-0.5 sm:gap-1 -mb-px overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
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
        {activeTab === 'products' && (
          <ProductTable onAdjust={openAdjustment} />
        )}
        {activeTab === 'strains' && <StrainManager />}
        {activeTab === 'batches' && <BatchManager />}
        {activeTab === 'adjustments' && <AdjustmentHistory />}
      </div>

      {/* Adjustment Modal */}
      <AdjustmentModal
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        productId={adjustmentProductId}
        productName={adjustmentProductName}
        currentStock={adjustmentCurrentStock}
      />
    </div>
  );
}
