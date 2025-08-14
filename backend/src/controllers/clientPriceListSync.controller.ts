import { Request, Response } from 'express';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import * as ExcelJS from 'exceljs';
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

export class ClientPriceListSyncController {
  // Sync rates from Excel to database
  async syncRatesFromExcel(req: AuthRequest, res: Response) {
    try {
      const { priceListId } = req.params;
      const userId = req.user?.userId || req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      console.log('[PriceListSync] Starting sync for price list:', priceListId);

      // Get all mappings for this price list
      const mappings = await convexClient.query(api.excelMappings.getByPriceList, {
        priceListId: priceListId as any,
      });

      console.log('[PriceListSync] Found', mappings.length, 'mappings');

      // Get the source file for this price list
      const priceList = await convexClient.query(api.clientPriceLists.getById, {
        id: priceListId as any,
      });

      if (!priceList || !priceList.sourceFileUrl) {
        return res.status(400).json({ error: 'No source file found for this price list' });
      }

      // Read the Excel file
      const filePath = path.join(process.cwd(), priceList.sourceFileUrl);
      
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Source Excel file not found' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      let updatedCount = 0;
      let skippedCount = 0;
      const updates: any[] = [];

      // Process each mapping
      for (const mapping of mappings) {
        if (!mapping.isVerified) {
          skippedCount++;
          continue; // Skip unverified mappings
        }

        const worksheet = workbook.getWorksheet(mapping.sheetName);
        if (!worksheet) {
          console.warn(`[PriceListSync] Sheet not found: ${mapping.sheetName}`);
          continue;
        }

        const row = worksheet.getRow(mapping.rowNumber);
        if (!row) {
          console.warn(`[PriceListSync] Row not found: ${mapping.rowNumber}`);
          continue;
        }

        // Get the rate cell
        const rateColumn = mapping.rateColumn;
        if (!rateColumn) {
          console.warn(`[PriceListSync] No rate column for mapping`);
          continue;
        }

        const colNumber = this.getColumnNumber(rateColumn);
        const rateCell = row.getCell(colNumber);

        // Get the rate value (handle formulas)
        let newRate = 0;
        if (rateCell.formula) {
          newRate = Number(rateCell.result) || 0;
        } else {
          newRate = Number(rateCell.value) || 0;
        }

        // Skip if rate is invalid
        if (newRate <= 0) {
          console.warn(`[PriceListSync] Invalid rate for ${mapping.sheetName}!${rateColumn}${mapping.rowNumber}: ${newRate}`);
          continue;
        }

        // Prepare update
        updates.push({
          basePriceItemId: mapping.priceItemId,
          rate: newRate,
          excelRow: mapping.rowNumber,
          excelSheet: mapping.sheetName,
          excelCellRef: `${rateColumn}${mapping.rowNumber}`,
          excelFormula: rateCell.formula || undefined,
        });
        updatedCount++;
      }

      console.log(`[PriceListSync] Prepared ${updatedCount} updates, skipped ${skippedCount} unverified`);

      // Apply updates to database
      if (updates.length > 0) {
        await convexClient.mutation(api.clientPriceItems.updateFromExcelMapping, {
          priceListId: priceListId as any,
          mappings: updates,
          userId: userId as any,
        });

        // Update last synced timestamp
        await convexClient.mutation(api.clientPriceLists.update, {
          id: priceListId as any,
          lastSyncedAt: Date.now(),
        });

        console.log(`[PriceListSync] Successfully updated ${updatedCount} price items`);
      }

      res.json({
        success: true,
        updatedCount,
        skippedCount,
        message: `Successfully updated ${updatedCount} price items`,
      });
    } catch (error) {
      console.error('[PriceListSync] Error syncing rates from Excel:', error);
      res.status(500).json({ error: 'Failed to sync rates from Excel' });
    }
  }

