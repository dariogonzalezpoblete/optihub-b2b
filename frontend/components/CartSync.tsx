'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useCartStore } from '@/store/useCartStore';
import { mergeAndSyncCart, pushCartToSupabase } from '@/lib/cartService';

export default function CartSync() {
  const { user, loading: authLoading } = useAuth();
  const cart = useCartStore(state => state.cart);
  const setCart = useCartStore(state => state.setCart);
  const setCartId = useCartStore(state => state.setCartId);
  const setSyncStatus = useCartStore(state => state.setSyncStatus);
  const clearCart = useCartStore(state => state.clearCart);
  const setLastSyncedAt = useCartStore(state => state.setLastSyncedAt);

  const prevUserRef = useRef<string | null | undefined>(undefined);
  const isFirstMergeDone = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (authLoading) return;

    const currentUserId = user?.id || null;
    const prevUserId = prevUserRef.current;
    
    prevUserRef.current = currentUserId;

    const performPullAndMerge = async () => {
      try {
        setSyncStatus('syncing');
        const currentCart = useCartStore.getState().cart;
        const { cart: mergedCart, updatedAt, cartId: newCartId } = await mergeAndSyncCart(currentUserId as string, currentCart);
        setCart(mergedCart);
        if (newCartId) {
          setCartId(newCartId);
        }
        setLastSyncedAt(updatedAt);
        setSyncStatus('synced');
        isFirstMergeDone.current = true;
      } catch (err) {
        console.error('Error durante el merge/pull del carrito:', err);
        setSyncStatus('error');
      }
    };

    // Login detectado
    if (currentUserId && prevUserId === null) {
      performPullAndMerge();
      return;
    }

    // Logout detectado
    if (!currentUserId && prevUserId !== undefined && prevUserId !== null) {
      clearCart();
      setCartId(null);
      setLastSyncedAt(null);
      isFirstMergeDone.current = false;
      return;
    }

    // F5 / Refresh con sesión activa
    if (currentUserId && prevUserId === undefined && !isFirstMergeDone.current) {
      performPullAndMerge();
      return;
    }

  }, [user, authLoading, setCart, setCartId, setSyncStatus, clearCart, setLastSyncedAt]);

  // Sincronización continua de cambios locales hacia Supabase (Push con reconciliación OCC)
  useEffect(() => {
    if (!user?.id || !isFirstMergeDone.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        setSyncStatus('syncing');
        // Leer siempre el estado más reciente del store para evitar cierres obsoletos (stale closures)
        const currentLastSyncedAt = useCartStore.getState().lastSyncedAt;
        const currentCart = useCartStore.getState().cart;

        const newSyncData = await pushCartToSupabase(user.id, currentCart, currentLastSyncedAt);
        
        // Si el push reconcilió ítems por conflicto OCC, actualizar el carrito local sin duplicar
        if (newSyncData.reconciledCart) {
          setCart(newSyncData.reconciledCart);
        }
        if (newSyncData.cartId) {
          setCartId(newSyncData.cartId);
        }
        setLastSyncedAt(newSyncData.updatedAt);
        setSyncStatus('synced');
      } catch (err: any) {
        if (err.message === 'OCC_PERSISTENT_CONFLICT' || err.message === 'STALE_DATA') {
           console.warn('Conflicto OCC persistente detectado en CartSync.');
           setSyncStatus('error');
        } else {
           console.error('Error sincronizando carrito (debounce):', err);
           setSyncStatus('error');
        }
      }
    }, 1500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [cart, user?.id, setCart, setCartId, setLastSyncedAt, setSyncStatus]);

  return null;
}
