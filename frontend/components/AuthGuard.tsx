'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

const PUBLIC_PATHS = ['/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, token } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Hydration guard: wait for persisted store to hydrate
    // Zustand persist hydrates asynchronously; initial token is null until hydration
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setChecking(false);
    });

    // If already hydrated (e.g. re-render), stop checking immediately
    if (useAuthStore.persist.hasHydrated()) {
      setChecking(false);
    }

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (checking) return;

    if (!isAuthenticated && !PUBLIC_PATHS.includes(pathname)) {
      router.replace('/login');
    }
  }, [checking, isAuthenticated, pathname, router]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      </div>
    );
  }

  // On public paths or authenticated, render children
  if (PUBLIC_PATHS.includes(pathname) || isAuthenticated) {
    return <>{children}</>;
  }

  // Fallback — should not reach since useEffect handles redirect
  return null;
}
