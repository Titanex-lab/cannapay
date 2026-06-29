'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore.persist.hasHydrated();

  useEffect(() => {
    // Wait for Zustand persist hydration before deciding
    if (!hasHydrated) {
      const unsub = useAuthStore.persist.onFinishHydration(() => {
        const authed = useAuthStore.getState().isAuthenticated;
        router.replace(authed ? '/pos' : '/login');
      });
      return () => unsub();
    }

    router.replace(isAuthenticated ? '/pos' : '/login');
  }, [isAuthenticated, router, hasHydrated]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="bg-white rounded-xl p-3">
          <img src="/cannapay-logo.png" alt="CannaPay" className="w-44 h-auto" />
        </div>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    </div>
  );
}
