'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useCartStore } from '@/lib/store';
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

  useInventorySync();

  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const itemCount = useCartStore((s) => s.itemCount());
  const logout = useAuthStore((s) => s.logout);

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
        <ProductSearch />
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
