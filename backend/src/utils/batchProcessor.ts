import { ConvexClient } from 'convex/browser';
import { api } from '../lib/convex-api';
import { Id } from '../lib/convex-api';

interface BatchProcessOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  maxRetries?: number;
  onProgress?: (progress: number, message: string) => Promise<void>;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => Promise<void>;
}

export class BatchProcessor {
  private convex: ConvexClient;
  private options: Required<BatchProcessOptions>;

  constructor(convex: ConvexClient, options: BatchProcessOptions = {}) {
    this.convex = convex;
    this.options = {
      batchSize: options.batchSize || 5,
      delayBetweenBatches: options.delayBetweenBatches || 2000,
      maxRetries: options.maxRetries || 3,
      onProgress: options.onProgress || (async () => {}),
      onLog: options.onLog || (async () => {}),
    };
  }

  async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    itemDescriptor: (item: T) => string = () => 'item'
  ): Promise<{ success: R[]; failed: Array<{ item: T; error: string }> }> {
    const results: R[] = [];
    const failures: Array<{ item: T; error: string }> = [];
    const totalItems = items.length;
    const totalBatches = Math.ceil(totalItems / this.options.batchSize);

    await this.options.onLog(
      `Starting batch processing of ${totalItems} items in ${totalBatches} batches`,
      'info'
    );

    for (let i = 0; i < totalItems; i += this.options.batchSize) {
      const batch = items.slice(i, i + this.options.batchSize);
      const batchNumber = Math.floor(i / this.options.batchSize) + 1;

      await this.options.onLog(
        `Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`,
        'info'
      );

      // Process batch items in parallel with retry logic
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          let lastError: Error | null = null;
          
          for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
              const result = await processor(item);
              return { success: true, result, item };
            } catch (error: any) {
              lastError = error;
              
              // Check if it's a rate limit error
              if (error.message?.includes('429') || error.message?.includes('rate')) {
                const backoffDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
                await this.options.onLog(
                  `Rate limited on ${itemDescriptor(item)}, retrying in ${backoffDelay}ms (attempt ${attempt}/${this.options.maxRetries})`,
                  'warn'
                );
                await this.delay(backoffDelay);
              } else if (attempt < this.options.maxRetries) {
                await this.options.onLog(
                  `Error processing ${itemDescriptor(item)}, retrying (attempt ${attempt}/${this.options.maxRetries}): ${error.message}`,
                  'warn'
                );
                await this.delay(500 * attempt);
              }
            }
          }
          
          // All retries failed
          const errorMessage = lastError?.message || 'Unknown error';
          await this.options.onLog(
            `Failed to process ${itemDescriptor(item)} after ${this.options.maxRetries} attempts: ${errorMessage}`,
            'error'
          );
          return { success: false, error: errorMessage, item };
        })
      );

      // Collect results
      batchResults.forEach((result) => {
        if (result.success) {
          results.push(result.result as R);
        } else {
          failures.push({ item: result.item, error: result.error as string });
        }
      });

      // Update progress
      const processed = Math.min(i + batch.length, totalItems);
      const progress = Math.floor((processed / totalItems) * 100);
      await this.options.onProgress(
        progress,
        `Processed ${processed}/${totalItems} items (${results.length} successful, ${failures.length} failed)`
      );

      // Delay between batches if not the last batch
      if (i + this.options.batchSize < totalItems) {
        await this.delay(this.options.delayBetweenBatches);
      }
    }

    await this.options.onLog(
      `Batch processing completed: ${results.length} successful, ${failures.length} failed`,
      failures.length > 0 ? 'warn' : 'info'
    );

    return { success: results, failed: failures };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Optimized batch upsert for price items
  async upsertPriceItems(
    items: any[],
    userId: Id<'users'>,
    jobId?: Id<'importJobs'>
  ): Promise<{ created: number; updated: number; failed: number; errors: string[] }> {
    const stats = { created: 0, updated: 0, failed: 0, errors: [] as string[] };

    const { success } = await this.processBatch(
      items,
      async (item) => {
        const result = await this.convex.mutation(api.priceItems.upsert, {
          ...item,
          userId,
        });
        
        if (result.action === 'created') {
          stats.created++;
        } else if (result.action === 'updated') {
          stats.updated++;
        }
        
        return result;
      },
      (item) => item.code || item.description || 'unknown item'
    );

    stats.failed = items.length - success.length;
    
    return stats;
  }
}