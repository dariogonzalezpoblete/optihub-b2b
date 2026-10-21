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
  public async getExistingBrandRecords(brand: string): Promise<Map<string, { stock: number; imagen_principal?: string }>> {
    const map = new Map<string, { stock: number; imagen_principal?: string }>();
    if (!this.client) return map;

    try {
      const pageSize = 1000;
      let start = 0;

      while (true) {
        const { data, error } = await this.client
          .from(CONFIG.SUPABASE.TABLE_MARCOS)
          .select('id_ext, stock, imagen_principal')
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
   * Batch upsert transformed products to Supabase marcos table
   */
  public async upsertBatch(products: OptiHubProduct[], chunkSize: number = 50): Promise<number> {
    if (!this.client || products.length === 0) {
      return 0;
    }

    let totalSynced = 0;

    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);

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
   * Marks products that are no longer present in provider catalog as stock = 0
   */
  public async syncOutOfStock(brand: string, scannedIds: Set<string>): Promise<number> {
    if (!this.client || scannedIds.size === 0) return 0;

    try {
      const existing = await this.getExistingBrandRecords(brand);
      const outOfStockIds: string[] = [];

      for (const [idExt, meta] of existing.entries()) {
        if (!scannedIds.has(idExt) && meta.stock > 0) {
          outOfStockIds.push(idExt);
        }
      }

      if (outOfStockIds.length === 0) {
        Logger.info(`Inventory reconciliation: zero items of '${brand}' to mark out-of-stock.`);
        return 0;
      }

      Logger.warn(`Marking ${outOfStockIds.length} discontinued/out-of-stock items as stock = 0 for '${brand}'...`);

      const chunkSize = 100;
      let updatedCount = 0;

      for (let i = 0; i < outOfStockIds.length; i += chunkSize) {
        const chunk = outOfStockIds.slice(i, i + chunkSize);
        const { error } = await this.client
          .from(CONFIG.SUPABASE.TABLE_MARCOS)
          .update({ stock: 0 })
          .in('id_ext', chunk);

        if (error) {
          Logger.error(`Failed to zero-out stock for batch: ${error.message}`);
        } else {
          updatedCount += chunk.length;
        }
      }

      Logger.success(`Successfully updated ${updatedCount} products to stock = 0.`);
      return updatedCount;
    } catch (err) {
      Logger.error(`Error in syncOutOfStock for ${brand}:`, err);
      return 0;
    }
  }
}
