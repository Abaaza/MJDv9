import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import { MatchingService } from './matching.service';
import { ConvexBatchProcessor } from '../utils/convexBatch';

interface ProcessingResult {
  success: boolean;
  matchedCount: number;
  results?: any[];
  error?: string;
}

export class LambdaProcessorService {
  private convex = getConvexClient();
  private matchingService = MatchingService.getInstance();
  
  // Lambda-optimized settings
  private readonly LAMBDA_BATCH_SIZE = 20; // Increased batch size for faster processing
  private readonly LAMBDA_ITEM_THRESHOLD = 2000; // Process synchronously if less than this
  private readonly LAMBDA_TIMEOUT_BUFFER = 30000; // 30 seconds buffer before Lambda timeout
  private readonly CONVEX_UPDATE_INTERVAL = 100; // Update progress every 100 items
  private readonly MAX_CONCURRENT_MATCHES = 5; // Process multiple matches in parallel
  
  /**
   * Check if we're running in Lambda environment
   */
  static isLambdaEnvironment(): boolean {
    return !!process.env.AWS_LAMBDA_FUNCTION_NAME || 
           !!process.env.LAMBDA_TASK_ROOT ||
           !!process.env.AWS_EXECUTION_ENV;
  }
  
  /**
   * Process items synchronously for small jobs in Lambda
   */
  async processSynchronously(
    jobId: string,
    userId: string,
    items: any[],
    method: string,
    startTime: number = Date.now()
  ): Promise<ProcessingResult> {
    console.log(`[LambdaProcessor] Starting synchronous processing for job ${jobId}`);
    
    try {
      // Filter items with quantities
      const itemsWithQuantities = items.filter(item => 
        item.quantity !== undefined && item.quantity !== null && item.quantity > 0
      );
      const contextHeaders = items.length - itemsWithQuantities.length;
      
      console.log(`[LambdaProcessor] Processing ${itemsWithQuantities.length} items (${contextHeaders} context headers)`);
      
      // Update initial status
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'matching' as any,
        progress: 10,
        progressMessage: `Starting Lambda processing of ${itemsWithQuantities.length} items...`,
      });
      
      // Load price items
      const priceItems = await this.convex.query(api.priceItems.getActive);
      console.log(`[LambdaProcessor] Loaded ${priceItems.length} price items`);
      
      // Process items in optimized batches
      const results: any[] = [];
      let matchedCount = 0;
      let processedCount = 0;
      let lastProgressUpdate = 0;
      
      const totalBatches = Math.ceil(items.length / this.LAMBDA_BATCH_SIZE);
      console.log(`[LambdaProcessor] Processing ${items.length} items in ${totalBatches} batches`);
      
