'use client';

import { useAuthStore } from '@/lib/store';

interface RoleGateProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export default function RoleGate({ allowedRoles, children }: RoleGateProps) {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-zinc-400">Please log in to access this page.</p>
      </div>
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="rounded-full bg-red-500/10 p-4">
          <svg
            className="h-8 w-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">Access Denied</h2>
        <p className="text-sm text-zinc-400">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
