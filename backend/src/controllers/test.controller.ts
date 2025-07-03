import { Request, Response } from 'express';
import { MatchingService } from '../services/matching.service.js';
import { getConvexClient } from '../config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import { ExcelService } from '../services/excel.service.js';
import fs from 'fs/promises';
import path from 'path';

const matchingService = MatchingService.getInstance();
const convex = getConvexClient();
const excelService = new ExcelService();

export async function testMatchingMethods(req: Request, res: Response): Promise<void> {
  try {
    const testDescription = req.query.description as string || "Excavation in soil not exceeding 2m deep";
    const methods: Array<'LOCAL' | 'LOCAL_UNIT' | 'COHERE' | 'OPENAI' | 'HYBRID' | 'HYBRID_CATEGORY' | 'ADVANCED'> = [
      'LOCAL', 
      'LOCAL_UNIT', 
      'COHERE', 
      'OPENAI', 
      'HYBRID', 
      'HYBRID_CATEGORY', 
      'ADVANCED'
    ];
    
    console.log(`\n=== TESTING ALL MATCHING METHODS ===`);
    console.log(`Test description: "${testDescription}"`);
    
    // Get price items once
    const priceItems = await convex.query(api.priceItems.getActive);
    console.log(`Loaded ${priceItems.length} price items`);
    
    const results: any = {};
    
    for (const method of methods) {
      console.log(`\n--- Testing ${method} method ---`);
      const startTime = Date.now();
      
      try {
        const result = await matchingService.matchItem(
          testDescription,
          method,
          priceItems
        );
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        results[method] = {
          success: true,
          duration: `${duration}ms`,
          result: {
            matchedDescription: result.matchedDescription,
            confidence: result.confidence,
            matchedRate: result.matchedRate,
            matchedUnit: result.matchedUnit,
            matchedCode: result.matchedCode
          }
        };
        
        console.log(`✅ ${method} completed in ${duration}ms`);
        console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
        console.log(`   Matched: "${result.matchedDescription}"`);
        
      } catch (error: any) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        results[method] = {
          success: false,
          duration: `${duration}ms`,
          error: error.message
        };
        
        console.log(`❌ ${method} failed in ${duration}ms`);
        console.log(`   Error: ${error.message}`);
      }
    }
    
    console.log(`\n=== TEST COMPLETE ===\n`);
    
    res.json({
      testDescription,
      priceItemCount: priceItems.length,
      results
    });
    
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: 'Test failed', details: error.message });
  }
}

export async function testSingleMethod(req: Request, res: Response): Promise<void> {
  try {
    const { method, description } = req.body;
    
    if (!method || !description) {
      res.status(400).json({ error: 'Method and description are required' });
      return;
    }
    
    console.log(`\n=== TESTING ${method} METHOD ===`);
    console.log(`Description: "${description}"`);
    
    const startTime = Date.now();
    
    const result = await matchingService.matchItem(
      description,
      method as any,
      undefined // Let it fetch price items
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Completed in ${duration}ms`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Matched: "${result.matchedDescription}"`);
    
    res.json({
      method,
      duration: `${duration}ms`,
      confidence: result.confidence,
      result
    });
    
  } catch (error: any) {
    console.error('Test error:', error);
    res.status(500).json({ 
      error: 'Method failed', 
      method: req.body.method,
      details: error.message 
    });
  }
}