      // Process batches with optimizations
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check if we're approaching Lambda timeout
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > (300000 - this.LAMBDA_TIMEOUT_BUFFER)) { // 5 min Lambda limit
          console.warn(`[LambdaProcessor] Approaching Lambda timeout, stopping at batch ${batchIndex}`);
          
          // Save what we have so far
          if (results.length > 0) {
            await this.saveResultsInChunks(results.slice(0, processedCount), jobId);
          }
          
          // Update status to indicate partial completion
          await this.convex.mutation(api.priceMatching.updateJobStatus, {
            jobId: jobId as any,
            status: 'completed' as any,
            progress: 100,
            progressMessage: `Partially completed: ${matchedCount} matches out of ${processedCount} items processed (timeout)`,
            matchedCount,
          });
          
          return {
            success: true,
            matchedCount,
            results: results.slice(0, processedCount),
          };
        }
        
        const startIdx = batchIndex * this.LAMBDA_BATCH_SIZE;
        const batch = items.slice(startIdx, startIdx + this.LAMBDA_BATCH_SIZE);
        
        // Process batch in parallel for better performance
        const batchPromises = [];
        for (let i = 0; i < batch.length; i += this.MAX_CONCURRENT_MATCHES) {
          const subBatch = batch.slice(i, i + this.MAX_CONCURRENT_MATCHES);
          batchPromises.push(this.processBatch(subBatch, priceItems, method, jobId));
        }
        
        const batchResultArrays = await Promise.all(batchPromises);
        const batchResults = batchResultArrays.flat();
        results.push(...batchResults);
        
        // Count matches
        const batchMatches = batchResults.filter(r => 
          r.matchMethod !== 'CONTEXT' && r.confidence > 0
        ).length;
        matchedCount += batchMatches;
        processedCount += batch.length;
        
        // Update progress less frequently to reduce Convex calls
        if (processedCount - lastProgressUpdate >= this.CONVEX_UPDATE_INTERVAL || batchIndex === totalBatches - 1) {
          const progress = Math.min(85, Math.round((processedCount / items.length) * 85));
          await this.convex.mutation(api.priceMatching.updateJobStatus, {
            jobId: jobId as any,
            status: 'matching' as any,
            progress,
            progressMessage: `Processed ${processedCount}/${items.length} items`,
            matchedCount,
          });
          lastProgressUpdate = processedCount;
        }
      }
      
      // Save results using optimized method
      console.log(`[LambdaProcessor] Saving ${results.length} results to database`);
      await this.saveResultsInChunks(results, jobId);
      
      // Final update
      const finalItemsWithQty = results.filter(r => r.matchMethod !== 'CONTEXT').length;
      const matchRate = finalItemsWithQty > 0 ? Math.round((matchedCount / finalItemsWithQty) * 100) : 0;
      
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'completed' as any,
        progress: 100,
        progressMessage: `Completed: ${matchedCount} matches out of ${finalItemsWithQty} items (${matchRate}% success rate)`,
        matchedCount,
      });
      
      console.log(`[LambdaProcessor] Job ${jobId} completed successfully`);
      
      return {
        success: true,
        matchedCount,
        results,
      };
      
    } catch (error: any) {
      console.error(`[LambdaProcessor] Error processing job ${jobId}:`, error);
      
      // Update job status to failed
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'failed' as any,
        error: error.message,
      });
      
      return {
        success: false,
        matchedCount: 0,
        error: error.message,
      };
    }
  }
  
  /**
   * Process a batch of items
   */
  private async processBatch(
    batch: any[],
    priceItems: any[],
    method: string,
    jobId: string
  ): Promise<any[]> {
    const results = [];
    
    for (const item of batch) {
      // Check if this is a context header
      const hasQuantity = item.quantity !== undefined && 
                         item.quantity !== null && 
                         item.quantity !== 0;
      
      if (!hasQuantity) {
        // Context header - save without matching
        results.push({
          jobId: jobId as any,
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          matchedItemId: undefined,
          matchedDescription: '',
          matchedCode: '',
          matchedUnit: '',
          matchedRate: 0,
          confidence: 0,
          isManuallyEdited: false,
          matchMethod: 'CONTEXT',
          totalPrice: 0,
          notes: 'Context header (no quantity)',
        });
        continue;
      }
      
      try {
        // Match the item
        const matchResult = await this.matchingService.matchItem(
          item.description,
          method as any,
          priceItems,
          item.contextHeaders || []
        );
        
        results.push({
          jobId: jobId as any,
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: item.quantity || 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          matchedItemId: matchResult.matchedItemId || undefined,
          matchedDescription: matchResult.matchedDescription || '',
          matchedCode: matchResult.matchedCode || '',
          matchedUnit: matchResult.matchedUnit || '',
          matchedRate: matchResult.matchedRate || 0,
          confidence: matchResult.confidence || 0,
          isManuallyEdited: false,
          matchMethod: method,
          totalPrice: (item.quantity || 0) * (matchResult.matchedRate || 0),
          notes: '',
        });
      } catch (error: any) {
        // Failed match
        results.push({
          jobId: jobId as any,
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: item.quantity || 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          matchedItemId: undefined,
          matchedDescription: '',
          matchedCode: '',
          matchedUnit: '',
          matchedRate: 0,
          confidence: 0,
          isManuallyEdited: false,
          matchMethod: method,
          totalPrice: 0,
          notes: `Error: ${error.message}`,
        });
      }
    }
    
    return results;
  }
  
  /**
   * Save results in optimized chunks
   */
  private async saveResultsInChunks(results: any[], jobId: string): Promise<void> {
    const saveChunkSize = 50; // Larger chunks for faster saving
    const totalChunks = Math.ceil(results.length / saveChunkSize);
    
    console.log(`[LambdaProcessor] Saving ${results.length} results in ${totalChunks} chunks`);
    
    // Save all chunks in parallel batches
    const parallelBatches = 5; // Save 5 chunks at a time
    for (let i = 0; i < results.length; i += saveChunkSize * parallelBatches) {
      const promises = [];
      
      for (let j = 0; j < parallelBatches && (i + j * saveChunkSize) < results.length; j++) {
        const startIdx = i + j * saveChunkSize;
        const chunk = results.slice(startIdx, startIdx + saveChunkSize);
        if (chunk.length > 0) {
          promises.push(ConvexBatchProcessor.saveMatchResults(chunk));
        }
      }
      
      // Wait for batch to complete
      await Promise.all(promises);
      
      // Update progress periodically
      if (i % 200 === 0) {
        const saveProgress = 85 + Math.round((i / results.length) * 14);
        await this.convex.mutation(api.priceMatching.updateJobStatus, {
          jobId: jobId as any,
          status: 'matching' as any,
          progress: saveProgress,
          progressMessage: `Saving results... (${Math.min(i + saveChunkSize * parallelBatches, results.length)}/${results.length})`,
        });
      }
    }
  }

  /**
   * Check if a job should be processed synchronously in Lambda
   */
  shouldProcessSynchronously(itemCount: number): boolean {
    // In Lambda, process files up to threshold synchronously
    if (LambdaProcessorService.isLambdaEnvironment()) {
      return itemCount <= this.LAMBDA_ITEM_THRESHOLD;
    }
    return false;
  }
}

// Create singleton instance
export const lambdaProcessor = new LambdaProcessorService();