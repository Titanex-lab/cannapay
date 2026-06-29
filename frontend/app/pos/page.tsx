'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useCartStore } from '@/lib/store';
import { ProductSearch } from './components/ProductSearch';
import { CartPanel } from './components/CartPanel';
import { HeldCartsButton } from './components/HeldCartsButton';
import { DrawerIndicator } from './components/DrawerIndicator';
import { LogoutButton } from './components/LogoutButton';
import { CheckoutModal } from './components/CheckoutModal';
import { HoldCartModal } from './components/HoldCartModal';
import { VoidConfirmModal } from './components/VoidConfirmModal';
import { useInventorySync } from '@/hooks/useInventorySync';

export default function POSPage() {
  const pathname = usePathname();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showHoldCart, setShowHoldCart] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useInventorySync();

  // ── Mobile detection ──────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const user = useAuthStore((s) => s.user);
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal());
  const itemCount = useCartStore((s) => s.itemCount());

  // ── Tab bar nav items (same as Layout.tsx) ───────────────────────────
  const userRole = user?.role ?? 'budtender';
  const tabBarItems = [
    { href: '/pos', label: 'POS', icon: '\ud83c\udfea', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/inventory', label: 'Inventory', icon: '\ud83d\udce6', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/strains', label: 'Strains', icon: '\ud83e\uddec', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
    { href: '/reports', label: 'Reports', icon: '\ud83d\udcca', roles: ['shift_manager', 'store_manager', 'admin'] },
    { href: '/admin', label: 'Admin', icon: '\u2699\ufe0f', roles: ['admin'] },
  ].filter((t) => t.roles.includes(userRole));

  // Auto-open cart on mobile when first item added to empty cart
  const prevLen = useRef(0);
  useEffect(() => {
    const len = items.length;
    if (isMobile && len > 0 && prevLen.current === 0) {
      setCartOpenMobile(true);
    }
    prevLen.current = len;
  }, [isMobile, items]);

  return (
    <div className={`flex flex-col bg-slate-950 text-white ${isMobile ? 'h-[100dvh] overflow-hidden fixed inset-0' : 'h-full'}`}>
      {/* Top Bar */}
      <header className={`border-b border-slate-800 flex items-center justify-between px-4 bg-slate-950 shrink-0 ${isMobile ? 'h-12 fixed top-0 left-0 right-0 z-30' : 'h-12'}`}>
        <div className="flex items-center gap-2.5">
          <div className="bg-white rounded-md px-1.5 py-0.5 flex-shrink-0">
            <img src="/cannapay-logo.png" alt="CannaPay" className="h-10 w-auto" />
          </div>
          <span className="text-slate-700 hidden sm:inline">|</span>
          <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[120px]">{user?.fullName ?? 'Unknown'}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {!isMobile && (
            <>
              <button onClick={() => setShowVoidModal(true)}
                className="text-xs px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-colors">
                Void/Refund
              </button>
              <HeldCartsButton />
              <DrawerIndicator />
            </>
          )}
          <LogoutButton />
        </div>
      </header>

      {/* ── DESKTOP LAYOUT (>=768px) ─────────────────────────────────── */}
      {!isMobile && (
        <main className="flex-1 flex overflow-hidden">
          <div className="flex-[3] flex flex-col overflow-hidden">
            <ProductSearch />
          </div>
          <div className="flex-[2] border-l border-slate-800 bg-slate-900/50">
            <CartPanel isMobile={false} isOpen={true} onClose={() => {}} />
          </div>
        </main>
      )}

      {/* ── MOBILE LAYOUT (<768px) ───────────────────────────────────── */}
      {isMobile && (
        <main className="flex-1 flex flex-col overflow-hidden mt-12 pb-[104px]">
          <div className="flex-1 flex flex-col overflow-hidden">
            <ProductSearch />
          </div>
        </main>
      )}

      {/* Bottom Bar — fixed on mobile, inline on desktop */}
      {isMobile ? (
        <footer className="fixed bottom-[48px] left-0 right-0 z-50 h-14 border-t border-slate-800 flex items-center justify-between px-3 bg-slate-950">
          <button
            onClick={() => setCartOpenMobile(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <svg className="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className="text-sm font-medium text-slate-200">{itemCount}</span>
          </button>
          <div className="flex items-center gap-2 flex-1 ml-3">
            <span className="text-base font-semibold tracking-tight whitespace-nowrap">R {subtotal.toFixed(2)}</span>
            <button onClick={() => setShowCheckout(true)} disabled={items.length === 0}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 py-3 rounded-lg font-semibold text-sm disabled:opacity-40 transition-all shadow-sm shadow-emerald-500/20 min-h-[52px]">
              Checkout
            </button>
          </div>
        </footer>
      ) : (
        <footer className="h-14 border-t border-slate-800 flex items-center justify-between px-4 shrink-0 bg-slate-950">
          <span className="text-slate-500 text-xs">Items: {itemCount}</span>
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-semibold tracking-tight">R {subtotal.toFixed(2)}</span>
            <button onClick={() => setShowHoldCart(true)} disabled={items.length === 0}
              className="bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-lg text-xs font-medium disabled:opacity-40 transition-colors border border-slate-700">
              Hold
            </button>
            <button onClick={() => setShowCheckout(true)} disabled={items.length === 0}
              className="bg-emerald-500 hover:bg-emerald-400 px-6 py-2 rounded-lg font-semibold text-sm disabled:opacity-40 transition-all shadow-sm shadow-emerald-500/20">
              Checkout
            </button>
          </div>
        </footer>
      )}

      {/* Mobile Cart Bottom Sheet — rendered outside main layout */}
      {isMobile && (
        <CartPanel isMobile={true} isOpen={cartOpenMobile} onClose={() => setCartOpenMobile(false)} />
      )}

      {/* Modals */}
      {showCheckout && <CheckoutModal onClose={() => setShowCheckout(false)} />}
      {showHoldCart && <HoldCartModal onClose={() => setShowHoldCart(false)} />}
      {showVoidModal && <VoidConfirmModal onClose={() => setShowVoidModal(false)} />}

      {/* ── Mobile Tab Bar ────────────────────────────────────────────── */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-800 bg-slate-950 safe-bottom">
          {tabBarItems.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[48px] ${
                  isActive
                    ? 'text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.href === '/pos' ? (
                  <div className="bg-white rounded-md p-0.5">
                    <img src="/cannapay-logo.png" alt="POS" className="h-7 w-auto" />
                  </div>
                ) : (
                  <span className="text-lg">{tab.icon}</span>
                )}
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
