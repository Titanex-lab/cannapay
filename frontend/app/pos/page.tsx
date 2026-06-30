'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, useCartStore, type CartItem } from '@/lib/store';
import { api } from '@/lib/api';
import { ProductSearch } from './components/ProductSearch';
import { CartPanel } from './components/CartPanel';
import { LogoutButton } from './components/LogoutButton';
import { CheckoutModal } from './components/CheckoutModal';
import { HoldCartModal } from './components/HoldCartModal';
import { VoidConfirmModal } from './components/VoidConfirmModal';
import { useInventorySync } from '@/hooks/useInventorySync';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function POSPage() {
  const pathname = usePathname();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHoldCart, setShowHoldCart] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showGrid, setShowGrid] = useState(true);

  useInventorySync();

  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const itemCount = useCartStore((s) => s.itemCount());
  const logout = useAuthStore((s) => s.logout);
  const addItem = useCartStore((s) => s.addItem);

  // Fetch active products for the grid
  const { data: productsData } = useQuery({
    queryKey: ['productsGrid', user?.locationId],
    queryFn: () =>
      api
        .get('/products', { params: { limit: 100, isActive: true, locationId: user?.locationId } })
        .then((r) => r.data.data as Array<{
          id: string;
          name: string;
          category: string;
          sellPrice: number;
          unitType: string;
          strain?: { id: string; name: string; type: string } | null;
          inventory?: Array<{ quantity: number }>;
        }>),
    enabled: !!user?.locationId,
    staleTime: 30_000,
  });

  const products = productsData ?? [];

  // Handle search query changes from ProductSearch
  const handleSearchQueryChange = (q: string) => {
    setSearchQuery(q);
    if (q.length > 0) {
      setShowGrid(false);
    } else {
      setShowGrid(true);
    }
  };

  const userRole = user?.role ?? 'budtender';
  const allTabItems = [
    { href: '/pos', label: 'POS', icon: '\uD83C\uDFEA', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/inventory', label: 'Inv', icon: '\uD83D\uDCE6', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/strains', label: 'Strains', icon: '\uD83E\uDDEC', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/reports', label: 'Rpts', icon: '\uD83D\uDCCA', roles: ['shift_manager', 'store_manager', 'admin'] },
    { href: '/admin', label: 'Admin', icon: '\u2699\uFE0F', roles: ['admin'] },
  ].filter((t) => t.roles.includes(userRole));

  // Auto-open cart on first add
  const prevLen = useRef(0);
  if (items.length > 0 && prevLen.current === 0) {
    queueMicrotask(() => setCartOpenMobile(true));
  }
  prevLen.current = items.length;

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100dvh',overflow:'hidden',background:'#020817',color:'white',fontFamily:'system-ui,sans-serif'}}>
      {/* ── Header — 52px ──────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',height:52,flexShrink:0,borderBottom:'1px solid #1e293b',background:'#0f172a'}}>
        <div style={{background:'white',borderRadius:6,padding:'2px 6px'}}>
          <img src="/cannapay-logo.png" alt="CannaPay" style={{height:32,width:'auto',display:'block'}} />
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{color:'#94a3b8',fontSize:13}}>{user?.fullName ?? ''}</span>
          <ThemeToggle />
          <button onClick={handleLogout} style={{padding:'6px 12px',background:'#1e293b',color:'white',border:'1px solid #334155',borderRadius:8,fontSize:13,cursor:'pointer'}}>
            Logout
          </button>
        </div>
      </div>

      {/* ── Search + Results — flex:1, only this scrolls ───────────── */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <ProductSearch onQueryChange={handleSearchQueryChange} />

        {/* Product card grid — shown when search is empty */}
        {showGrid && searchQuery.length === 0 && (
          <div style={{flex:1,overflowY:'auto',padding:'4px 12px 12px'}}>
            {products.length === 0 ? (
              <div style={{textAlign:'center',padding:'40px 0',color:'#64748b',fontSize:14}}>
                <div style={{fontSize:36,marginBottom:8}}>📦</div>
                <p>No products available</p>
                <p style={{fontSize:12,marginTop:4}}>Add products in Inventory</p>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',gap:10,paddingBottom:4}}>
              {products.map((product) => {
                const stockTotal = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) ?? 0;
                const strainType = product.strain?.type?.toLowerCase() ?? '';
                const strainBadgeBg =
                  strainType === 'indica' ? '#a855f7' :
                  strainType === 'sativa' ? '#eab308' :
                  strainType === 'hybrid' ? '#10b981' : '#475569';
                const strainBadgeText =
                  strainType === 'indica' ? '#f3e8ff' :
                  strainType === 'sativa' ? '#fef9c3' :
                  strainType === 'hybrid' ? '#d1fae5' : '#94a3b8';

                const handleAddToCart = () => {
                  const item: CartItem = {
                    productId: product.id,
                    name: product.name,
                    strainName: product.strain?.name,
                    category: product.category,
                    quantity: 1,
                    unitPrice: product.sellPrice,
                    unitType: product.unitType || 'each',
                  };
                  addItem(item);
                };

                return (
                  <div
                    key={product.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleAddToCart}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddToCart(); }}
                    style={{
                      background:'#0f172a',
                      border:'1px solid #1e293b',
                      borderRadius:12,
                      padding:12,
                      cursor:'pointer',
                      display:'flex',
                      flexDirection:'column',
                      gap:6,
                      transition:'box-shadow 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
                      (e.currentTarget as HTMLElement).style.borderColor = '#334155';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '';
                      (e.currentTarget as HTMLElement).style.borderColor = '#1e293b';
                    }}
                  >
                    {/* Product name */}
                    <div style={{fontSize:13,fontWeight:600,color:'#e2e8f0',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                      {product.name}
                    </div>

                    {/* Price */}
                    <div style={{fontSize:15,fontWeight:700,color:'#34d399'}}>
                      R {product.sellPrice.toFixed(2)}
                    </div>

                    {/* Badges row */}
                    <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                      {/* Category badge */}
                      <span style={{
                        display:'inline-block',
                        padding:'2px 6px',
                        borderRadius:4,
                        fontSize:10,
                        fontWeight:500,
                        background:'#1e293b',
                        color:'#94a3b8',
                      }}>
                        {product.category}
                      </span>

                      {/* Strain type badge */}
                      {strainType && (
                        <span style={{
                          display:'inline-block',
                          padding:'2px 6px',
                          borderRadius:4,
                          fontSize:10,
                          fontWeight:600,
                          background: strainBadgeBg,
                          color: strainBadgeText,
                        }}>
                          {strainType}
                        </span>
                      )}
                    </div>

                    {/* Stock count */}
                    <div style={{fontSize:11,color: stockTotal > 5 ? '#4ade80' : stockTotal > 0 ? '#facc15' : '#f87171'}}>
                      {stockTotal > 0 ? `${stockTotal} in stock` : 'Out of stock'}
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
      </div>

      {/* ── Cart bar — 64px, always visible ────────────────────────── */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',height:64,flexShrink:0,borderTop:'1px solid #1e293b',background:'#0f172a'}}>
        <button onClick={() => setCartOpenMobile(true)}
          style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',background:'#020817',border:'1px solid #334155',borderRadius:10,color:'#cbd5e1',cursor:'pointer',flexShrink:0}}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <span style={{fontSize:14,fontWeight:500}}>{itemCount}</span>
        </button>
        <span style={{fontSize:14,fontWeight:600,whiteSpace:'nowrap'}}>R {subtotal.toFixed(2)}</span>
        <button onClick={() => setShowCheckout(true)} disabled={items.length === 0}
          style={{flex:1,height:48,background:items.length===0?'#065f46':'#10b981',color:items.length===0?'#6ee7b7':'white',border:'none',borderRadius:10,fontSize:14,fontWeight:600,cursor:items.length===0?'default':'pointer',opacity:items.length===0?0.4:1}}>
          Checkout
        </button>
      </div>

      {/* ── Tab bar — 56px ─────────────────────────────────────────── */}
      <div style={{display:'flex',height:56,flexShrink:0,borderTop:'1px solid #1e293b',background:'#0f172a',paddingBottom:'env(safe-area-inset-bottom,0px)'}}>
        {allTabItems.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link key={tab.href} href={tab.href}
              style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,textDecoration:'none',color:isActive?'#34d399':'#64748b',fontSize:10,fontWeight:500}}
            >
              <span style={{fontSize:16}}>{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── Overlays ────────────────────────────────────────────────── */}
      <CartPanel isMobile={true} isOpen={cartOpenMobile} onClose={() => setCartOpenMobile(false)} />
      {showCheckout && <CheckoutModal onClose={() => setShowCheckout(false)} />}
      {showHoldCart && <HoldCartModal onClose={() => setShowHoldCart(false)} />}
      {showVoidModal && <VoidConfirmModal onClose={() => setShowVoidModal(false)} />}
    </div>
  );
}
