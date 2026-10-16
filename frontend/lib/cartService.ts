import { supabase } from '@/lib/supabaseClient';
import { CartItem as LocalCartItem, Producto } from '@/types/product';
import { getValidStock, useCartStore } from '@/store/useCartStore';

// ==============================================================================
// 1. SERIALIZACIÓN DE OPERACIONES SOBRE EL CARRITO (MUTEX / QUEUE)
// ==============================================================================

/**
 * Cola de sincronización para serializar todas las operaciones sobre el carrito.
 * Garantiza que nunca se ejecuten dos llamadas simultáneas a Supabase para el mismo carrito
 * desde distintas partes de la aplicación (por ejemplo, CartSync y el checkout).
 */
let syncQueue: Promise<unknown> = Promise.resolve();

export function withCartSyncLock<T>(task: () => Promise<T>, timeoutMs = 15000): Promise<T> {
  const runWithTimeout = async (): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT_CART_SYNC: La sincronización del carrito tardó demasiado tiempo.'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const next = syncQueue.then(runWithTimeout, runWithTimeout);
  // Mantener la cola avanzando independientemente de si la tarea anterior falló o tuvo éxito
  syncQueue = next.catch(() => {});
  return next;
}

// ==============================================================================
// 2. RECONCILIACIÓN PURA SIN DUPLICACIÓN DE CANTIDADES
// ==============================================================================

/**
 * Reconcilia los ítems locales con los ítems remotos ante un conflicto OCC o tras un refresco,
 * garantizando que NUNCA se sumen dos veces las unidades del mismo producto (evita 8 + 8 = 16).
 *
 * Reglas de reconciliación:
 * 1. Para productos en el carrito local: se preserva la cantidad deseada por el usuario en esta sesión,
 *    saneada según el stock disponible (sin sumar la cantidad de la BD).
 * 2. Para productos que existen en la BD remota pero no estaban en el carrito local (por ejemplo,
 *    agregados simultáneamente desde otra pestaña o dispositivo): se incorporan con su cantidad remota,
 *    saneada según el stock disponible.
 */
export function reconcileCartItems(
  localItems: LocalCartItem[],
  remoteDbItems: { product_id: string; quantity: number }[],
  catalogProducts: Producto[]
): LocalCartItem[] {
  const catalogMap = new Map<string, Producto>();
  catalogProducts.forEach((p) => {
    if (p.id_ext) catalogMap.set(p.id_ext, p);
  });

  const remoteMap = new Map<string, number>();
  remoteDbItems.forEach((item) => {
    remoteMap.set(item.product_id, item.quantity);
  });

  const reconciledQuantities = new Map<string, number>();

  // 1. Conservar los ítems locales con la intención del usuario en esta sesión (sin sumar remoto)
  localItems.forEach((localItem) => {
    const pid = localItem.producto?.id_ext;
    if (!pid) return;
    const catalogItem = catalogMap.get(pid);
    const stockToUse = catalogItem ? catalogItem.stock : localItem.producto.stock;
    const maxStock = getValidStock(stockToUse);
    const validQty = maxStock > 0 ? Math.min(localItem.cantidad, maxStock) : localItem.cantidad;
    if (validQty > 0) {
      reconciledQuantities.set(pid, validQty);
    }
  });

  // 2. Incorporar ítems remotos no presentes en local (ej. añadidos desde otra pestaña)
  remoteDbItems.forEach((remoteItem) => {
    if (!reconciledQuantities.has(remoteItem.product_id)) {
      const catalogItem = catalogMap.get(remoteItem.product_id);
      const maxStock = catalogItem ? getValidStock(catalogItem.stock) : 9999;
      const validQty = maxStock > 0 ? Math.min(remoteItem.quantity, maxStock) : remoteItem.quantity;
      if (validQty > 0) {
        reconciledQuantities.set(remoteItem.product_id, validQty);
      }
    }
  });

  // 3. Generar la lista final con información de producto completa
  const finalCart: LocalCartItem[] = [];
  reconciledQuantities.forEach((qty, pid) => {
    const localExisting = localItems.find((i) => i.producto?.id_ext === pid);
    const catalogProduct = catalogMap.get(pid);
    const productInfo = catalogProduct || localExisting?.producto;
    if (productInfo) {
      finalCart.push({
        producto: productInfo,
        cantidad: qty,
      });
    }
  });

  return finalCart;
}

// ==============================================================================
// 3. GESTIÓN ATÓMICA DE CARRITO ACTIVO
// ==============================================================================

/**
 * Obtiene el carrito activo existente del usuario en Supabase o crea uno nuevo de manera atómica.
 * Si ocurre una condición de carrera (por ejemplo, múltiples pestañas o peticiones simultáneas),
 * maneja el error de restricción única ('unique_active_cart_per_user') y recupera el carrito activo ya creado.
 */
