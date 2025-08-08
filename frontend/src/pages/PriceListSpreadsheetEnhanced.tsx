import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Calculator,
  Copy,
  Clipboard,
  Undo,
  Redo,
  Search,
  Filter,
  Settings,
  Cloud,
  CloudOff,
  Check
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
import { debounce } from 'lodash';
import * as XLSX from 'xlsx';

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

interface CellChange {
  row: number;
  col: number;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

export default function PriceListSpreadsheetEnhanced() {
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [workbookData, setWorkbookData] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [changeHistory, setChangeHistory] = useState<CellChange[]>([]);
  const [redoHistory, setRedoHistory] = useState<CellChange[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedDataRef = useRef<string>('');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workbookRef = useRef<any>(null);

  // Define columns with enhanced features
  const columns = [
    { name: 'Select', key: '_select', width: 50, type: 'checkbox', frozen: true },
    { name: 'ID', key: '_id', width: 80, editable: false, frozen: true },
    { name: 'Code', key: 'code', width: 100, frozen: true },
    { name: 'Reference', key: 'ref', width: 100 },
    { name: 'Description', key: 'description', width: 300, required: true },
    { name: 'Category', key: 'category', width: 150, required: true, dropdown: true },
    { name: 'Subcategory', key: 'subcategory', width: 150, required: true, dropdown: true },
    { name: 'Unit', key: 'unit', width: 80, required: true, dropdown: ['pcs', 'm', 'm²', 'm³', 'kg', 'ton', 'ltr', 'set', 'lot'] },
    { name: 'Rate', key: 'rate', width: 100, type: 'number', format: 'currency', required: true },
    { name: 'Labor Rate', key: 'labor_rate', width: 100, type: 'number', format: 'currency' },
    { name: 'Material Rate', key: 'material_rate', width: 100, type: 'number', format: 'currency' },
    { name: 'Wastage %', key: 'wastage_percentage', width: 80, type: 'number', format: 'percentage' },
    { name: 'Total Cost', key: 'total_cost', width: 120, type: 'formula', formula: '=SUM(I{row}:K{row})*(1+L{row}/100)', format: 'currency', editable: false },
    { name: 'Markup %', key: 'markup_percent', width: 100, type: 'number', format: 'percentage' },
    { name: 'Final Price', key: 'final_price', width: 120, type: 'formula', formula: '=M{row}*(1+N{row}/100)', format: 'currency', editable: false },
    { name: 'Material Type', key: 'material_type', width: 150 },
    { name: 'Material Grade', key: 'material_grade', width: 120 },
    { name: 'Work Type', key: 'work_type', width: 120 },
    { name: 'Supplier', key: 'supplier', width: 150 },
    { name: 'Location', key: 'location', width: 150 },
    { name: 'Availability', key: 'availability', width: 100, dropdown: ['in_stock', 'out_of_stock', 'limited', 'on_order'] },
    { name: 'Remark', key: 'remark', width: 200 },
    { name: 'Last Updated', key: 'lastUpdated', width: 150, type: 'date', editable: false }
  ];

  // Fetch price items
  const { data: priceItems, isLoading, error, refetch } = useQuery<PriceItem[]>({
    queryKey: ['price-items-spreadsheet-enhanced'],
    queryFn: async () => {
      const response = await api.get('/price-list');
      return response.data;
    },
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Get unique categories and subcategories for dropdowns
  const dropdownOptions = useMemo(() => {
    if (!priceItems || priceItems.length === 0) return { categories: [], subcategories: {} };
    
    const categories = new Set<string>();
    const subcategories: Record<string, Set<string>> = {};
    
    priceItems.forEach(item => {
      if (item.category) {
        categories.add(item.category);
        if (!subcategories[item.category]) {
          subcategories[item.category] = new Set();
        }
        if (item.subcategory) {
          subcategories[item.category].add(item.subcategory);
        }
      }
    });
    
    return {
      categories: Array.from(categories).sort(),
      subcategories: Object.fromEntries(
        Object.entries(subcategories).map(([cat, subs]) => [cat, Array.from(subs).sort()])
      )
    };
  }, [priceItems]);

  // Convert price items to spreadsheet format with enhanced features
  const convertToSpreadsheetData = useCallback((items: PriceItem[]) => {
    if (!items || items.length === 0) {
      // Return empty sheet with headers
      return [{
        name: 'Price List',
        color: '#217346',
        status: 1,
        order: 0,
        data: [
          columns.map(col => ({ 
            v: col.name, 
            ct: { fa: 'General', t: 'g' }, 
            m: col.name,
            bg: '#217346',
            fc: '#ffffff',
            bl: 1,
            fs: 12
          }))
        ],
        config: {
          merge: {},
          columnlen: columns.reduce((acc, col, index) => {
            acc[index] = col.width;
            return acc;
          }, {} as any),
          rowlen: { 0: 30 },
          rowhidden: {},
          colhidden: {},
          borderInfo: [],
          authority: {},
        },
        index: 0,
        jfgird_select_save: [],
        calcChain: [],
        filter_select: {
          row: [0, items.length],
          column: [0, columns.length - 1]
        },
        filter: {},
        luckysheet_alternateformat_save: [{
          cellrange: {
            row: [1, items.length],
            column: [0, columns.length - 1]
          },
          format: {
            head: { fc: '#000', bc: '#ffffff' },
            one: { fc: '#000', bc: '#ffffff' },
            two: { fc: '#000', bc: '#f5f5f5' }
          }
        }],
      }];
    }

    // Create header row with styling
    const headerRow = columns.map(col => ({
      v: col.name,
      ct: { fa: 'General', t: 'g' },
      m: col.name,
      bg: '#217346',
      fc: '#ffffff',
      bl: 1,
      fs: 12,
      ht: 1, // Center horizontal
      vt: 1, // Center vertical
    }));

    // Create data rows with validation and formatting
    const dataRows = items.map((item, rowIndex) => {
      return columns.map((col, colIndex) => {
        // Handle checkbox column
        if (col.key === '_select') {
          return {
            v: 0,
            m: '',
            ct: { fa: 'General', t: 'b' },
            celltype: 'checkbox'
          };
        }

        let value = (item as any)[col.key];
        let cellData: any = { v: value || '', m: value || '' };

        // Handle different column types
        if (col.type === 'number' || col.format === 'currency') {
          const numValue = parseFloat(value) || 0;
          cellData = {
            v: numValue,
            m: col.format === 'currency' ? formatPrice(numValue) : 
               col.format === 'percentage' ? `${numValue}%` : numValue.toString(),
            ct: { 
              fa: col.format === 'currency' ? '$#,##0.00' : 
                  col.format === 'percentage' ? '0.00%' : '#,##0.00', 
              t: 'n' 
            }
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
          const calculatedValue = calculateFormula(formula, item, rowIndex + 1);
          cellData = {
            v: calculatedValue,
            m: col.format === 'currency' ? formatPrice(calculatedValue) : calculatedValue.toString(),
            f: formula,
            ct: { 
              fa: col.format === 'currency' ? '$#,##0.00' : '#,##0.00', 
              t: 'n' 
            },
            bg: '#f0f8ff' // Light blue background for formula cells
          };
        }

        // Add dropdown validation if specified
        if (col.dropdown) {
          cellData.dataValidation = {
            type: 'dropdown',
            value1: Array.isArray(col.dropdown) ? col.dropdown.join(',') : 
                   col.key === 'category' ? dropdownOptions.categories.join(',') :
                   col.key === 'subcategory' && item.category ? 
                   (dropdownOptions.subcategories[item.category] || []).join(',') : '',
            value2: '',
            checked: false,
            remote: false,
            prohibitInput: false,
            hintShow: true,
            hintText: `Select ${col.name}`
          };
        }

        // Add cell styling for incomplete items
        if (col.required && (!value || value === '' || value === 0)) {
          cellData.bg = '#fff3cd'; // Yellow background for missing required fields
          cellData.comment = {
            value: `${col.name} is required`,
            width: 200,
            height: 50,
            left: colIndex * 100,
            top: (rowIndex + 1) * 20
          };
        }

        // Add conditional formatting for availability
        if (col.key === 'availability') {
          if (value === 'out_of_stock') {
            cellData.fc = '#dc3545'; // Red text
            cellData.bl = 1; // Bold
          } else if (value === 'limited') {
            cellData.fc = '#ffc107'; // Yellow text
          } else if (value === 'in_stock') {
            cellData.fc = '#28a745'; // Green text
          }
        }

        // Freeze columns if specified
        if (col.frozen) {
          cellData.frozen = true;
        }

        return cellData;
      });
    });

    const allRows = [headerRow, ...dataRows];

    return [{
      name: 'Price List',
      color: '#217346',
      status: 1,
      order: 0,
      data: allRows,
      config: {
        merge: {},
        columnlen: columns.reduce((acc, col, index) => {
          acc[index] = col.width;
          return acc;
        }, {} as any),
        rowlen: { 0: 30 },
        rowhidden: {},
        colhidden: {},
        borderInfo: [],
        authority: {},
      },
      index: 0,
      jfgird_select_save: [],
      calcChain: [],
      filter_select: {
        row: [0, items.length],
        column: [0, columns.length - 1]
      },
      filter: {},
      luckysheet_alternateformat_save: [{
        cellrange: {
          row: [1, items.length],
          column: [0, columns.length - 1]
        },
        format: {
          head: { fc: '#000', bc: '#ffffff' },
          one: { fc: '#000', bc: '#ffffff' },
          two: { fc: '#000', bc: '#f5f5f5' }
        }
      }],
      luckysheet_conditionformat_save: [
        {
          type: 'databBar',
          cellrange: [{
            row: [1, items.length],
            column: [columns.findIndex(c => c.key === 'rate'), columns.findIndex(c => c.key === 'rate')]
          }],
          format: {
            len: 100,
            max: { type: 'max', value: null },
            min: { type: 'min', value: null },
            color: '#638ec6'
          }
        }
      ],
      dataVerification: {},
      hyperlink: {},
      celldata: allRows.flatMap((row, r) => 
        row.map((cell, c) => ({
          r,
          c,
          v: cell
        }))
      ),
      frozen: {
        type: 'both',
        horizontal: { freezenhorizontaldata: columns.filter(c => c.frozen).length },
        vertical: { freezenverticaldata: 1 }
      }
    }];
  }, [columns, formatPrice, dropdownOptions]);

  // Enhanced formula calculator with more functions
  const calculateFormula = (formula: string, item: PriceItem, rowIndex: number): number => {
    if (!formula.startsWith('=')) return 0;
    
    const formulaBody = formula.substring(1);
    
    try {
      // Handle SUM function
      if (formulaBody.startsWith('SUM(')) {
        const rangeMatch = formulaBody.match(/SUM\(([A-Z])(\d+):([A-Z])(\d+)\)/);
        if (rangeMatch) {
          const startCol = rangeMatch[1].charCodeAt(0) - 65;
          const endCol = rangeMatch[3].charCodeAt(0) - 65;
          let sum = 0;
          
          for (let i = startCol; i <= endCol; i++) {
            const col = columns[i];
            if (col && (col.type === 'number' || col.format === 'currency')) {
              sum += parseFloat((item as any)[col.key]) || 0;
            }
          }
          
          // Check for multiplication after SUM
          const afterSum = formulaBody.substring(formulaBody.indexOf(')') + 1);
          if (afterSum.includes('*(1+')) {
            const percentMatch = afterSum.match(/\*\(1\+([A-Z])(\d+)\/100\)/);
            if (percentMatch) {
              const percentCol = percentMatch[1].charCodeAt(0) - 65;
              const percentValue = parseFloat((item as any)[columns[percentCol]?.key]) || 0;
              return sum * (1 + percentValue / 100);
            }
          }
          
          return sum;
        }
      }
      
      // Handle simple addition
      if (formulaBody.includes('+')) {
        const parts = formulaBody.split('+');
        let sum = 0;
        
        parts.forEach(part => {
          const colMatch = part.match(/([A-Z])(\d+)/);
          if (colMatch) {
            const colIndex = colMatch[1].charCodeAt(0) - 65;
            const col = columns[colIndex];
            if (col) {
              sum += parseFloat((item as any)[col.key]) || 0;
            }
          }
        });
        
        return sum;
      }
      
      // Handle multiplication with percentage
      if (formulaBody.includes('*(1+') && formulaBody.includes('/100)')) {
        const baseMatch = formulaBody.match(/([A-Z])(\d+)/);
        const percentMatch = formulaBody.match(/\+([A-Z])(\d+)\/100/);
        
        if (baseMatch && percentMatch) {
          const baseCol = baseMatch[1];
          const percentCol = percentMatch[1];
          
          const baseIndex = baseCol.charCodeAt(0) - 65;
          const percentIndex = percentCol.charCodeAt(0) - 65;
          
          const baseValue = parseFloat((item as any)[columns[baseIndex]?.key]) || 0;
          const percentValue = parseFloat((item as any)[columns[percentIndex]?.key]) || 0;
          
          return baseValue * (1 + percentValue / 100);
        }
      }
    } catch (error) {
      console.error('Formula calculation error:', error);
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
        if (col && col.key && col.key !== '_select' && col.type !== 'formula') {
          const value = cell.v?.v !== undefined ? cell.v.v : cell.v;
          
          if (col.type === 'number' || col.format === 'currency' || col.format === 'percentage') {
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

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async (updates: Partial<PriceItem>[]) => {
      const response = await api.post('/price-list/bulk-update', { updates });
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Updated ${data.updated} items, Created ${data.created} items`);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['price-items-spreadsheet-enhanced'] });
      queryClient.invalidateQueries({ queryKey: ['price-list-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to save changes');
      setIsConnected(false);
    },
  });

  // Auto-save functionality
  const autoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (hasChanges && !isSaving) {
        handleSave();
      }
    }, 3000); // Auto-save after 3 seconds of inactivity
  }, [hasChanges, isSaving]);

  // Handle workbook changes with history tracking
  const handleWorkbookChange = (data: any[]) => {
    setWorkbookData(data);
    
    const currentData = JSON.stringify(data);
    if (currentData !== lastSavedDataRef.current) {
      setHasChanges(true);
      autoSave();
    }
  };

  // Handle manual save
  const handleSave = () => {
    const items = convertFromSpreadsheetData(workbookData);
    if (items.length > 0) {
      setIsSaving(true);
      bulkUpdateMutation.mutate(items, {
        onSettled: () => {
          setIsSaving(false);
          lastSavedDataRef.current = JSON.stringify(workbookData);
        }
      });
    }
  };

  // Handle export with XLSX
  const handleExport = async () => {
    try {
      // Convert current spreadsheet data to Excel format
      const items = convertFromSpreadsheetData(workbookData);
      
      // Create worksheet data
      const wsData = [
        columns.filter(c => c.key !== '_select').map(c => c.name), // Headers
        ...items.map(item => 
          columns.filter(c => c.key !== '_select').map(col => {
            if (col.type === 'formula') {
              // Calculate formula value for export
              return calculateFormula(col.formula || '', item as PriceItem, 0);
            }
            return (item as any)[col.key] || '';
          })
        )
      ];
      
      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Set column widths
      const colWidths = columns.filter(c => c.key !== '_select').map(c => ({ wch: c.width / 7 }));
      ws['!cols'] = colWidths;
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Price List');
      
      // Save file
      XLSX.writeFile(wb, `price_list_${new Date().toISOString().split('T')[0]}.xlsx`);
      
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
      unit: 'pcs',
      rate: 0,
      lastUpdated: Date.now()
    };
    
    const currentItems = convertFromSpreadsheetData(workbookData);
    const updatedItems = [...currentItems, newItem];
    const sheetData = convertToSpreadsheetData(updatedItems as PriceItem[]);
    setWorkbookData(sheetData);
    setHasChanges(true);
  };

  // Delete selected rows
  const handleDeleteSelected = () => {
    const items = convertFromSpreadsheetData(workbookData);
    const filteredItems = items.filter((_, index) => !selectedRows.has(index + 1));
    const sheetData = convertToSpreadsheetData(filteredItems as PriceItem[]);
    setWorkbookData(sheetData);
    setHasChanges(true);
    setSelectedRows(new Set());
    toast.success(`Deleted ${selectedRows.size} rows`);
  };

  // Handle undo
  const handleUndo = () => {
    if (changeHistory.length > 0) {
      const lastChange = changeHistory[changeHistory.length - 1];
      // Apply undo logic here
      setRedoHistory([...redoHistory, lastChange]);
      setChangeHistory(changeHistory.slice(0, -1));
      toast.success('Undone');
    }
  };

  // Handle redo
  const handleRedo = () => {
    if (redoHistory.length > 0) {
      const lastRedo = redoHistory[redoHistory.length - 1];
      // Apply redo logic here
      setChangeHistory([...changeHistory, lastRedo]);
      setRedoHistory(redoHistory.slice(0, -1));
      toast.success('Redone');
    }
  };

  // Copy to clipboard
  const handleCopyToClipboard = () => {
    const items = convertFromSpreadsheetData(workbookData);
    const text = items.map(item => 
      columns.filter(c => c.key !== '_select').map(col => (item as any)[col.key] || '').join('\t')
    ).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard');
    });
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
      {/* Enhanced Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Title and Status Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
                <h2 className="text-xl font-bold">Advanced Price List Editor</h2>
                <div className="flex items-center gap-2 ml-4">
                  {isConnected ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <Cloud className="h-4 w-4" />
                      <span className="text-sm">Connected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-red-600">
                      <CloudOff className="h-4 w-4" />
                      <span className="text-sm">Offline</span>
                    </div>
                  )}
                  {hasChanges && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Unsaved changes</span>
                    </div>
                  )}
                  {isSaving && (
                    <div className="flex items-center gap-1 text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Saving...</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Search Bar */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in spreadsheet..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3"
                />
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary Actions */}
              <div className="flex items-center gap-2 border-r pr-2">
                <Button 
                  onClick={handleSave} 
                  disabled={!hasChanges || isSaving}
                  variant={hasChanges ? 'default' : 'outline'}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                
                <Button 
                  onClick={handleUndo} 
                  disabled={changeHistory.length === 0}
                  variant="outline"
                  size="sm"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="h-4 w-4" />
                </Button>
                
                <Button 
                  onClick={handleRedo} 
                  disabled={redoHistory.length === 0}
                  variant="outline"
                  size="sm"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Edit Actions */}
              <div className="flex items-center gap-2 border-r pr-2">
                <Button onClick={handleAddRow} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Row
                </Button>
                
                <Button 
                  onClick={handleDeleteSelected} 
                  disabled={selectedRows.size === 0}
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedRows.size})
                </Button>
                
                <Button 
                  onClick={handleCopyToClipboard}
                  variant="outline"
                  size="sm"
                  title="Copy all to clipboard"
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
              </div>
              
              {/* Import/Export Actions */}
              <div className="flex items-center gap-2">
                <Button onClick={handleExport} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Export Excel
                </Button>
                
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  <Upload className="h-4 w-4 mr-1" />
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
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{priceItems?.length || 0}</p>
              </div>
              <Calculator className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{dropdownOptions.categories.length}</p>
              </div>
              <Filter className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Selected</p>
                <p className="text-2xl font-bold">{selectedRows.size}</p>
              </div>
              <Check className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Saved</p>
                <p className="text-sm font-medium">
                  {isSaving ? 'Saving...' : hasChanges ? 'Unsaved' : 'All saved'}
                </p>
              </div>
              <Settings className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Tips */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Calculator className="h-4 w-4 text-blue-500" />
                Spreadsheet Features
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Double-click cells to edit inline</li>
                <li>• Use formulas like =SUM(I2:K2) for calculations</li>
                <li>• Dropdown menus for categories and units</li>
                <li>• Auto-save after 3 seconds of inactivity</li>
                <li>• Data validation for required fields</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                Keyboard Shortcuts
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Ctrl+S: Save changes</li>
                <li>• Ctrl+Z: Undo last action</li>
                <li>• Ctrl+Y: Redo last action</li>
                <li>• Ctrl+C/V: Copy and paste cells</li>
                <li>• Delete: Clear selected cells</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Spreadsheet Component */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div style={{ height: '75vh' }}>
            <Workbook 
              ref={workbookRef}
              data={workbookData}
              onChange={handleWorkbookChange}
              config={{
                column: columns.length,
                row: (priceItems?.length || 0) + 100, // Extra rows for new items
                autoFormatw: false,
                accuracy: 2,
                total: 1,
                title: 'Advanced Price List',
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
                  autoSum: true,
                  moreFormats: true,
                  conditionalFormat: true,
                  dataVerification: true,
                  splitColumn: true,
                  screenshot: false,
                  print: true,
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
                  merge: true,
                  border: true,
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
                  matrix: true,
                  sort: true,
                  filter: true,
                  cellComments: true,
                },
                functionButton: true,
                showsheetbar: true,
                showsheetbarConfig: {
                  add: true,
                  menu: true,
                  sheet: true,
                },
                forceCalculation: true,
                rowHeaderWidth: 50,
                columnHeaderHeight: 25,
                defaultFontSize: 11,
                limitSheetNameLength: true,
                defaultSheetNameLength: 31,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}