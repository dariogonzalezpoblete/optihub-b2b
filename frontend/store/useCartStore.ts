import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Producto, CartItem } from '../types/product';

export function getValidStock(stock: unknown): number {
  if (stock === null || stock === undefined) return 0;
  const parsed = typeof stock === 'number' ? stock : Number(stock);
  if (isNaN(parsed) || !Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export function getProductCartKey(producto: { id_ext?: string; id?: string | number }): string {
  if (producto.id_ext && String(producto.id_ext).trim()) {
    return String(producto.id_ext).trim();
  }
  if (producto.id !== undefined && producto.id !== null && String(producto.id).trim()) {
    return String(producto.id).trim();
  }
  return '';
}

export interface AddToCartResult {
  success: boolean;
  added: number;
  message?: string;
}

export interface UpdateQuantityResult {
  success: boolean;
  finalQuantity: number;
  message?: string;
}

interface CartState {
  cart: CartItem[];
  cartId: string | null;
  setCartId: (id: string | null) => void;
  addToCart: (producto: Producto, cantidad?: number) => AddToCartResult;
  removeFromCart: (productoId: string | number) => void;
  updateQuantity: (productoId: string | number, cantidad: number) => UpdateQuantityResult;
  clearCart: () => void;
  getTotalUnits: () => number;
  getMontoNeto: () => number;
  getMontoIva: () => number;
  getMontoTotal: () => number;
  isValidMOQ: () => boolean;
  isCartDrawerOpen: boolean;
  openCartDrawer: () => void;
  closeCartDrawer: () => void;
  setCart: (cart: CartItem[]) => void;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: string | null;
  setLastSyncedAt: (date: string | null) => void;
  triggerPull: () => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'error') => void;
  lastError: string | null;
  clearLastError: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      cart: [],
      cartId: null,
      setCartId: (id) => set({ cartId: id }),
      isCartDrawerOpen: false,
      openCartDrawer: () => set({ isCartDrawerOpen: true }),
      closeCartDrawer: () => set({ isCartDrawerOpen: false }),
      syncStatus: 'idle',
      lastSyncedAt: null,
      setLastSyncedAt: (date) => set({ lastSyncedAt: date }),
      triggerPull: () => set({ syncStatus: 'idle' }), // Dummy, el componente de sync lo escucha
      setSyncStatus: (status) => set({ syncStatus: status }),
      lastError: null,
      clearLastError: () => set({ lastError: null }),

      setCart: (cart) => {
        const sanitized = cart.map((item) => {
          const maxStock = getValidStock(item.producto?.stock);
          if (maxStock > 0 && item.cantidad > maxStock) {
            return { ...item, cantidad: maxStock };
          }
          return item;
        });
        set({ cart: sanitized });
      },

      addToCart: (producto, cantidad = 1) => {
        if (!producto) {
          return { success: false, added: 0, message: 'Producto no válido.' };
        }

        const targetId = getProductCartKey(producto);
        if (!targetId) {
          return { success: false, added: 0, message: 'Identificador de producto no encontrado.' };
        }

        if (
          typeof cantidad !== 'number' ||
          isNaN(cantidad) ||
          cantidad <= 0 ||
          !Number.isInteger(cantidad) ||
          !Number.isFinite(cantidad)
        ) {
          console.warn('Cantidad inválida rechazada.');
          return { success: false, added: 0, message: 'Cantidad inválida.' };
        }

        const maxStock = getValidStock(producto.stock);

        // Requisito 3: Si el producto tiene stock 0, o es null, inválido o desconocido, no permitir agregarlo.
        if (maxStock <= 0) {
          const errorMsg = 'Producto sin stock disponible.';
          set({ lastError: errorMsg });
          return { success: false, added: 0, message: errorMsg };
        }

        const currentCart = get().cart;
        const existingIndex = currentCart.findIndex(
          (item) => getProductCartKey(item.producto) === targetId
        );
        const currentQty = existingIndex > -1 ? currentCart[existingIndex].cantidad : 0;

        // Requisito 2 & 4: Si ya se alcanzó el stock máximo disponible considerando lo acumulado en el carrito
        if (currentQty >= maxStock) {
          const errorMsg = `Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`;
          set({ lastError: errorMsg });
          return { success: false, added: 0, message: errorMsg };
        }

        // Unidades que pueden agregarse sin superar el stock
        const allowedToAdd = Math.min(cantidad, maxStock - currentQty);

        if (allowedToAdd <= 0) {
          const errorMsg = `Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`;
          set({ lastError: errorMsg });
          return { success: false, added: 0, message: errorMsg };
        }

        const nuevaCantidad = currentQty + allowedToAdd;
        if (nuevaCantidad > 9999) {
          console.warn('Cantidad total excede el límite máximo comercial.');
          return { success: false, added: 0, message: 'Cantidad total excede el límite comercial.' };
        }

        let warningMsg: string | undefined = undefined;
        if (allowedToAdd < cantidad) {
          // No agregar las unidades excedentes y emitir mensaje claro
          warningMsg = `Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`;
          set({ lastError: warningMsg });
        } else {
          set({ lastError: null });
        }

        if (existingIndex > -1) {
          const updated = [...currentCart];
          updated[existingIndex] = {
            ...updated[existingIndex],
            producto: { ...updated[existingIndex].producto, stock: maxStock },
            cantidad: nuevaCantidad,
          };
          set({ cart: updated });
        } else {
          set({
            cart: [
              ...currentCart,
              {
                producto: { ...producto, stock: maxStock },
                cantidad: nuevaCantidad,
              },
            ],
          });
        }

        return {
          success: true,
          added: allowedToAdd,
          message: warningMsg,
        };
      },

      removeFromCart: (productoId) => {
        const targetId = String(productoId).trim();
        set({
          cart: get().cart.filter(
            (item) => getProductCartKey(item.producto) !== targetId
          ),
          lastError: null,
        });
      },

      updateQuantity: (productoId, cantidad) => {
        const targetId = String(productoId).trim();
        if (cantidad <= 0) {
          get().removeFromCart(targetId);
          return { success: true, finalQuantity: 0 };
        }

        if (
          typeof cantidad !== 'number' ||
          isNaN(cantidad) ||
          !Number.isInteger(cantidad) ||
          !Number.isFinite(cantidad)
        ) {
          console.warn('Cantidad inválida rechazada.');
          return { success: false, finalQuantity: 0, message: 'Cantidad inválida.' };
        }

        const currentCart = get().cart;
        const itemIndex = currentCart.findIndex(
          (item) => getProductCartKey(item.producto) === targetId
        );

        if (itemIndex === -1) {
          return { success: false, finalQuantity: 0, message: 'Producto no encontrado en el carrito.' };
        }

        const item = currentCart[itemIndex];
        const maxStock = getValidStock(item.producto.stock);

        if (maxStock <= 0) {
          const errorMsg = 'Producto sin stock disponible.';
          set({ lastError: errorMsg });
          return { success: false, finalQuantity: item.cantidad, message: errorMsg };
        }

        if (cantidad > maxStock) {
          const warningMsg = `Stock máximo disponible: ${maxStock} ${maxStock === 1 ? 'unidad' : 'unidades'}.`;
          const updated = [...currentCart];
          updated[itemIndex] = { ...item, cantidad: maxStock };
          set({ cart: updated, lastError: warningMsg });
          return { success: false, finalQuantity: maxStock, message: warningMsg };
        }

        const finalQty = Math.min(cantidad, 9999);
        const updated = [...currentCart];
        updated[itemIndex] = { ...item, cantidad: finalQty };
        set({ cart: updated, lastError: null });
        return { success: true, finalQuantity: finalQty };
      },

      clearCart: () => set({ cart: [], lastError: null }),

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
