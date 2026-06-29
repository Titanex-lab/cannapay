'use client';

import { useAuthStore } from '@/lib/store';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

// ── Nav items ─────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: '/pos', label: 'POS', icon: '\ud83c\udfea', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
  { href: '/inventory', label: 'Inventory', icon: '\ud83d\udce6', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
  { href: '/strains', label: 'Strains', icon: '\ud83e\uddec', roles: ['budtender', 'shift_manager', 'store_manager', 'admin'] },
  { href: '/reports', label: 'Reports', icon: '\ud83d\udcca', roles: ['shift_manager', 'store_manager', 'admin'] },
  { href: '/admin', label: 'Admin', icon: '\u2699\ufe0f', roles: ['admin'] },
];

// ── Role badge colors ─────────────────────────────────────────────────────

const roleBadgeStyles: Record<string, string> = {
  budtender: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  shift_manager: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  store_manager: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  admin: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const roleLabels: Record<string, string> = {
  budtender: 'Budtender',
  shift_manager: 'Shift Lead',
  store_manager: 'Manager',
  admin: 'Admin',
};

// ── Page title mapping ────────────────────────────────────────────────────

const pageTitles: Record<string, string> = {
  '/inventory': 'Inventory',
  '/strains': 'Strains',
  '/reports': 'Reports',
  '/admin': 'Admin',
};

// ── Layout Component ──────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // ── Responsive detection ──────────────────────────────────────────────

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Role filtering ────────────────────────────────────────────────────

  const userRole = user?.role ?? 'budtender';
  const filteredNav = navItems.filter((item) => item.roles.includes(userRole));

  // ── Logout ────────────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout, router]);

  // ── Page title ────────────────────────────────────────────────────────

  const isPosPage = pathname === '/pos' || pathname.startsWith('/pos/');
  const pageTitle = isPosPage ? '' : (pageTitles[pathname] ?? 'CannaPay');

  // ── Sidebar JSX (shared between desktop/mobile) ───────────────────────

  const sidebarContent = (
    <div className="flex h-full w-52 flex-col bg-slate-950 border-r border-slate-800">
      {/* Logo */}
      <div className="px-4 py-3">
        <div className="bg-white rounded-lg p-1.5 inline-block">
          <img src="/cannapay-logo.png" alt="CannaPay" className="w-28 h-auto" />
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-2 space-y-0.5">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-slate-800 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300 flex-shrink-0 ring-1 ring-slate-700">
            {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.fullName ?? 'User'}</p>
            <span className={`inline-block text-[10px] font-medium px-1.5 py-px rounded mt-0.5 ${
                roleBadgeStyles[userRole] ?? roleBadgeStyles.budtender
              }`}>
              {roleLabels[userRole] ?? userRole}
            </span>
          </div>
        </div>
        <button onClick={handleLogout}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-800/60 hover:text-red-400 transition-colors">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Log out
        </button>
      </div>
    </div>
  );

  // ── Bottom tab bar (mobile only) ──────────────────────────────────────

  const bottomTabBar = (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-800 bg-slate-950 safe-bottom">
      {filteredNav.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[48px] ${
              isActive
                ? 'text-emerald-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {item.href === '/pos' ? (
              <div className="bg-white rounded-md p-0.5">
                <img src="/cannapay-logo.png" alt="POS" className="h-7 w-auto" />
              </div>
            ) : (
              <span className="text-lg">{item.icon}</span>
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-white">
      {/* Desktop sidebar (always visible on >=768px) */}
      {!isMobile && (
        <aside className="w-52 flex-shrink-0 h-screen sticky top-0">
          {sidebarContent}
        </aside>
      )}

      {/* Mobile: hamburger header + slide-out drawer */}
      {isMobile && (
        <>
          {/* Top header bar */}
          <header className="fixed top-0 left-0 right-0 z-40 h-12 flex items-center gap-3 px-3 bg-slate-950 border-b border-slate-800 safe-top">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            {pageTitle ? (
              <h1 className="text-sm font-semibold text-slate-200 truncate">{pageTitle}</h1>
            ) : (
              <div className="flex items-center gap-2">
                <div className="bg-white rounded-md px-1 py-0.5">
                  <img src="/cannapay-logo.png" alt="CannaPay" className="h-5 w-auto" />
                </div>
              </div>
            )}
            {/* Spacer to push user info right */}
            <div className="flex-1" />
            {user && (
              <button onClick={handleLogout}
                className="text-[11px] text-slate-500 hover:text-red-400 transition-colors px-2 py-1">
                Logout
              </button>
            )}
          </header>

          {/* Backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Slide-out sidebar */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-52 transform transition-transform duration-250 ease-out ${
              sidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main content area */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isMobile ? 'pt-12 pb-14' : ''}`}>
        {/* Desktop header bar */}
        {!isMobile && !isPosPage && (
          <header className="sticky top-0 z-30 flex items-center border-b border-slate-700/50 bg-slate-900/80 backdrop-blur px-6 py-3">
            <h1 className="text-base font-semibold text-slate-200">{pageTitle}</h1>
          </header>
        )}

        {/* Page content */}
        {isMobile ? (
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        ) : isPosPage ? (
          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto">
            {children}
          </div>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      {isMobile && bottomTabBar}
    </div>
  );
}
