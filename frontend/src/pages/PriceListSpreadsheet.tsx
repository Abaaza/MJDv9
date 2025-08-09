import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  Upload, 
  Download,
  Save,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  FileSpreadsheet,
  RefreshCw,
  Calculator
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import { debounce } from 'lodash';

interface PriceItem {
  _id: string;
  id: string;
  code?: string;
  ref?: string;
  description: string;
  material_type?: string;
  material_grade?: string;
  material_size?: string;
  material_finish?: string;
  category?: string;
  subcategory?: string;
  work_type?: string;
  brand?: string;
  unit?: string;
  rate?: number;
  labor_rate?: number;
  material_rate?: number;
  wastage_percentage?: number;
  supplier?: string;
  location?: string;
  availability?: string;
  lastUpdated?: number;
  keywords?: string[];
  remark?: string;
}

export default function PriceListSpreadsheet() {
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [workbookData, setWorkbookData] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedDataRef = useRef<string>('');
  const pendingChangesRef = useRef<any[]>([]);

  // Define columns for the spreadsheet
  const columns = [
    { name: 'ID', key: '_id', width: 80, editable: false },
    { name: 'Code', key: 'code', width: 100 },
    { name: 'Reference', key: 'ref', width: 100 },
    { name: 'Description', key: 'description', width: 300 },
    { name: 'Category', key: 'category', width: 150 },
    { name: 'Subcategory', key: 'subcategory', width: 150 },
    { name: 'Unit', key: 'unit', width: 80 },
    { name: 'Rate', key: 'rate', width: 100, type: 'number', format: 'currency' },
    { name: 'Labor Rate', key: 'labor_rate', width: 100, type: 'number', format: 'currency' },
    { name: 'Material Rate', key: 'material_rate', width: 100, type: 'number', format: 'currency' },
    { name: 'Total Cost', key: 'total_cost', width: 120, type: 'formula', formula: '=H{row}+I{row}+J{row}' },
    { name: 'Markup %', key: 'markup_percent', width: 100, type: 'number' },
    { name: 'Final Price', key: 'final_price', width: 120, type: 'formula', formula: '=K{row}*(1+L{row}/100)' },
    { name: 'Material Type', key: 'material_type', width: 150 },
    { name: 'Material Grade', key: 'material_grade', width: 120 },
    { name: 'Work Type', key: 'work_type', width: 120 },
    { name: 'Supplier', key: 'supplier', width: 150 },
    { name: 'Location', key: 'location', width: 150 },
    { name: 'Availability', key: 'availability', width: 100 },
    { name: 'Remark', key: 'remark', width: 200 },
    { name: 'Last Updated', key: 'lastUpdated', width: 150, type: 'date' }
  ];

  // Fetch price items
  const { data: priceItems, isLoading, error, refetch } = useQuery<PriceItem[]>({
    queryKey: ['price-items-spreadsheet'],
    queryFn: async () => {
      const response = await api.get('/price-list');
      return response.data;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Convert price items to spreadsheet format
  const convertToSpreadsheetData = useCallback((items: PriceItem[]) => {
    if (!items || items.length === 0) {
      // Return empty sheet with headers
      return [{
        name: 'Price List',
        color: '',
        status: 1,
        order: 0,
        data: [
          columns.map(col => ({ v: col.name, ct: { fa: 'General', t: 'g' }, m: col.name }))
        ],
        config: {
          merge: {},
          columnlen: columns.reduce((acc, col, index) => {
            acc[index] = col.width;
            return acc;
          }, {} as any),
          rowlen: {},
          rowhidden: {},
          colhidden: {},
        },
        index: 0,
        jfgird_select_save: [],
        calcChain: []
      }];
    }

    // Create header row
    const headerRow = columns.map(col => ({
      v: col.name,
      ct: { fa: 'General', t: 'g' },
      m: col.name,
      bg: '#f0f0f0',
      fc: '#000000',
      bl: 1
    }));

    // Create data rows
    const dataRows = items.map((item, rowIndex) => {
      return columns.map((col, colIndex) => {
        let value = (item as any)[col.key];
        let cellData: any = { v: value || '', m: value || '' };

        // Handle different column types
        if (col.type === 'number' || col.format === 'currency') {
          const numValue = parseFloat(value) || 0;
          cellData = {
            v: numValue,
            m: col.format === 'currency' ? formatPrice(numValue) : numValue.toString(),
            ct: { fa: col.format === 'currency' ? '$#,##0.00' : '#,##0.00', t: 'n' }
          };
        } else if (col.type === 'date' && value) {
          const date = new Date(value);
          cellData = {
            v: date.toLocaleDateString(),
            m: date.toLocaleDateString(),
            ct: { fa: 'MM/dd/yyyy', t: 'd' }
          };
        } else if (col.type === 'formula') {
          // Calculate formula value
          const formula = col.formula?.replace(/{row}/g, (rowIndex + 2).toString()) || '';
          const calculatedValue = calculateFormula(formula, item);
          cellData = {
            v: calculatedValue,
            m: col.format === 'currency' ? formatPrice(calculatedValue) : calculatedValue.toString(),
            f: formula,
            ct: { fa: col.format === 'currency' ? '$#,##0.00' : '#,##0.00', t: 'n' }
          };
        }

        // Add cell styling
        if (!item.description || !item.category || !item.unit || !item.rate) {
          cellData.bg = '#fff3cd'; // Yellow background for incomplete items
        }

        return cellData;
      });
    });

    const allRows = [headerRow, ...dataRows];

    return [{
      name: 'Price List',
      color: '',
      status: 1,
      order: 0,
      data: allRows,
      config: {
        merge: {},
        columnlen: columns.reduce((acc, col, index) => {
          acc[index] = col.width;
          return acc;
        }, {} as any),
        rowlen: {},
        rowhidden: {},
        colhidden: {},
        borderInfo: [],
      },
      index: 0,
      jfgird_select_save: [],
      calcChain: [],
      filter_select: null,
      filter: null,
      luckysheet_conditionformat_save: [],
      dataVerification: {},
      hyperlink: {},
      celldata: allRows.flatMap((row, r) => 
        row.map((cell, c) => ({
          r,
          c,
          v: cell
        }))
      )
    }];
  }, [columns, formatPrice]);

  // Calculate formula values
  const calculateFormula = (formula: string, item: PriceItem): number => {
    // Simple formula parser for basic operations
    if (formula.includes('=')) {
      const formulaBody = formula.substring(1);
      
      // Handle sum of cells (e.g., =H2+I2+J2)
      if (formulaBody.includes('+')) {
        const parts = formulaBody.split('+');
        let sum = 0;
        
        parts.forEach(part => {
          const colLetter = part.match(/[A-Z]/)?.[0];
          if (colLetter) {
            const colIndex = colLetter.charCodeAt(0) - 65;
            const col = columns[colIndex];
            if (col) {
              sum += parseFloat((item as any)[col.key]) || 0;
            }
          }
        });
        
        return sum;
      }
      
      // Handle multiplication with percentage (e.g., =K2*(1+L2/100))
      if (formulaBody.includes('*(1+') && formulaBody.includes('/100)')) {
        const baseMatch = formulaBody.match(/([A-Z]\d+)/);
        const percentMatch = formulaBody.match(/\+([A-Z]\d+)\/100/);
        
        if (baseMatch && percentMatch) {
          const baseCol = baseMatch[1][0];
          const percentCol = percentMatch[1][0];
          
          const baseIndex = baseCol.charCodeAt(0) - 65;
          const percentIndex = percentCol.charCodeAt(0) - 65;
          
          const baseValue = parseFloat((item as any)[columns[baseIndex]?.key]) || 0;
          const percentValue = parseFloat((item as any)[columns[percentIndex]?.key]) || 0;
          
          return baseValue * (1 + percentValue / 100);
        }
      }
    }
    
    return 0;
  };

  // Convert spreadsheet data back to price items
  const convertFromSpreadsheetData = useCallback((sheetData: any[]): Partial<PriceItem>[] => {
    if (!sheetData || sheetData.length === 0) return [];
    
    const sheet = sheetData[0];
    if (!sheet.celldata || sheet.celldata.length === 0) return [];

    // Group cells by row
    const rowsMap = new Map<number, any[]>();
    sheet.celldata.forEach((cell: any) => {
      if (cell.r === 0) return; // Skip header row
      
      if (!rowsMap.has(cell.r)) {
        rowsMap.set(cell.r, []);
      }
      rowsMap.get(cell.r)!.push(cell);
    });

    // Convert each row to a price item
    const items: Partial<PriceItem>[] = [];
    rowsMap.forEach((cells) => {
      const item: any = {};
      
      cells.forEach((cell) => {
        const col = columns[cell.c];
        if (col && col.key && col.type !== 'formula') {
          const value = cell.v?.v !== undefined ? cell.v.v : cell.v;
          
          if (col.type === 'number' || col.format === 'currency') {
            item[col.key] = parseFloat(value) || 0;
          } else if (col.type === 'date' && value) {
            item[col.key] = new Date(value).getTime();
          } else {
            item[col.key] = value || '';
          }
        }
      });
      
      if (Object.keys(item).length > 0) {
        items.push(item);
      }
    });

    return items;
  }, [columns]);

  // Initialize workbook data when price items are loaded
  useEffect(() => {
    if (priceItems && priceItems.length > 0) {
      const sheetData = convertToSpreadsheetData(priceItems);
      setWorkbookData(sheetData);
      lastSavedDataRef.current = JSON.stringify(sheetData);
    }
  }, [priceItems, convertToSpreadsheetData]);

  // Save changes mutation
  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<PriceItem>[]) => {
      const promises = updates.map(item => {
        if (item._id) {
          // Update existing item
          return api.patch(`/price-list/${item._id}`, item);
        } else {
          // Create new item
          return api.post('/price-list', item);
        }
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast.success('Changes saved successfully');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['price-items-spreadsheet'] });
      queryClient.invalidateQueries({ queryKey: ['price-list-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to save changes');
    },
  });

  // Debounced save function
  const debouncedSave = useCallback(
    debounce((data: any[]) => {
      const items = convertFromSpreadsheetData(data);
      if (items.length > 0) {
        setIsSaving(true);
        saveMutation.mutate(items, {
          onSettled: () => setIsSaving(false)
        });
      }
    }, 2000),
    [convertFromSpreadsheetData]
  );

  // Handle workbook changes
  const handleWorkbookChange = (data: any[]) => {
    setWorkbookData(data);
    
    const currentData = JSON.stringify(data);
    if (currentData !== lastSavedDataRef.current) {
      setHasChanges(true);
      debouncedSave(data);
    }
  };

  // Handle manual save
  const handleSave = () => {
    const items = convertFromSpreadsheetData(workbookData);
    if (items.length > 0) {
      setIsSaving(true);
      saveMutation.mutate(items, {
        onSettled: () => {
          setIsSaving(false);
          lastSavedDataRef.current = JSON.stringify(workbookData);
        }
      });
    }
  };

  // Handle export
  const handleExport = async () => {
    try {
      const response = await api.get('/price-list/export', {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `price_list_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Export completed');
    } catch (error: any) {
      toast.error('Failed to export price list');
      console.error('Export error:', error);
    }
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/price-list/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Import completed successfully');
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Import failed');
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/)) {
        toast.error('Please select a valid Excel or CSV file');
        return;
      }
      
      if (file.size > 50 * 1024 * 1024) {
        toast.error('File size must be less than 50MB');
        return;
      }
      
      if (window.confirm('This will import price items from the file. Continue?')) {
        importMutation.mutate(file);
      }
    }
  };

  // Add new row
  const handleAddRow = () => {
    const newItem: Partial<PriceItem> = {
      _id: `new_${Date.now()}`,
      description: 'New Item',
      category: '',
      subcategory: '',
      unit: '',
      rate: 0
    };
    
    const currentItems = convertFromSpreadsheetData(workbookData);
    const updatedItems = [...currentItems, newItem];
    const sheetData = convertToSpreadsheetData(updatedItems as PriceItem[]);
    setWorkbookData(sheetData);
    setHasChanges(true);
  };

  // Delete selected rows
  const handleDeleteSelected = () => {
    // This would need to be implemented with the spreadsheet's selection API
    toast.info('Select rows to delete in the spreadsheet');
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-lg font-medium">Failed to load price list</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg font-medium">Loading price list...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Price List Spreadsheet</h2>
              {hasChanges && (
                <span className="text-sm text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Unsaved changes
                </span>
              )}
              {isSaving && (
                <span className="text-sm text-blue-600 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || isSaving}
                variant={hasChanges ? 'default' : 'outline'}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              
              <Button onClick={handleAddRow} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </Button>
              
              <Button onClick={handleDeleteSelected} variant="outline">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected
              </Button>
              
              <Button onClick={handleExport} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              
              <Button 
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
                variant="outline"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Calculator className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Tips:</strong></p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Double-click cells to edit values directly</li>
                <li>Use formulas like =SUM(H2:J2) for calculations</li>
                <li>Copy/paste cells using Ctrl+C and Ctrl+V</li>
                <li>Changes are auto-saved after 2 seconds of inactivity</li>
                <li>Yellow cells indicate incomplete items</li>
                <li>Right-click for context menu options</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spreadsheet Component */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div style={{ height: '70vh' }}>
            <Workbook 
              data={workbookData}
              onChange={handleWorkbookChange}
              config={{
                column: columns.length,
                row: (priceItems?.length || 0) + 50, // Extra rows for new items
                autoFormatw: false,
                accuracy: 2,
                total: 1,
                title: 'Price List',
                userInfo: false,
                devicePixelRatio: window.devicePixelRatio || 1,
                toolbarConfig: {
                  undo: true,
                  redo: true,
                  paintBrush: true,
                  currencyFormat: true,
                  percentageFormat: true,
                  numberDecrease: true,
                  numberIncrease: true,
                  formula: true,
                  functionButton: true,
                  frozenRowAndColumn: true,
                  textWrapMode: true,
                  findAndReplace: true,
                  sum: true,
                  moreFormats: true,
                },
                sheetConfig: {
                  addRow: true,
                  addColumn: true,
                  deleteRow: true,
                  deleteColumn: true,
                  hideRow: true,
                  hideColumn: true,
                  rowHeight: true,
                  columnWidth: true,
                },
                cellRightClickConfig: {
                  copy: true,
                  paste: true,
                  cut: true,
                  insertRow: true,
                  insertColumn: true,
                  deleteRow: true,
                  deleteColumn: true,
                  clearContent: true,
                },
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}