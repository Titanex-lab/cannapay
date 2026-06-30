'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ProductForm } from './ProductForm';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  strainId: string | null;
  strainName?: string;
  sellPrice: number;
  costPrice: number;
  unitType: string;
  weight: number | null;
  barcode: string | null;
  taxCategory: string;
  isActive: boolean;
  stock: number;
  batchId?: string;
  batchLotNumber?: string;
}

interface Props {
  onAdjust: (productId: string, name: string, stock: number) => void;
}

const CATEGORIES = [
  'All',
  'Flower',
  'Pre-roll',
  'Vape',
  'Edible',
  'Concentrate',
  'Topical',
  'Accessory',
];

const CATEGORY_COLORS: Record<string, string> = {
  Flower: 'bg-purple-500/20 text-purple-300',
  'Pre-roll': 'bg-amber-500/20 text-amber-300',
  Vape: 'bg-cyan-500/20 text-cyan-300',
  Edible: 'bg-pink-500/20 text-pink-300',
  Concentrate: 'bg-orange-500/20 text-orange-300',
  Topical: 'bg-teal-500/20 text-teal-300',
  Accessory: 'bg-slate-500/20 text-slate-300',
};

const STOCK_COLORS = {
  critical: 'text-red-400',
  low: 'text-amber-400',
  good: 'text-emerald-400',
};

function getStockColor(stock: number): string {
  if (stock <= 0) return STOCK_COLORS.critical;
  if (stock <= 10) return STOCK_COLORS.low;
  return STOCK_COLORS.good;
}

function getStockLabel(stock: number): string {
  if (stock <= 0) return 'Out of stock';
  if (stock <= 5) return 'Critical';
  if (stock <= 10) return 'Low';
  return 'In stock';
}

export function ProductTable({ onAdjust }: Props) {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const { data: products, isLoading, isError, error } = useQuery<Product[]>({
    queryKey: ['products', categoryFilter, search],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (categoryFilter !== 'All') params.category = categoryFilter;
      if (search) params.search = search;
      const res = await api.get('/products', { params });
      return res.data.data ?? [];
    },
    placeholderData: [],
  });

  const handleAdd = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormOpen(true);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingProduct(null);
  };

  const handleFormSuccess = () => {
    handleFormClose();
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-64"
          />
        </div>
        <button
          onClick={handleAdd}
          className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded flex-1" />
                <div className="h-4 bg-slate-700 rounded w-24" />
                <div className="h-4 bg-slate-700 rounded w-16" />
                <div className="h-4 bg-slate-700 rounded w-20" />
                <div className="h-4 bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-400 mb-2">Failed to load products</p>
            <p className="text-sm text-slate-400">
              {(error as Error)?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
              className="mt-3 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Try again
            </button>
          </div>
        ) : !products || !Array.isArray(products) || products.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-slate-400 text-lg mb-2">No products found</p>
            <p className="text-sm text-slate-500 mb-4">
              {search || categoryFilter !== 'All'
                ? 'Try adjusting your filters'
                : 'Get started by adding your first product'}
            </p>
            {!search && categoryFilter === 'All' && (
              <button
                onClick={handleAdd}
                className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                + Add Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="px-4 py-3 font-medium text-slate-400">SKU</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Category</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Strain</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Price</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Stock</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => handleEdit(product)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {product.sku}
                    </td>
                    <td className="px-4 py-3 font-medium">{product.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          CATEGORY_COLORS[product.category] || 'bg-slate-500/20 text-slate-300'
                        }`}
                      >
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {product.strainName || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      R {(product.sellPrice ?? 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${getStockColor(product.stock)}`}>
                        {product.stock}
                      </span>
                      <span className={`ml-2 text-xs ${getStockColor(product.stock)}`}>
                        ({getStockLabel(product.stock)})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          product.isActive
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjust(product.id, product.name, product.stock);
                        }}
                        className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs font-medium transition-colors"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      {formOpen && (
        <ProductForm
          product={editingProduct}
          onClose={handleFormClose}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
