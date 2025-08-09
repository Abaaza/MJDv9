import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HotTable, HotColumn } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/dist/handsontable.full.min.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  Save,
  Download,
  Upload,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  Plus,
  Trash2,
  Copy,
  Scissors,
  Undo,
  Redo,
  Search,
  Filter,
  SortAsc,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import * as XLSX from 'xlsx';
import Handsontable from 'handsontable';

// Register Handsontable modules
registerAllModules();

interface PriceItem {
  _id?: string;
  id?: string;
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
  total_cost?: number;
  markup_percent?: number;
  final_price?: number;
  supplier?: string;
  location?: string;
  availability?: string;
  remark?: string;
  lastUpdated?: string;
}

export default function PriceListExcel() {
  const queryClient = useQueryClient();
  const hotTableRef = useRef<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedRange, setSelectedRange] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Fetch price items
  const { data: priceItems, isLoading, error, refetch } = useQuery<PriceItem[]>({
    queryKey: ['price-items-excel'],
    queryFn: async () => {
      try {
        const response = await api.get('/price-list');
        return response.data || [];
      } catch (err: any) {
        if (err.response?.status === 401) {
          toast.error('Please log in to access the price list');
          return [];
        }
        throw err;
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (items: PriceItem[]) => {
      const response = await api.post('/price-list/bulk-update', { items });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Changes saved successfully');
      setHasChanges(false);
      setLastSaved(new Date());
      queryClient.invalidateQueries({ queryKey: ['price-items-excel'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to save changes');
    }
  });

  // Column definitions with Excel-like formatting
  const columns = [
    {
      data: 'code',
      title: 'Code',
      width: 100,
      className: 'htLeft',
    },
    {
      data: 'ref',
      title: 'Reference',
      width: 100,
      className: 'htLeft',
    },
    {
      data: 'description',
      title: 'Description',
      width: 300,
      className: 'htLeft',
      renderer: 'text',
    },
    {
      data: 'category',
      title: 'Category',
      width: 150,
      type: 'dropdown',
      source: ['Electrical', 'Mechanical', 'Civil', 'Plumbing', 'HVAC', 'Fire Fighting', 'Landscaping', 'Other'],
      className: 'htLeft',
    },
    {
      data: 'subcategory',
      title: 'Subcategory',
      width: 150,
      className: 'htLeft',
    },
    {
      data: 'unit',
      title: 'Unit',
      width: 80,
      type: 'dropdown',
      source: ['pcs', 'm', 'm²', 'm³', 'kg', 'ton', 'ltr', 'set', 'lot', 'hr', 'day'],
      className: 'htCenter',
    },
    {
      data: 'rate',
      title: 'Rate',
      width: 100,
      type: 'numeric',
      numericFormat: {
        pattern: '0,0.00',
        culture: 'en-US'
      },
      className: 'htRight',
    },
    {
      data: 'labor_rate',
      title: 'Labor Rate',
      width: 100,
      type: 'numeric',
      numericFormat: {
        pattern: '0,0.00',
        culture: 'en-US'
      },
      className: 'htRight',
    },
    {
      data: 'material_rate',
      title: 'Material Rate',
      width: 100,
      type: 'numeric',
      numericFormat: {
        pattern: '0,0.00',
        culture: 'en-US'
      },
      className: 'htRight',
    },
    {
      data: 'wastage_percentage',
      title: 'Wastage %',
      width: 90,
      type: 'numeric',
      numericFormat: {
        pattern: '0.00',
        culture: 'en-US'
      },
      className: 'htRight',
    },
    {
      data: 'total_cost',
      title: 'Total Cost',
      width: 110,
      type: 'numeric',
      numericFormat: {
        pattern: '0,0.00',
        culture: 'en-US'
      },
      className: 'htRight',
      readOnly: true,
      renderer: function(instance: any, td: any, row: number, col: number, prop: any, value: any, cellProperties: any) {
        const rowData = instance.getDataAtRow(row);
        const rate = parseFloat(rowData[6]) || 0;
        const laborRate = parseFloat(rowData[7]) || 0;
        const materialRate = parseFloat(rowData[8]) || 0;
        const wastage = parseFloat(rowData[9]) || 0;
        const totalCost = (rate + laborRate + materialRate) * (1 + wastage / 100);
        
        td.innerHTML = totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        td.style.background = '#f0f0f0';
        td.style.fontWeight = '500';
        return td;
      },
    },
    {
      data: 'markup_percent',
      title: 'Markup %',
      width: 90,
      type: 'numeric',
      numericFormat: {
        pattern: '0.00',
        culture: 'en-US'
      },
      className: 'htRight',
    },
    {
      data: 'final_price',
      title: 'Final Price',
      width: 110,
      type: 'numeric',
      numericFormat: {
        pattern: '0,0.00',
        culture: 'en-US'
      },
      className: 'htRight',
      readOnly: true,
      renderer: function(instance: any, td: any, row: number, col: number, prop: any, value: any, cellProperties: any) {
        const rowData = instance.getDataAtRow(row);
        const rate = parseFloat(rowData[6]) || 0;
        const laborRate = parseFloat(rowData[7]) || 0;
        const materialRate = parseFloat(rowData[8]) || 0;
        const wastage = parseFloat(rowData[9]) || 0;
        const markup = parseFloat(rowData[11]) || 0;
        const totalCost = (rate + laborRate + materialRate) * (1 + wastage / 100);
        const finalPrice = totalCost * (1 + markup / 100);
        
        td.innerHTML = finalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        td.style.background = '#e8f5e9';
        td.style.fontWeight = 'bold';
        td.style.color = '#2e7d32';
        return td;
      },
    },
    {
      data: 'material_type',
      title: 'Material Type',
      width: 120,
      className: 'htLeft',
    },
    {
      data: 'material_grade',
      title: 'Grade',
      width: 100,
      className: 'htLeft',
    },
    {
      data: 'supplier',
      title: 'Supplier',
      width: 150,
      className: 'htLeft',
    },
    {
      data: 'location',
      title: 'Location',
      width: 120,
      className: 'htLeft',
    },
    {
      data: 'availability',
      title: 'Availability',
      width: 100,
      type: 'dropdown',
      source: ['In Stock', 'Out of Stock', 'Limited', 'On Order'],
      className: 'htCenter',
      renderer: function(instance: any, td: any, row: number, col: number, prop: any, value: any, cellProperties: any) {
        td.innerHTML = value || '';
        if (value === 'In Stock') {
          td.style.color = '#4caf50';
          td.style.fontWeight = 'bold';
        } else if (value === 'Out of Stock') {
          td.style.color = '#f44336';
          td.style.fontWeight = 'bold';
        } else if (value === 'Limited') {
          td.style.color = '#ff9800';
        }
        return td;
      },
    },
    {
      data: 'remark',
      title: 'Remarks',
      width: 200,
      className: 'htLeft',
    },
  ];

  // Handle data changes
  const handleAfterChange = useCallback((changes: any, source: string) => {
    if (source === 'loadData' || !changes) return;
    
    setHasChanges(true);
    
    // Auto-save after 2 seconds of no changes
    if (autoSave) {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
      
      autoSaveTimer.current = setTimeout(() => {
        const hotInstance = hotTableRef.current?.hotInstance;
        if (hotInstance) {
          const data = hotInstance.getData();
          const items = data.map((row: any[]) => ({
            code: row[0],
            ref: row[1],
            description: row[2],
            category: row[3],
            subcategory: row[4],
            unit: row[5],
            rate: parseFloat(row[6]) || 0,
            labor_rate: parseFloat(row[7]) || 0,
            material_rate: parseFloat(row[8]) || 0,
            wastage_percentage: parseFloat(row[9]) || 0,
            markup_percent: parseFloat(row[11]) || 0,
            material_type: row[13],
            material_grade: row[14],
            supplier: row[15],
            location: row[16],
            availability: row[17],
            remark: row[18],
          }));
          saveMutation.mutate(items);
        }
      }, 2000);
    }
  }, [autoSave, saveMutation]);

  // Export to Excel
  const handleExport = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (!hotInstance) return;

    const data = hotInstance.getData();
    const headers = columns.map(col => col.title);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    
    // Set column widths
    ws['!cols'] = columns.map(col => ({ wch: col.width / 7 }));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Price List');
    XLSX.writeFile(wb, `price-list-${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Exported to Excel successfully');
  };

  // Import from Excel
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        // Skip header row
        const dataRows = jsonData.slice(1);
        
        const hotInstance = hotTableRef.current?.hotInstance;
        if (hotInstance) {
          hotInstance.loadData(dataRows);
          setHasChanges(true);
          toast.success(`Imported ${dataRows.length} rows from Excel`);
        }
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Add new row
  const handleAddRow = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance) {
      hotInstance.alter('insert_row_below', hotInstance.countRows());
      toast.success('New row added');
    }
  };

  // Delete selected rows
  const handleDeleteRows = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance && selectedRange) {
      const startRow = selectedRange.start.row;
      const endRow = selectedRange.end.row;
      const count = endRow - startRow + 1;
      
      if (confirm(`Delete ${count} row(s)?`)) {
        hotInstance.alter('remove_row', startRow, count);
        setHasChanges(true);
        toast.success(`Deleted ${count} row(s)`);
      }
    } else {
      toast.error('Please select rows to delete');
    }
  };

  // Handle copy/paste/undo/redo
  const handleCopy = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance) {
      hotInstance.copyPaste.copy();
      toast.success('Copied to clipboard');
    }
  };

  const handlePaste = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance) {
      hotInstance.copyPaste.paste();
    }
  };

  const handleUndo = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance && hotInstance.isUndoAvailable()) {
      hotInstance.undo();
    }
  };

  const handleRedo = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance && hotInstance.isRedoAvailable()) {
      hotInstance.redo();
    }
  };

  // Search functionality
  const handleSearch = () => {
    const hotInstance = hotTableRef.current?.hotInstance;
    if (hotInstance && searchQuery) {
      const searchPlugin = hotInstance.getPlugin('search');
      const results = searchPlugin.query(searchQuery);
      if (results.length > 0) {
        hotInstance.selectCell(results[0].row, results[0].col);
        toast.success(`Found ${results.length} matches`);
      } else {
        toast.error('No matches found');
      }
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium mb-2">Failed to load price list</p>
            <Button onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Excel-like Price List Editor
              {lastSaved && (
                <span className="text-sm text-gray-500 ml-2">
                  Last saved: {lastSaved.toLocaleTimeString()}
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <div className="flex items-center gap-1 text-orange-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Unsaved changes</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSave}
                    onChange={(e) => setAutoSave(e.target.checked)}
                    className="rounded"
                  />
                  Auto-save
                </label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddRow}
                title="Add Row"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDeleteRows}
                title="Delete Selected Rows"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-300" />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                title="Copy (Ctrl+C)"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePaste}
                title="Paste (Ctrl+V)"
              >
                <Scissors className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-300" />
              <Button
                size="sm"
                variant="outline"
                onClick={handleUndo}
                title="Undo (Ctrl+Z)"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRedo}
                title="Redo (Ctrl+Y)"
              >
                <Redo className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-gray-300" />
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="h-8 w-48"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSearch}
                  title="Search"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-1 h-4 w-4" />
                Import Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
              >
                <Download className="mr-1 h-4 w-4" />
                Export Excel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const hotInstance = hotTableRef.current?.hotInstance;
                  if (hotInstance) {
                    const data = hotInstance.getData();
                    const items = data.map((row: any[]) => ({
                      code: row[0],
                      ref: row[1],
                      description: row[2],
                      category: row[3],
                      subcategory: row[4],
                      unit: row[5],
                      rate: parseFloat(row[6]) || 0,
                      labor_rate: parseFloat(row[7]) || 0,
                      material_rate: parseFloat(row[8]) || 0,
                      wastage_percentage: parseFloat(row[9]) || 0,
                      markup_percent: parseFloat(row[11]) || 0,
                      material_type: row[13],
                      material_grade: row[14],
                      supplier: row[15],
                      location: row[16],
                      availability: row[17],
                      remark: row[18],
                    }));
                    saveMutation.mutate(items);
                  }
                }}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-1 h-4 w-4" />
                )}
                Save All
              </Button>
            </div>
          </div>

          {/* Spreadsheet */}
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 350px)' }}>
              <HotTable
                ref={hotTableRef}
                data={priceItems || []}
                columns={columns}
                colHeaders={true}
                rowHeaders={true}
                width="100%"
                height="100%"
                stretchH="all"
                manualColumnResize={true}
                manualRowResize={true}
                manualColumnMove={true}
                manualRowMove={true}
                contextMenu={true}
                multiColumnSorting={true}
                filters={true}
                dropdownMenu={true}
                autoWrapRow={true}
                autoWrapCol={true}
                fillHandle={true}
                minSpareRows={1}
                undo={true}
                redo={true}
                search={true}
                comments={true}
                customBorders={true}
                mergeCells={true}
                afterChange={handleAfterChange}
                afterSelection={(row: number, col: number, row2: number, col2: number) => {
                  setSelectedRange({
                    start: { row, col },
                    end: { row: row2, col: col2 }
                  });
                }}
                licenseKey="non-commercial-and-evaluation"
                className="handsontable-excel"
              />
            </div>
          )}
        </CardContent>
      </Card>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImport}
        className="hidden"
      />
      
      <style jsx global>{`
        .handsontable-excel {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 13px;
        }
        .handsontable-excel .ht_master table {
          border-collapse: separate;
        }
        .handsontable-excel th {
          background-color: #f5f5f5;
          font-weight: 600;
          border-right: 1px solid #ddd;
          border-bottom: 1px solid #ddd;
        }
        .handsontable-excel td {
          border-right: 1px solid #e0e0e0;
          border-bottom: 1px solid #e0e0e0;
        }
        .handsontable-excel .htDimmed {
          color: #999;
        }
        .handsontable-excel .htInvalid {
          background-color: #ffebee !important;
        }
        .handsontable-excel .currentRow {
          background-color: #e8f5e9 !important;
        }
        .handsontable-excel .currentCol {
          background-color: #e3f2fd !important;
        }
      `}</style>
    </div>
  );
}