export async function getOrCreateActiveCart(userId: string): Promise<{ id: string; updatedAt: string }> {
  // 1. Buscar carrito activo existente
  const { data: existingCart, error: fetchError } = await supabase
    .from('carts')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    console.error('[cartService] Error buscando carrito activo:', fetchError);
    throw fetchError;
  }

  if (existingCart?.id) {
    return { id: existingCart.id, updatedAt: existingCart.updated_at };
  }

  // 2. Si no existe, crear uno nuevo
  const { data: newCart, error: insertError } = await supabase
    .from('carts')
    .insert({ user_id: userId, status: 'active' })
    .select('id, updated_at')
    .single();

  if (!insertError && newCart?.id) {
    return { id: newCart.id, updatedAt: newCart.updated_at };
  }

  // 3. Manejo de condición de carrera: si el insert falló por duplicidad (unique_active_cart_per_user),
  // recuperar el carrito activo que acaba de ser insertado por la petición concurrente.
  const { data: retryCart, error: retryError } = await supabase
    .from('carts')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (retryError || !retryCart?.id) {
    throw insertError || retryError || new Error('No se pudo inicializar el carrito activo en la base de datos.');
  }

  return { id: retryCart.id, updatedAt: retryCart.updated_at };
}

// ==============================================================================
// 4. PUSH CON CONTROL OCC Y RECUPERACIÓN SEGURA (HASTA 3 REINTENTOS)
// ==============================================================================

/**
 * Guarda los ítems locales en Supabase mediante la RPC 'sync_cart'.
 * Si se detecta un conflicto OCC ('stale'):
 * 1. Obtiene la versión remota vigente y los ítems actuales.
 * 2. Reconcilia los ítems sin duplicar cantidades (evita 8 + 8 = 16).
 * 3. Reintenta la escritura con la nueva versión hasta un máximo de 3 intentos.
 * 4. Si el conflicto persiste tras 3 intentos, lanza 'OCC_PERSISTENT_CONFLICT'.
 */
export async function pushCartToSupabase(
  userId: string,
  localCart: LocalCartItem[],
  lastSyncedAt: string | null,
  maxRetries = 3
): Promise<{ updatedAt: string; cartId: string; reconciledCart?: LocalCartItem[] }> {
  return withCartSyncLock(async () => {
    const { id: cartId, updatedAt: initialUpdatedAt } = await getOrCreateActiveCart(userId);
    let currentLastSyncedAt = lastSyncedAt || initialUpdatedAt;
    let currentCartToSync = localCart;
    let reconciledResultCart: LocalCartItem[] | undefined = undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const itemsPayload = currentCartToSync
        .filter((item) => item.producto?.id_ext)
        .map((item) => {
          const validStock = getValidStock(item.producto.stock);
          const qty = validStock > 0 ? Math.min(item.cantidad, validStock) : item.cantidad;
          return {
            product_id: item.producto.id_ext,
            quantity: Math.min(qty, 9999),
          };
        });

      const { data: rpcData, error: rpcError } = await supabase.rpc('sync_cart', {
        p_cart_id: cartId,
        p_items: itemsPayload,
        p_last_updated_at: currentLastSyncedAt,
      });

      if (rpcError) {
        console.error(`[cartService] Error en sync_cart (intento ${attempt}/${maxRetries}):`, rpcError);
        throw rpcError;
      }

      // Camino feliz: sincronización exitosa
      if (rpcData && rpcData.success) {
        return {
          updatedAt: rpcData.updated_at,
          cartId,
          reconciledCart: reconciledResultCart,
        };
      }

      // Conflicto OCC detectado (el carrito remoto es más reciente)
      if (rpcData && !rpcData.success && rpcData.reason === 'stale') {
        console.warn(
          `[cartService] Conflicto OCC detectado (intento ${attempt}/${maxRetries}). Reconciliando con versión remota...`
        );

        if (attempt === maxRetries) {
          throw new Error('OCC_PERSISTENT_CONFLICT');
        }

        // 1. Obtener la versión remota vigente y los ítems actuales
        const { data: remoteCart, error: cartFetchError } = await supabase
          .from('carts')
          .select('updated_at')
          .eq('id', cartId)
          .single();

        if (cartFetchError || !remoteCart) {
          throw cartFetchError || new Error('No se pudo verificar la versión remota del carrito.');
        }

        const { data: remoteItems, error: itemsFetchError } = await supabase
          .from('cart_items')
          .select('product_id, quantity')
          .eq('cart_id', cartId);

        if (itemsFetchError) throw itemsFetchError;

        // 2. Obtener datos de catálogo para respetar límites reales de stock
        const allProductIds = Array.from(
          new Set([
            ...currentCartToSync.map((i) => i.producto?.id_ext).filter(Boolean),
            ...(remoteItems || []).map((i) => i.product_id).filter(Boolean),
          ])
        );

        const { data: catalogProducts, error: catalogError } = await supabase
          .from('marcos')
          .select('*')
          .in('id_ext', allProductIds);

        if (catalogError) throw catalogError;

        // 3. Reconciliar sin duplicar cantidades
        currentCartToSync = reconcileCartItems(
          currentCartToSync,
          remoteItems || [],
          (catalogProducts || []) as Producto[]
        );
        reconciledResultCart = currentCartToSync;

        // 4. Actualizar versión OCC para el siguiente reintento
        currentLastSyncedAt = remoteCart.updated_at || rpcData.current_updated_at;
      }
    }

    throw new Error('OCC_PERSISTENT_CONFLICT');
  });
}

