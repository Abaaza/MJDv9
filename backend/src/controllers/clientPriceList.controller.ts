import { Request, Response } from 'express';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import * as ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const convexClient = new ConvexHttpClient(process.env.CONVEX_URL!);

interface AuthRequest extends Request {
  user?: {
    id: string;
    userId: string;
    email: string;
    role: string;
  };
}

export class ClientPriceListController {
  // Create a new client price list
  async createPriceList(req: AuthRequest, res: Response) {
    try {
      const { clientId, name, description, isDefault, effectiveFrom, effectiveTo } = req.body;
      const userId = req.user?.userId || req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const priceListId = await convexClient.mutation(api.clientPriceLists.create, {
        clientId,
        name,
        description,
        isDefault,
        effectiveFrom,
        effectiveTo,
        userId,
      });

      res.json({ success: true, priceListId });
    } catch (error) {
      console.error('Error creating price list:', error);
      res.status(500).json({ error: 'Failed to create price list' });
    }
  }

  // Upload and sync Excel file with client price list
  async uploadAndSyncExcel(req: AuthRequest, res: Response) {
    try {
      const { clientId, priceListId, createNew } = req.body;
      const userId = req.user?.userId || req.user?.id;

      if (!userId) {
        console.error('[ClientPriceList] No userId found in token:', req.user);
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const filePath = req.file.path;
      const fileName = req.file.originalname;

      // Read the Excel file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      let targetPriceListId = priceListId;

      // Create new price list if requested
      if (createNew || !priceListId) {
        const priceListName = req.body.priceListName || `${fileName} - ${new Date().toLocaleDateString()}`;
        console.log('[ClientPriceList] Creating new price list with userId:', userId, 'clientId:', clientId);
        targetPriceListId = await convexClient.mutation(api.clientPriceLists.create, {
          clientId,
          name: priceListName,
          description: `Imported from ${fileName}`,
          sourceFileName: fileName,
          userId,
        });
        console.log('[ClientPriceList] Created price list:', targetPriceListId);
      }

      // Process the Excel file and map items
      const mappingResults = await this.processExcelMapping(workbook, targetPriceListId, userId);

      // Store the file for future reference
      const uploadDir = path.join(process.cwd(), 'uploads', 'client-price-lists');
      await fs.mkdir(uploadDir, { recursive: true });
      const storedFileName = `${targetPriceListId}_${Date.now()}_${fileName}`;
      const storedFilePath = path.join(uploadDir, storedFileName);
      await fs.copyFile(filePath, storedFilePath);

      // Update price list with file URL
      await convexClient.mutation(api.clientPriceLists.syncFromExcel, {
        priceListId: targetPriceListId,
        sourceFileUrl: `/uploads/client-price-lists/${storedFileName}`,
        userId,
      });

      // Clean up temp file
      await fs.unlink(filePath);

      res.json({
        success: true,
        priceListId: targetPriceListId,
        mappingResults,
      });
    } catch (error) {
      console.error('Error uploading and syncing Excel:', error);
      res.status(500).json({ error: 'Failed to process Excel file' });
    }
  }

  // Process Excel file and create mappings
  private async processExcelMapping(
    workbook: ExcelJS.Workbook,
    priceListId: string,
    userId: string
  ) {
    const results = {
      totalRows: 0,
      mappedItems: 0,
      unmappedItems: 0,
      errors: [] as string[],
    };

    // Get all base price items for matching
    const basePriceItems = await convexClient.query(api.priceItems.getAll);
    
    // Create a map for quick lookup by code and description
    const priceItemsByCode = new Map<string, any>();
    const priceItemsByDescription = new Map<string, any>();
    
    basePriceItems.forEach(item => {
      if (item.code) {
        priceItemsByCode.set(item.code.toLowerCase(), item);
      }
      priceItemsByDescription.set(item.description.toLowerCase(), item);
    });

    const mappings: any[] = [];
    const clientPriceUpdates: any[] = [];

    // Process each worksheet
    for (const worksheet of workbook.worksheets) {
      // Skip summary and setup sheets
      if (worksheet.name.toLowerCase().includes('summary') || 
          worksheet.name.toLowerCase().includes('setup') ||
          worksheet.name.toLowerCase().includes('factor')) {
        continue;
      }

      // Find header row (usually contains "Item", "Description", "Unit", "Rate")
      let headerRow = 0;
      let codeCol = -1, descCol = -1, unitCol = -1, rateCol = -1;

      for (let rowNum = 1; rowNum <= Math.min(20, worksheet.rowCount); rowNum++) {
        const row = worksheet.getRow(rowNum);
        const values = row.values as any[];
        
        for (let col = 1; col <= values.length; col++) {
          const cellValue = String(values[col] || '').toLowerCase();
          if (cellValue.includes('item') || cellValue.includes('code') || cellValue.includes('ref')) {
            codeCol = col;
            headerRow = rowNum;
          }
          if (cellValue.includes('description') || cellValue.includes('desc')) {
            descCol = col;
          }
          if (cellValue.includes('unit')) {
            unitCol = col;
          }
          if (cellValue.includes('rate') || cellValue.includes('price')) {
            rateCol = col;
          }
        }
        
        if (codeCol > 0 && descCol > 0 && rateCol > 0) {
          break;
        }
      }

      if (headerRow === 0 || rateCol === -1) {
        continue; // Skip sheets without proper headers
      }

      // Process data rows
      for (let rowNum = headerRow + 1; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        
        const code = codeCol > 0 ? String(row.getCell(codeCol).value || '') : '';
        const description = descCol > 0 ? String(row.getCell(descCol).value || '') : '';
        const unit = unitCol > 0 ? String(row.getCell(unitCol).value || '') : '';
        const rateCell = row.getCell(rateCol);
        
        // Skip empty rows
        if (!code && !description) continue;
        
        results.totalRows++;

        // Get rate value (handle formulas)
        let rate = 0;
        let formula = '';
        if (rateCell.formula) {
          formula = rateCell.formula;
          rate = Number(rateCell.result) || 0;
        } else {
          rate = Number(rateCell.value) || 0;
        }

        // Skip rows with zero or invalid rates
        if (rate <= 0) continue;

        // Try to match with base price item
        let matchedItem = null;
        let matchConfidence = 0;
        let matchMethod = 'none';

        // First try exact code match
        if (code && priceItemsByCode.has(code.toLowerCase())) {
          matchedItem = priceItemsByCode.get(code.toLowerCase());
          matchConfidence = 1.0;
          matchMethod = 'code';
        }
        // Then try description match
        else if (description) {
          // Try exact description match
          if (priceItemsByDescription.has(description.toLowerCase())) {
            matchedItem = priceItemsByDescription.get(description.toLowerCase());
            matchConfidence = 0.9;
            matchMethod = 'description';
          } else {
            // Try fuzzy matching
            const descLower = description.toLowerCase();
            for (const [itemDesc, item] of priceItemsByDescription) {
              if (this.fuzzyMatch(descLower, itemDesc) > 0.8) {
                matchedItem = item;
                matchConfidence = 0.7;
                matchMethod = 'fuzzy';
                break;
              }
            }
          }
        }

        if (matchedItem) {
          results.mappedItems++;

          // Create Excel mapping
          mappings.push({
            priceItemId: matchedItem._id,
            sheetName: worksheet.name,
            rowNumber: rowNum,
            codeColumn: codeCol > 0 ? this.getColumnLetter(codeCol) : undefined,
            descriptionColumn: descCol > 0 ? this.getColumnLetter(descCol) : undefined,
            unitColumn: unitCol > 0 ? this.getColumnLetter(unitCol) : undefined,
            rateColumn: this.getColumnLetter(rateCol),
            originalCode: code,
            originalDescription: description,
            originalUnit: unit,
            originalRate: formula || rate,
            mappingConfidence: matchConfidence,
            mappingMethod: matchMethod,
          });

          // Create client price item update
          clientPriceUpdates.push({
            basePriceItemId: matchedItem._id,
            rate: rate,
            excelRow: rowNum,
            excelSheet: worksheet.name,
            excelCellRef: `${this.getColumnLetter(rateCol)}${rowNum}`,
            excelFormula: formula || undefined,
          });
        } else {
          results.unmappedItems++;
        }
      }
    }

    // Save mappings to database
    if (mappings.length > 0) {
      await convexClient.mutation(api.excelMappings.bulkCreate, {
        priceListId: priceListId as any,
        fileName: workbook.creator || 'imported.xlsx',
        mappings,
      });
    }

    // Update client price items
    if (clientPriceUpdates.length > 0) {
      const priceList = await convexClient.query(api.clientPriceLists.getById, {
        id: priceListId as any,
      });

      if (priceList) {
        await convexClient.mutation(api.clientPriceItems.updateFromExcelMapping, {
          priceListId: priceListId as any,
          mappings: clientPriceUpdates,
          userId: userId as any,
        });
      }
    }

    return results;
  }

  // Helper function to convert column number to letter
  private getColumnLetter(col: number): string {
    let letter = '';
    while (col > 0) {
      const mod = (col - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      col = Math.floor((col - mod) / 26);
    }
    return letter;
  }

  // Helper function to convert column letter to number
  private getColumnNumber(col: string): number {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num;
  }

  // Simple fuzzy matching function
  private fuzzyMatch(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Levenshtein distance for fuzzy matching
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Get all price lists for a client
  async getClientPriceLists(req: AuthRequest, res: Response) {
    try {
      const { clientId } = req.params;
      
      const priceLists = await convexClient.query(api.clientPriceLists.getByClient, {
        clientId: clientId as any,
      });

      res.json(priceLists);
    } catch (error) {
      console.error('Error fetching client price lists:', error);
      res.status(500).json({ error: 'Failed to fetch price lists' });
    }
  }

  // Get effective price for items
  async getEffectivePrices(req: AuthRequest, res: Response) {
    try {
      const { clientId } = req.params;
      const { priceItemIds, date } = req.body;

      const prices = await Promise.all(
        priceItemIds.map(async (priceItemId: string) => {
          const effectivePrice = await convexClient.query(api.clientPriceItems.getEffectivePrice, {
            clientId: clientId as any,
            priceItemId: priceItemId as any,
            date,
          });
          return {
            priceItemId,
            ...effectivePrice,
          };
        })
      );

      res.json(prices);
    } catch (error) {
      console.error('Error fetching effective prices:', error);
      res.status(500).json({ error: 'Failed to fetch effective prices' });
    }
  }

  // Update price list
  async updatePriceList(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      await convexClient.mutation(api.clientPriceLists.update, {
        id: id as any,
        ...updates,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error updating price list:', error);
      res.status(500).json({ error: 'Failed to update price list' });
    }
  }

  // Get mapping statistics
  async getMappingStats(req: AuthRequest, res: Response) {
    try {
      const { priceListId } = req.params;

      const stats = await convexClient.query(api.excelMappings.getMappingStats, {
        priceListId: priceListId as any,
      });

      res.json(stats);
    } catch (error) {
      console.error('Error fetching mapping stats:', error);
      res.status(500).json({ error: 'Failed to fetch mapping statistics' });
    }
  }

  // Verify or update a mapping
  async verifyMapping(req: AuthRequest, res: Response) {
    try {
      const { mappingId } = req.params;
      const { isVerified, newPriceItemId } = req.body;

      await convexClient.mutation(api.excelMappings.verifyMapping, {
        mappingId: mappingId as any,
        isVerified,
        newPriceItemId,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error verifying mapping:', error);
      res.status(500).json({ error: 'Failed to verify mapping' });
    }
  }

  // Sync rates from Excel to database
  async syncRatesFromExcel(req: AuthRequest, res: Response) {
    try {
      const { priceListId } = req.params;
      
      // Get the price list
      const priceList = await convexClient.query(api.clientPriceLists.getById, {
        id: priceListId as any,
      });
      
      if (!priceList) {
        return res.status(404).json({ error: 'Price list not found' });
      }
      
      // Get the source file path
      const sourceFileUrl = priceList.sourceFileUrl;
      if (!sourceFileUrl) {
        return res.status(400).json({ error: 'No source Excel file associated with this price list' });
      }
      
      // Read the Excel file
      const filePath = path.join(process.cwd(), sourceFileUrl);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      // Get all mappings for this price list
      const mappings = await convexClient.query(api.excelMappings.getByPriceList, {
        priceListId: priceListId as any,
      });
      
      let updatedCount = 0;
      const updates: any[] = [];
      
      // Process each mapping
      for (const mapping of mappings) {
        try {
          const worksheet = workbook.getWorksheet(mapping.sheetName);
          if (!worksheet) continue;
          
          const row = worksheet.getRow(mapping.rowNumber);
          const rateCol = this.getColumnNumber(mapping.rateColumn);
          const rateCell = row.getCell(rateCol);
          
          let newRate = 0;
          if (rateCell.formula) {
            // If it's a formula, use the calculated result
            newRate = Number(rateCell.result) || 0;
          } else {
            newRate = Number(rateCell.value) || 0;
          }
          
          if (newRate > 0 && newRate !== mapping.originalRate) {
            updates.push({
              basePriceItemId: mapping.priceItemId,
              rate: newRate,
              excelRow: mapping.rowNumber,
              excelSheet: mapping.sheetName,
              excelCellRef: `${mapping.rateColumn}${mapping.rowNumber}`,
              excelFormula: rateCell.formula || undefined,
            });
            updatedCount++;
          }
        } catch (error) {
          console.error(`Error processing mapping ${mapping._id}:`, error);
        }
      }
      
      // Update client price items
      if (updates.length > 0) {
        await convexClient.mutation(api.clientPriceItems.updateFromExcelMapping, {
          priceListId: priceListId as any,
          mappings: updates,
          userId: req.user.userId || req.user.id,
        });
        
        // Update last synced timestamp
        await convexClient.mutation(api.clientPriceLists.update, {
          id: priceListId as any,
          lastSyncedAt: Date.now(),
        });
      }
      
      res.json({
        success: true,
        updatedCount,
        message: `Successfully updated ${updatedCount} rates from Excel`,
      });
    } catch (error) {
      console.error('Error syncing rates from Excel:', error);
      res.status(500).json({ error: 'Failed to sync rates from Excel' });
    }
  }
  
  // Helper function to convert column letter to number
  private getColumnNumber(col: string): number {
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result;
  }
}