'use client';

import { useAuthStore } from '@/lib/store';

interface IDVerificationProps {
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  onContinue: () => void;
}

export function IDVerification({
  verified,
  onVerifiedChange,
  onContinue,
}: IDVerificationProps) {
  const { user } = useAuthStore();

  return (
    <div className="flex flex-col items-center text-center py-6 px-4">
      {/* Shield icon */}
      <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 text-emerald-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-bold text-white mb-1">ID Verification</h3>
      <p className="text-sm text-slate-400 mb-6">
        South African law requires customer identification before any cannabis
        sale can be completed.
      </p>

      {/* Checkbox */}
      <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg border border-slate-700 cursor-pointer hover:border-emerald-600/50 transition-colors w-full max-w-sm mb-4">
        <input
          type="checkbox"
          checked={verified}
          onChange={(e) => onVerifiedChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
        />
        <div className="text-left">
          <p className="text-sm font-medium text-white">
            Customer ID has been verified
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            I confirm that I have checked a valid government-issued ID and the
            customer is 18 years or older.
          </p>
        </div>
      </label>

      {/* Verified By */}
      <div className="w-full max-w-sm mb-6">
        <label className="block text-xs text-slate-500 mb-1 text-left">
          Verified By
        </label>
        <div className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white text-left cursor-not-allowed">
          {user?.fullName || 'Unknown Budtender'}
        </div>
      </div>

      {/* Continue button */}
      <button
        disabled={!verified}
        onClick={onContinue}
        className="w-full max-w-sm py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors"
      >
        Continue to Payment
      </button>
    </div>
  );
}
