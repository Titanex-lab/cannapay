'use client';

import { useCartStore, CartItem as CartItemType } from '@/lib/store';

interface CartItemProps {
  item: CartItemType;
}

const WEIGHT_UNITS = ['gram', 'eighth', 'quarter', 'half', 'ounce', 'pound'];

export function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore();
  const isWeightBased = WEIGHT_UNITS.includes(item.unitType);
  const step = isWeightBased ? 0.5 : 1;
  const lineTotal = item.quantity * item.unitPrice;

  const handleDecrement = () => {
    const newQty = item.quantity - step;
    if (newQty <= 0) {
      removeItem(item.productId);
    } else {
      updateQuantity(item.productId, parseFloat(newQty.toFixed(1)));
    }
  };

  const handleIncrement = () => {
    updateQuantity(
      item.productId,
      parseFloat((item.quantity + step).toFixed(1))
    );
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/80 rounded-lg border border-slate-700/50 hover:border-slate-600/50 transition-colors">
      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {item.strainName && (
            <span className="text-emerald-400/80">{item.strainName}</span>
          )}
          {item.strainName && <span className="mx-1 text-slate-700">·</span>}
          <span className="capitalize">{item.category}</span>
          <span className="mx-1 text-slate-700">·</span>
          <span className="text-slate-600">per {item.unitType}</span>
        </p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg border border-slate-700">
        <button
          onClick={handleDecrement}
          className="w-7 h-7 flex items-center justify-center rounded-l-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
          aria-label={`Decrease ${item.name} quantity`}
        >
          −
        </button>
        <span className="w-10 text-center text-sm text-white tabular-nums select-none">
          {item.quantity}
        </span>
        <button
          onClick={handleIncrement}
          className="w-7 h-7 flex items-center justify-center rounded-r-lg hover:bg-slate-700 text-slate-400 hover:text-white text-sm transition-colors"
          aria-label={`Increase ${item.name} quantity`}
        >
          +
        </button>
      </div>

      {/* Line total and unit price */}
      <div className="text-right min-w-[70px]">
        <p className="text-sm font-medium text-white tabular-nums">
          R {lineTotal.toFixed(2)}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          R {item.unitPrice.toFixed(2)} ea
        </p>
      </div>

      {/* Remove button */}
      <button
        onClick={() => removeItem(item.productId)}
        className="text-slate-500 hover:text-red-400 text-xl leading-none p-1 transition-colors"
        aria-label={`Remove ${item.name} from cart`}
      >
        ×
      </button>
    </div>
  );
}
