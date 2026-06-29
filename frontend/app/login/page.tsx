'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import toast from 'react-hot-toast';

const HARDCODED_LOCATIONS = [
  { id: 'a138a1c9-c4a9-40e7-a5d4-8041ca7238c7', name: 'Linbro' },
  { id: '365217b0-fb46-4528-a79f-96c9766efa8e', name: 'Fourways' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithPin, isAuthenticated } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/pos');
    }
  }, [isAuthenticated, router]);

  // ── Tab state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'email' | 'pin'>('email');

  // ── Email/Password form ────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const handleEmailLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      setEmailLoading(true);
      try {
        await login(email.trim(), password);
        toast.success('Logged in');
        router.replace('/pos');
      } catch (err: unknown) {
        const errData = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response?.data;
        const msg = errData?.error?.message || errData?.message || 'Login failed — check your connection';
        toast.error(msg);
      } finally {
        setEmailLoading(false);
      }
    },
    [email, password, login, router],
  );

  // ── PIN form ───────────────────────────────────────────────────────────
  const [pin, setPin] = useState('');
  const [locationId, setLocationId] = useState(HARDCODED_LOCATIONS[0].id);
  const [pinLoading, setPinLoading] = useState(false);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Auto-submit when 6 digits entered
  const handlePinChange = useCallback(
    (value: string) => {
      const digits = value.replace(/\D/g, '').slice(0, 6);
      setPin(digits);

      if (digits.length === 6) {
        submitPin(digits);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationId],
  );

  const submitPin = useCallback(
    async (pinDigits: string) => {
      setPinLoading(true);
      console.log('[PIN login] Sending payload:', JSON.stringify({ pin: pinDigits, locationId }));
      try {
        await loginWithPin(pinDigits, locationId);
        toast.success('Logged in');
        router.replace('/pos');
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response
            ?.data?.message || 'Invalid PIN';
        toast.error(msg);
        setPin('');
        pinInputRef.current?.focus();
      } finally {
        setPinLoading(false);
      }
    },
    [loginWithPin, locationId, router],
  );

  const handlePinSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (pin.length === 6) {
        submitPin(pin);
      }
    },
    [pin, submitPin],
  );

  // Focus PIN input on tab switch
  useEffect(() => {
    if (mode === 'pin') {
      pinInputRef.current?.focus();
    }
  }, [mode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="bg-white rounded-xl p-3 mx-auto w-fit">
            <img src="/cannapay-logo.png" alt="CannaPay" className="w-44 h-auto" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">Dispensary Management</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          {/* Tabs */}
          <div className="mb-6 flex rounded-lg bg-zinc-800 p-1">
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'email'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setMode('pin')}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === 'pin'
                  ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              PIN
            </button>
          </div>

          {/* Email/Password Form */}
          {mode === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@dispensary.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={emailLoading}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {emailLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Logging in…
                  </span>
                ) : (
                  'Log In'
                )}
              </button>
            </form>
          )}

          {/* PIN Form */}
          {mode === 'pin' && (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="location"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  Location
                </label>
                <select
                  id="location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  {HARDCODED_LOCATIONS.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="pin"
                  className="mb-1.5 block text-xs font-medium text-zinc-400"
                >
                  6-Digit PIN
                </label>
                <div className="relative">
                  <input
                    ref={pinInputRef}
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => handlePinChange(e.target.value)}
                    placeholder="••••••"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-center text-2xl tracking-[0.5em] text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  {pinLoading && (
                    <div className="absolute inset-y-0 right-3 flex items-center">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Auto-submits after 6 digits
                </p>
              </div>

              <button
                type="submit"
                disabled={pin.length !== 6 || pinLoading}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pinLoading ? 'Verifying…' : 'Log In'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          CannaPay POS v1.0 &middot; Authorized personnel only
        </p>
      </div>
    </div>
  );
}

