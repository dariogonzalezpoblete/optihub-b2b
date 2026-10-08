import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Producto, CartItem } from '@/types/product';

interface CartState {
  cart: CartItem[];
  addToCart: (producto: Producto, cantidad?: number) => void;
  removeFromCart: (productoId: string | number) => void;
  updateQuantity: (productoId: string | number, cantidad: number) => void;
  clearCart: () => void;
  getTotalUnits: () => number;
  getMontoNeto: () => number;
  getMontoIva: () => number;
  getMontoTotal: () => number;
  isValidMOQ: () => boolean; isCartDrawerOpen: boolean; openCartDrawer: () => void; closeCartDrawer: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: [], isCartDrawerOpen: false, openCartDrawer: () => set({ isCartDrawerOpen: true }), closeCartDrawer: () => set({ isCartDrawerOpen: false }),

      addToCart: (producto, cantidad = 1) => {
        const currentCart = get().cart;
        const targetId = producto.id_ext || producto.id;
        const existingIndex = currentCart.findIndex(
          (item) => (item.producto.id_ext && item.producto.id_ext === targetId) || 
                    (item.producto.id && item.producto.id === targetId)
        );

        const stockMax = typeof producto.stock === 'number' ? producto.stock : 999;

        if (existingIndex > -1) {
          const updated = [...currentCart];
          const nuevaCantidad = Math.min(updated[existingIndex].cantidad + cantidad, stockMax);
          updated[existingIndex].cantidad = nuevaCantidad;
          set({ cart: updated });
        } else {
          const cantidadFinal = Math.min(cantidad, stockMax);
          set({ cart: [...currentCart, { producto, cantidad: cantidadFinal }] });
        }
      },

      removeFromCart: (productoId) => {
        set({
          cart: get().cart.filter(
            (item) => item.producto.id_ext !== productoId && item.producto.id !== productoId
          ),
        });
      },

      updateQuantity: (productoId, cantidad) => {
        if (cantidad <= 0) {
          get().removeFromCart(productoId);
          return;
        }
        set({
          cart: get().cart.map((item) => {
            if (item.producto.id_ext === productoId || item.producto.id === productoId) {
              const stockMax = typeof item.producto.stock === 'number' ? item.producto.stock : 999;
              return { ...item, cantidad: Math.min(cantidad, stockMax) };
            }
            return item;
          }),
        });
      },

      clearCart: () => set({ cart: [] }),

      getTotalUnits: () => get().cart.reduce((sum, item) => sum + item.cantidad, 0),

      getMontoNeto: () =>
        get().cart.reduce((sum, item) => sum + (item.producto.precio_neto_clp || 0) * item.cantidad, 0),

      getMontoIva: () => Math.round(get().getMontoNeto() * 0.19),

      getMontoTotal: () => get().getMontoNeto() + get().getMontoIva(),

      isValidMOQ: () => get().getTotalUnits() >= 10,
    }),
    {
      name: 'optihub-b2b-cart',
    }
  )
);
