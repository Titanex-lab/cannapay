'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export function LogoutButton() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <button
      onClick={handleLogout}
      className="text-sm px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600
                 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
      title="Logout"
    >
      Logout
    </button>
  );
}
