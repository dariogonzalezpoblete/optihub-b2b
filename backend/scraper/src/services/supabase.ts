import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { OptiHubProduct } from '../types';
import { CONFIG } from '../config';
import { Logger, withRetry } from '../utils/logger';

export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
    if (CONFIG.SUPABASE.URL && CONFIG.SUPABASE.KEY) {
      this.client = createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.KEY, {
        auth: { persistSession: false },
      });
      Logger.info('Supabase client initialized successfully.');
    } else {
      Logger.warn('Supabase credentials not configured in environment. Database sync will run in dry-run mode.');
    }
  }

  public isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Uploads an optimized image buffer to Supabase Storage and returns its public URL
   */
  public async uploadImage(filename: string, buffer: Buffer, contentType: string = 'image/webp'): Promise<string | null> {
    if (!this.client) return null;

    try {
      return await withRetry(
        async () => {
          if (!this.client) return null;
          const { error } = await this.client.storage
            .from(CONFIG.SUPABASE.BUCKET_NAME)
            .upload(filename, buffer, {
              contentType,
              upsert: true,
            });

          if (error) {
            throw new Error(`Storage upload error (${filename}): ${error.message}`);
          }

          const { data } = this.client.storage
            .from(CONFIG.SUPABASE.BUCKET_NAME)
            .getPublicUrl(filename);

          return data.publicUrl;
        },
        {
          retries: 3,
          delayMs: 1000,
          operationName: `Upload image ${filename}`,
        }
      );
    } catch (err) {
      Logger.warn(`Image upload failed for ${filename}:`, err);
      return null;
    }
  }

  /**
   * Fetches existing brand records from Supabase to preserve images and reconcile inventory
   */
  public async getExistingBrandRecords(brand: string): Promise<Map<string, { stock: number; imagen_principal?: string; imagenes_secundarias?: string }>> {
    const map = new Map<string, { stock: number; imagen_principal?: string; imagenes_secundarias?: string }>();
    if (!this.client) return map;

    try {
      const pageSize = 1000;
      let start = 0;

      while (true) {
        const { data, error } = await this.client
          .from(CONFIG.SUPABASE.TABLE_MARCOS)
          .select('id_ext, stock, imagen_principal, imagenes_secundarias')
          .ilike('marca', `%${brand}%`)
          .range(start, start + pageSize - 1);

        if (error) {
          Logger.warn(`Error querying existing brand records for ${brand}: ${error.message}`);
          break;
        }

        if (!data || data.length === 0) break;

        for (const row of data) {
          map.set(row.id_ext, {
            stock: row.stock || 0,
            imagen_principal: row.imagen_principal,
            imagenes_secundarias: row.imagenes_secundarias,
          });
        }

        if (data.length < pageSize) break;
        start += pageSize;
      }

      Logger.info(`Preloaded ${map.size} existing items for brand '${brand}' from Supabase.`);
    } catch (err) {
      Logger.warn(`Failed to preload existing records for brand ${brand}:`, err);
    }

    return map;
  }

  /**
   * Fetches all unique brands currently loaded in the marcos database
   */
  public async getAllCatalogBrands(): Promise<string[]> {
    if (!this.client) return [];
    try {
      const { data, error } = await this.client
        .from(CONFIG.SUPABASE.TABLE_MARCOS)
        .select('marca');

      if (error || !data) return [];
      const set = new Set<string>();
      data.forEach((row) => {
        if (row.marca && row.marca.trim()) {
          set.add(row.marca.trim());
        }
      });
      return Array.from(set).sort();
    } catch (e) {
      Logger.warn('Error fetching all catalog brands from Supabase:', e);
      return [];
    }
  }

  /**
   * Updates ONLY the stock column for existing products in Supabase.
   * Completely preserves existing images, attributes, and custom metadata.
   */
  public async updateStockBatch(
    items: Array<{ id_ext: string; stock: number }>,
    concurrency: number = 20
  ): Promise<number> {
    if (!this.client || items.length === 0) return 0;

    let updatedCount = 0;
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (item) => {
          if (!this.client) return;
          const { error } = await this.client
            .from(CONFIG.SUPABASE.TABLE_MARCOS)
            .update({ stock: Math.min(50, Math.max(0, item.stock)) })
            .eq('id_ext', item.id_ext);

          if (!error) {
            updatedCount++;
          } else {
            Logger.warn(`Failed to update stock for ${item.id_ext}: ${error.message}`);
          }
        })
      );
    }

    Logger.success(`Stock actualizado exitosamente para ${updatedCount}/${items.length} productos existentes.`);
    return updatedCount;
  }

  /**
   * Updates specific fields for an existing product (e.g. secondary image + stock)
   */
  public async updateProductPartial(id_ext: string, fields: Record<string, unknown>): Promise<boolean> {
    if (!this.client) return false;
    try {
      const { error } = await this.client
        .from(CONFIG.SUPABASE.TABLE_MARCOS)
        .update(fields)
        .eq('id_ext', id_ext);

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Batch upsert transformed products to Supabase marcos table
   */
  public async upsertBatch(products: OptiHubProduct[], chunkSize: number = 50): Promise<number> {
    if (!this.client || products.length === 0) {
      return 0;
    }

    let totalSynced = 0;

    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize).map(p => ({
        ...p,
        stock: Math.min(50, Math.max(0, p.stock))
      }));

      await withRetry(
        async () => {
          if (!this.client) return;
          const { error } = await this.client
            .from(CONFIG.SUPABASE.TABLE_MARCOS)
            .upsert(chunk, { onConflict: 'id_ext' });

          if (error) {
            throw new Error(`Supabase upsert error: ${error.message}`);
          }
        },
        {
          retries: 3,
          delayMs: 1200,
          operationName: `Batch upsert (${chunk.length} products)`,
        }
      );

      totalSynced += chunk.length;
      Logger.success(`Synced batch to database: ${totalSynced}/${products.length} products upserted.`);
    }

    return totalSynced;
  }

  /**
   * Deletes products that are no longer present in provider catalog (discontinued or stock <= 0)
   */
  public async syncOutOfStock(brand: string, scannedIds: Set<string>): Promise<number> {
    if (!this.client || scannedIds.size === 0) return 0;

    try {
      const existing = await this.getExistingBrandRecords(brand);
      const outOfStockIds: string[] = [];

      for (const [idExt] of existing.entries()) {
        if (!scannedIds.has(idExt)) {
          outOfStockIds.push(idExt);
        }
      }

      if (outOfStockIds.length === 0) {
        Logger.info(`Inventory reconciliation: zero items of '${brand}' to delete.`);
        return 0;
      }

      Logger.warn(`Deleting ${outOfStockIds.length} discontinued/out-of-stock items from database for '${brand}'...`);

      const chunkSize = 100;
      let deletedCount = 0;

      for (let i = 0; i < outOfStockIds.length; i += chunkSize) {
        const chunk = outOfStockIds.slice(i, i + chunkSize);
        const { error } = await this.client
          .from(CONFIG.SUPABASE.TABLE_MARCOS)
          .delete()
          .in('id_ext', chunk);

        if (error) {
          Logger.error(`Failed to delete out-of-stock batch: ${error.message}`);
        } else {
          deletedCount += chunk.length;
        }
      }

      Logger.success(`Successfully deleted ${deletedCount} out-of-stock products from database.`);
      return deletedCount;
    } catch (err) {
      Logger.error(`Error in syncOutOfStock for ${brand}:`, err);
      return 0;
    }
  }
}