  // Export updated Excel with current database rates
  async exportToExcel(req: AuthRequest, res: Response) {
    try {
      const { priceListId } = req.params;

      console.log('[PriceListSync] Starting export for price list:', priceListId);

      // Get all mappings
      const mappings = await convexClient.query(api.excelMappings.getByPriceList, {
        priceListId: priceListId as any,
      });

      // Get the source file as template
      const priceList = await convexClient.query(api.clientPriceLists.getById, {
        id: priceListId as any,
      });

      if (!priceList || !priceList.sourceFileUrl) {
        return res.status(400).json({ error: 'No source file found for this price list' });
      }

      const templatePath = path.join(process.cwd(), priceList.sourceFileUrl);
      
      try {
        await fs.access(templatePath);
      } catch {
        return res.status(404).json({ error: 'Template file not found' });
      }

      // Create a copy of the template
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);

      let updatedCells = 0;

      // Update rates in the Excel file
      for (const mapping of mappings) {
        const worksheet = workbook.getWorksheet(mapping.sheetName);
        if (!worksheet) continue;

        const row = worksheet.getRow(mapping.rowNumber);
        if (!row) continue;

        // Get current price from database
        const clientPriceItem = await convexClient.query(api.clientPriceItems.getByPriceItem, {
          priceListId: priceListId as any,
          priceItemId: mapping.priceItemId,
        });

        if (clientPriceItem && mapping.rateColumn) {
          const colNumber = this.getColumnNumber(mapping.rateColumn);
          const rateCell = row.getCell(colNumber);
          
          // Update the cell value (preserve formula if it exists)
          if (!rateCell.formula) {
            rateCell.value = clientPriceItem.rate;
            updatedCells++;
          }
        }
      }

      console.log(`[PriceListSync] Updated ${updatedCells} cells in Excel`);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportFileName = `MJD-PRICELIST-${timestamp}.xlsx`;
      const exportPath = path.join(process.cwd(), 'exports', exportFileName);

      // Ensure exports directory exists
      const exportDir = path.join(process.cwd(), 'exports');
      try {
        await fs.mkdir(exportDir, { recursive: true });
      } catch {
        // Directory might already exist
      }

      // Save the updated workbook
      await workbook.xlsx.writeFile(exportPath);

      console.log(`[PriceListSync] Excel file saved to: ${exportPath}`);

      // Send file to client
      res.download(exportPath, exportFileName, async (err) => {
        if (err) {
          console.error('[PriceListSync] Error sending file:', err);
        }
        // Clean up the file after sending
        try {
          await fs.unlink(exportPath);
          console.log('[PriceListSync] Temp file cleaned up');
        } catch (unlinkErr) {
          console.error('[PriceListSync] Error deleting temp file:', unlinkErr);
        }
      });
    } catch (error) {
      console.error('[PriceListSync] Error exporting to Excel:', error);
      res.status(500).json({ error: 'Failed to export to Excel' });
    }
  }

  // Validate mappings
  async validateMappings(req: AuthRequest, res: Response) {
    try {
      const { priceListId } = req.params;

      console.log('[PriceListSync] Validating mappings for price list:', priceListId);

      // Get all mappings
      const mappings = await convexClient.query(api.excelMappings.getByPriceList, {
        priceListId: priceListId as any,
      });

      // Get the source file
      const priceList = await convexClient.query(api.clientPriceLists.getById, {
        id: priceListId as any,
      });

      if (!priceList || !priceList.sourceFileUrl) {
        return res.status(400).json({ error: 'No source file found for this price list' });
      }

      const filePath = path.join(process.cwd(), priceList.sourceFileUrl);
      
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: 'Source Excel file not found' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const validationResults = {
        valid: 0,
        invalid: 0,
        issues: [] as any[],
      };

      // Validate each mapping
      for (const mapping of mappings) {
        const worksheet = workbook.getWorksheet(mapping.sheetName);
        
        if (!worksheet) {
          validationResults.invalid++;
          validationResults.issues.push({
            mappingId: mapping._id,
            issue: `Sheet '${mapping.sheetName}' not found`,
          });
          continue;
        }

        const row = worksheet.getRow(mapping.rowNumber);
        if (!row || !row.values) {
          validationResults.invalid++;
          validationResults.issues.push({
            mappingId: mapping._id,
            issue: `Row ${mapping.rowNumber} not found in sheet '${mapping.sheetName}'`,
          });
          continue;
        }

        // Check if rate cell exists
        if (mapping.rateColumn) {
          const colNumber = this.getColumnNumber(mapping.rateColumn);
          const rateCell = row.getCell(colNumber);
          
          if (!rateCell.value && !rateCell.formula) {
            validationResults.invalid++;
            validationResults.issues.push({
              mappingId: mapping._id,
              issue: `No value in rate cell ${mapping.rateColumn}${mapping.rowNumber}`,
            });
            continue;
          }
        }

        validationResults.valid++;
      }

      console.log(`[PriceListSync] Validation complete: ${validationResults.valid} valid, ${validationResults.invalid} invalid`);

      res.json({
        success: true,
        totalMappings: mappings.length,
        validMappings: validationResults.valid,
        invalidMappings: validationResults.invalid,
        issues: validationResults.issues.slice(0, 100), // Limit issues to first 100
      });
    } catch (error) {
      console.error('[PriceListSync] Error validating mappings:', error);
      res.status(500).json({ error: 'Failed to validate mappings' });
    }
  }

  // Helper function to convert column letter to number
  private getColumnNumber(col: string): number {
    let num = 0;
    for (let i = 0; i < col.length; i++) {
      num = num * 26 + (col.charCodeAt(i) - 64);
    }
    return num;
  }
}