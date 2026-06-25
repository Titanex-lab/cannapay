'use client';

import { useState, useCallback, useEffect } from 'react';
import { useCartStore, useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { IDVerification } from './IDVerification';

type Step = 'verify' | 'customer' | 'payment' | 'receipt';

interface ReceiptData {
  transactionId: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  change: number;
  budtenderName: string;
  createdAt: string;
}

const QUICK_TENDER_AMOUNTS = [50, 100, 200, 500];

export function CheckoutModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('verify');
  const [idVerified, setIdVerified] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [cashTendered, setCashTendered] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Customer capture state ──────────────────────────────────────────
  const [customerStep, setCustomerStep] = useState<'form' | 'found'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [consentSMS, setConsentSMS] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<{ id: string; firstName: string; lastName: string } | null>(null);

  // Lookup customer when email or phone changes
  useEffect(() => {
    if (!custEmail && !custPhone) return;
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        // Check via customers endpoint
        const params: Record<string, string> = {};
        if (custEmail) params.email = custEmail;
        if (custPhone) params.phone = custPhone;
        // Simple lookup: search by email
        if (custEmail) {
          const { data } = await api.get('/customers', { params: { search: custEmail, limit: 1 } });
          if (data.data?.length > 0) {
            const c = data.data[0];
            setFoundCustomer({ id: c.id, firstName: c.firstName, lastName: c.lastName });
            setCustomerId(c.id);
            setCustomerStep('found');
          }
        }
      } catch {
        // lookup failed silently
      } finally {
        setLookingUp(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [custEmail, custPhone]);

  const { items, discountTotal, subtotal, clearCart } = useCartStore();
  const { user } = useAuthStore();

  const sub = subtotal();
  const afterDiscount = Math.max(0, sub - discountTotal);
  const tax = afterDiscount * 0.15;
  const total = afterDiscount + tax;
  const tendered = parseFloat(cashTendered) || 0;
  const change = tendered - total;

  const paymentDisabled =
    paymentMethod === 'cash'
      ? tendered < total
      : isProcessing;

  const handleCompleteSale = async () => {
    setError(null);
    setIsProcessing(true);
    try {
      const response = await api.post('/transactions', {
        locationId: user?.locationId,
        budtenderId: user?.id,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: 0,
        })),
        discountTotal,
        idVerified,
        idVerifiedBy: user?.id,
        customerId: customerId || undefined,
        paymentMethod,
        cashTendered: paymentMethod === 'cash' ? tendered : undefined,
        cashChange: paymentMethod === 'cash' ? change : undefined,
        cardLastFour: paymentMethod === 'card' ? cardLastFour : undefined,
      });

      setReceipt({
        transactionId: response.data.id || response.data.transactionId,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.quantity * item.unitPrice,
        })),
        subtotal: sub,
        discount: discountTotal,
        tax,
        total,
        paymentMethod,
        change: paymentMethod === 'cash' ? change : 0,
        budtenderName: user?.fullName || 'Budtender',
        createdAt: new Date().toISOString(),
      });
      setStep('receipt');
      toast.success('Sale completed!');
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to complete sale. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewSale = () => {
    clearCart();
    onClose();
  };

  const handleSkipCustomer = () => {
    setStep('payment');
  };

  const handleCreateCustomer = async () => {
    if (firstName && lastName && user?.locationId) {
      try {
        const { data } = await api.post('/customers', {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: custEmail.trim() || undefined,
          phone: custPhone.trim() || undefined,
          locationId: user.locationId,
          consentSMS,
        });
        setCustomerId(data.id);
        toast.success('Customer saved');
      } catch {
        // proceed without customer if save fails
      }
    }
    setStep('payment');
  };

  const addQuickTender = useCallback(
    (amount: number) => {
      const current = parseFloat(cashTendered) || 0;
      setCashTendered((current + amount).toFixed(2));
    },
    [cashTendered]
  );

  // Step indicator labels
  const stepLabels = ['ID Verification', 'Customer', 'Payment', 'Receipt'];
  const currentStepIndex = step === 'verify' ? 0 : step === 'customer' ? 1 : step === 'payment' ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header with step indicator */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg text-white">Checkout</h2>
            {step !== 'receipt' && (
              <div className="flex items-center gap-1.5">
                {stepLabels.map((label, i) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        i < currentStepIndex
                          ? 'bg-emerald-500'
                          : i === currentStepIndex
                          ? 'bg-emerald-400 ring-2 ring-emerald-400/30'
                          : 'bg-slate-700'
                      }`}
                    />
                    {i < stepLabels.length - 1 && (
                      <div
                        className={`w-6 h-0.5 rounded transition-colors ${
                          i < currentStepIndex
                            ? 'bg-emerald-600'
                            : 'bg-slate-700'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-500 hover:text-white disabled:opacity-30 transition-colors p-1"
            aria-label="Close checkout"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 1: ID Verification */}
          {step === 'verify' && (
            <IDVerification
              verified={idVerified}
              onVerifiedChange={setIdVerified}
              onContinue={() => setStep('customer')}
            />
          )}

          {/* Step 2: Customer */}
          {step === 'customer' && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-400">Customer info (optional)</p>

              {customerStep === 'found' && foundCustomer ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <p className="text-emerald-400 font-medium">Welcome back, {foundCustomer.firstName}!</p>
                  <p className="text-xs text-slate-400 mt-1">Existing customer record loaded</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">First Name</label>
                      <input value={firstName} onChange={e => setFirstName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="First name" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Last Name</label>
                      <input value={lastName} onChange={e => setLastName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="Last name" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Email {lookingUp && <span className="text-amber-400 animate-pulse">looking up...</span>}</label>
                    <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="customer@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Phone</label>
                    <input type="tel" value={custPhone} onChange={e => setCustPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500" placeholder="+27XXXXXXXXX" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={consentSMS} onChange={e => setConsentSMS(e.target.checked)}
                      className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500" />
                    <span className="text-xs text-slate-400">I agree to receive promotional messages</span>
                  </label>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleSkipCustomer}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors">
                  Skip
                </button>
                <button onClick={handleCreateCustomer}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors">
                  {customerStep === 'found' ? 'Continue' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 'payment' && (
            <div className="p-4 space-y-4">
              {/* Amount Due */}
              <div className="text-center py-4 bg-slate-800 rounded-xl border border-slate-700">
                <p className="text-sm text-slate-400 mb-1">Amount Due</p>
                <p className="text-3xl font-bold text-white tabular-nums">
                  R {total.toFixed(2)}
                </p>
              </div>

              {/* Payment method tabs */}
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button
                  onClick={() => {
                    setPaymentMethod('cash');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    paymentMethod === 'cash'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cash
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('card');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    paymentMethod === 'card'
                      ? 'bg-slate-700 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Card
                </button>
              </div>

              {/* Cash payment */}
              {paymentMethod === 'cash' && (
                <div className="space-y-3">
                  {/* Amount tendered */}
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Amount Tendered
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                        R
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashTendered}
                        onChange={(e) => {
                          setCashTendered(e.target.value);
                          setError(null);
                        }}
                        placeholder="0.00"
                        autoFocus
                        className="w-full pl-8 pr-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-right text-white text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Quick tender buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    {QUICK_TENDER_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => addQuickTender(amount)}
                        className="py-2 bg-slate-800 border border-slate-700 hover:border-slate-500 hover:bg-slate-700 rounded-lg text-sm text-slate-300 hover:text-white font-medium transition-colors"
                      >
                        R {amount}
                      </button>
                    ))}
                  </div>

                  {/* Change */}
                  {tendered >= total && (
                    <div className="flex justify-between items-center p-3 bg-emerald-600/10 border border-emerald-600/30 rounded-lg">
                      <span className="text-sm text-emerald-400">Change</span>
                      <span className="text-lg font-bold text-emerald-400 tabular-nums">
                        R {change.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Card payment */}
              {paymentMethod === 'card' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">
                      Card Last 4 Digits{' '}
                      <span className="text-slate-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      maxLength={4}
                      value={cardLastFour}
                      onChange={(e) =>
                        setCardLastFour(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder="0000"
                      autoFocus
                      className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-center text-white text-lg tracking-widest focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {isProcessing && (
                    <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                      <svg
                        className="animate-spin w-5 h-5"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <span className="text-sm">Processing payment...</span>
                    </div>
                  )}
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-600/10 border border-red-600/30 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Complete Sale button */}
              <button
                disabled={paymentDisabled}
                onClick={handleCompleteSale}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors"
              >
                {isProcessing
                  ? 'Processing...'
                  : paymentMethod === 'cash'
                  ? 'Complete Sale'
                  : 'Process Card Payment'}
              </button>

              {/* Back button */}
              <button
                onClick={() => setStep('verify')}
                disabled={isProcessing}
                className="w-full py-2 text-sm text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
              >
                ← Back to ID Verification
              </button>
            </div>
          )}

          {/* Step 3: Receipt */}
          {step === 'receipt' && receipt && (
            <div className="p-6 flex flex-col items-center">
              {/* Success animation */}
              <div className="w-16 h-16 rounded-full bg-emerald-600/20 flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-white mb-1">
                Sale Complete
              </h3>
              <p className="text-sm text-slate-400 mb-6">
                Transaction #{receipt.transactionId}
              </p>

              {/* Receipt details */}
              <div className="w-full bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3 text-sm">
                {/* Items */}
                <div className="space-y-1.5">
                  {receipt.items.map((item, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-slate-400 truncate max-w-[60%]">
                        {item.name}{' '}
                        <span className="text-slate-600">×{item.quantity}</span>
                      </span>
                      <span className="text-white tabular-nums">
                        R {item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-700 pt-2 space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>R {receipt.subtotal.toFixed(2)}</span>
                  </div>
                  {receipt.discount > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>Discount</span>
                      <span>-R {receipt.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Tax (15%)</span>
                    <span>R {receipt.tax.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-700 pt-2 flex justify-between font-bold text-white">
                  <span>Total</span>
                  <span>R {receipt.total.toFixed(2)}</span>
                </div>

                <div className="border-t border-slate-700 pt-2 space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Payment Method</span>
                    <span className="capitalize text-slate-400">
                      {receipt.paymentMethod}
                    </span>
                  </div>
                  {receipt.change > 0 && (
                    <div className="flex justify-between">
                      <span>Change</span>
                      <span className="text-emerald-400">
                        R {receipt.change.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Budtender</span>
                    <span>{receipt.budtenderName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date</span>
                    <span>
                      {new Date(receipt.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* New Sale button */}
              <button
                onClick={handleNewSale}
                className="w-full mt-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-bold text-white transition-colors"
              >
                New Sale
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
