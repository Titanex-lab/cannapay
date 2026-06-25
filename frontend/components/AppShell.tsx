'use client';

import { usePathname } from 'next/navigation';
import Layout from '@/components/Layout';

/**
 * Conditionally wraps children with the app shell Layout.
 * - /pos and /login pages have their own layouts (fullscreen / centered)
 * - All other pages get the sidebar + header Layout
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // POS and login have their own layouts — render children directly
  if (pathname.startsWith('/pos') || pathname === '/login') {
    return <>{children}</>;
  }

  // All other pages (inventory, reports, admin, etc.) get the app shell
  return <Layout>{children}</Layout>;
}
