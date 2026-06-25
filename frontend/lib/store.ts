import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from './api';

// ── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  locationId: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithPin: (pin: string, locationId: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User, token: string) => void;
}

export interface CartItem {
  productId: string;
  name: string;
  strainName?: string;
  category: string;
  quantity: number;
  unitPrice: number;
  unitType: string;
}

export interface CartState {
  items: CartItem[];
  discountTotal: number;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setDiscount: (amount: number) => void;
  clearCart: () => void;
  subtotal: () => number;
  itemCount: () => number;
}

// ── Auth Store ──────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const { data } = await api.post('/auth/login', { email, password });
        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
        });
      },

      loginWithPin: async (pin: string, locationId: string) => {
        const { data } = await api.post('/auth/pin', { pin, locationId });
        set({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
        });
      },

      logout: () => {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist token + user, not the methods
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// ── Cart Store ──────────────────────────────────────────────────────────────

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discountTotal: 0,

      addItem: (item: CartItem) => {
        const items = get().items;
        const existing = items.find((i) => i.productId === item.productId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },

      removeItem: (productId: string) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i,
          ),
        });
      },

      setDiscount: (amount: number) => {
        set({ discountTotal: amount });
      },

      clearCart: () => {
        set({ items: [], discountTotal: 0 });
      },

      subtotal: () => {
        return get().items.reduce(
          (sum, i) => sum + i.unitPrice * i.quantity,
          0,
        );
      },

      itemCount: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