// ==============================================================================
// 5. SINCRONIZACIÓN INMEDIATA CONFIRMADA PARA CHECKOUT
// ==============================================================================

/**
 * Sincroniza de forma inmediata y confirmada el carrito local a Supabase antes de iniciar el checkout.
 * Ejecuta push con reconciliación OCC automática, devolviendo el UUID y timestamp confirmados.
 */
export async function ensureCartSynced(
  userId: string,
  localCart: LocalCartItem[]
): Promise<{ cartId: string; updatedAt: string; reconciledCart?: LocalCartItem[] }> {
  const currentSyncedAt = useCartStore.getState().lastSyncedAt;
  return await pushCartToSupabase(userId, localCart, currentSyncedAt, 3);
}

// ==============================================================================
// 6. MERGE INICIAL EN LOGIN / PULL SEGURO
// ==============================================================================

/**
 * Combina el carrito local con el remoto en el primer login o carga de sesión.
 * Si el carrito local ya estaba sincronizado con esta cuenta (ej. recarga F5),
 * NO suma las cantidades para evitar duplicar productos.
 */
export async function mergeAndSyncCart(
  userId: string,
  localCart: LocalCartItem[]
): Promise<{ cart: LocalCartItem[]; updatedAt: string; cartId: string }> {
  return withCartSyncLock(async () => {
    try {
      const { id: cartId, updatedAt: currentUpdatedAt } = await getOrCreateActiveCart(userId);

      const { data: dbItems, error: itemsError } = await supabase
        .from('cart_items')
        .select('id, product_id, quantity')
        .eq('cart_id', cartId);

      if (itemsError) throw itemsError;

      // Obtener productos de catálogo
      const allProductIds = Array.from(
        new Set([
          ...localCart.map((i) => i.producto?.id_ext).filter(Boolean),
          ...(dbItems || []).map((i) => i.product_id).filter(Boolean),
        ])
      );

      let catalogProducts: Producto[] = [];
      if (allProductIds.length > 0) {
        const { data: marcosDb, error: marcosError } = await supabase
          .from('marcos')
          .select('*')
          .in('id_ext', allProductIds);

        if (marcosError) throw marcosError;
        catalogProducts = (marcosDb || []) as Producto[];
      }

      // Comprobar si el carrito local ya pertenecía a este carrito remoto (F5 / sesión existente)
      const isAlreadySynced =
        useCartStore.getState().cartId === cartId && useCartStore.getState().lastSyncedAt !== null;

      let reconciledCart: LocalCartItem[];

      if (isAlreadySynced) {
        // En F5 / sesión existente: reconciliar usando la intención local saneada sin sumar unidades
        reconciledCart = reconcileCartItems(localCart, dbItems || [], catalogProducts);
      } else {
        // En login genuino (invitado con ítems locales combinándose por primera vez con ítems remotos):
        const mergedMap = new Map<string, number>();

        (dbItems || []).forEach((item) => {
          mergedMap.set(item.product_id, item.quantity);
        });

        localCart.forEach((localItem) => {
          const pid = localItem.producto?.id_ext;
          if (!pid) return;
          const catalogItem = catalogProducts.find((p) => p.id_ext === pid);
          const maxStock = catalogItem ? getValidStock(catalogItem.stock) : getValidStock(localItem.producto.stock);
          const itemQty = maxStock > 0 ? Math.min(localItem.cantidad, maxStock) : localItem.cantidad;

          if (mergedMap.has(pid)) {
            const existing = mergedMap.get(pid)!;
            // Combinar solo si no excede el stock máximo
            const combined = existing + itemQty;
            const finalQty = maxStock > 0 ? Math.min(combined, maxStock) : Math.min(combined, 9999);
            mergedMap.set(pid, finalQty);
          } else {
            mergedMap.set(pid, itemQty);
          }
        });

        reconciledCart = [];
        mergedMap.forEach((qty, pid) => {
          const product = catalogProducts.find((p) => p.id_ext === pid) || localCart.find((i) => i.producto?.id_ext === pid)?.producto;
          if (product && qty > 0) {
            reconciledCart.push({
              producto: product,
              cantidad: qty,
            });
          }
        });
      }

      // Ejecutar RPC sync_cart con versión actual
      const itemsPayload = reconciledCart.map((i) => ({
        product_id: i.producto.id_ext,
        quantity: i.cantidad,
      }));

      const { data: rpcData, error: rpcError } = await supabase.rpc('sync_cart', {
        p_cart_id: cartId,
        p_items: itemsPayload,
        p_last_updated_at: currentUpdatedAt,
      });

      if (rpcError) throw rpcError;

      let finalUpdatedAt = currentUpdatedAt;
      if (rpcData && rpcData.success) {
        finalUpdatedAt = rpcData.updated_at;
      }

      return { cart: reconciledCart, updatedAt: finalUpdatedAt, cartId };
    } catch (error) {
      console.error('Error en mergeAndSyncCart:', error);
      throw error;
    }
  });
}
