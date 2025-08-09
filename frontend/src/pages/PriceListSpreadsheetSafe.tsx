import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Table,
  Edit,
  X,
  Check
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { useCurrency } from '../hooks/useCurrency';
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

export default function PriceListSpreadsheetSafe() {
  const { formatPrice } = useCurrency();
  const queryClient = useQueryClient();
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [localData, setLocalData] = useState<PriceItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch price items with proper error handling
  const { data: priceItems, isLoading, error, refetch } = useQuery<PriceItem[]>({
    queryKey: ['price-items-spreadsheet-safe'],
    queryFn: async () => {
      try {
        const response = await api.get('/price-list');
        return response.data || [];
      } catch (err: any) {
        console.error('Error fetching price list:', err);
        if (err.response?.status === 401) {
          toast.error('Authentication required. Please log in again.');
          // Don't throw, return empty array to prevent crash
          return [];
        }
        throw err;
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000,
  });

  // Initialize local data when price items are loaded
  useEffect(() => {
    if (priceItems && priceItems.length > 0) {
      setLocalData(priceItems);
    }
  }, [priceItems]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (items: PriceItem[]) => {
      const response = await api.post('/price-list/bulk-update', { items });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Changes saved successfully');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['price-items-spreadsheet-safe'] });
    },
    onError: (error: any) => {
      console.error('Save error:', error);
      toast.error(error.response?.data?.message || 'Failed to save changes');
    }
  });

  // Handle cell edit
  const handleCellEdit = (rowId: string, field: string, value: any) => {
    setLocalData(prev => {
      const updated = prev.map(item => {
        if (item._id === rowId) {
          return { ...item, [field]: value };
        }
        return item;
      });
      return updated;
    });
    setHasChanges(true);
    setEditingCell(null);
  };

  // Start editing
  const startEdit = (rowId: string, field: string, currentValue: any) => {
    setEditingCell({ rowId, field });
    setEditValue(String(currentValue || ''));
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Save edit
  const saveEdit = () => {
    if (editingCell) {
      const { rowId, field } = editingCell;
      let value: any = editValue;
      
      // Convert to number for numeric fields
      if (['rate', 'labor_rate', 'material_rate', 'wastage_percentage'].includes(field)) {
        value = parseFloat(editValue) || 0;
      }
      
      handleCellEdit(rowId, field, value);
    }
  };

  // Export to Excel
  const handleExport = () => {
    try {
      const ws = XLSX.utils.json_to_sheet(localData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Price List');
      XLSX.writeFile(wb, `price-list-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    }
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
        
        // Map imported data to PriceItem format
        const importedItems: PriceItem[] = jsonData.map((row, index) => ({
          _id: row._id || `new-${Date.now()}-${index}`,
          id: row.id || row._id || `new-${Date.now()}-${index}`,
          code: row.code || row.Code,
          ref: row.ref || row.Reference,
          description: row.description || row.Description || '',
          category: row.category || row.Category,
          subcategory: row.subcategory || row.Subcategory,
          unit: row.unit || row.Unit,
          rate: parseFloat(row.rate || row.Rate) || 0,
          labor_rate: parseFloat(row.labor_rate || row['Labor Rate']) || 0,
          material_rate: parseFloat(row.material_rate || row['Material Rate']) || 0,
          wastage_percentage: parseFloat(row.wastage_percentage || row['Wastage %']) || 0,
          supplier: row.supplier || row.Supplier,
          location: row.location || row.Location,
          remark: row.remark || row.Remark,
        }));
        
        setLocalData(importedItems);
        setHasChanges(true);
        toast.success(`Imported ${importedItems.length} items`);
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Filter data based on search
  const filteredData = localData.filter(item => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      item.description?.toLowerCase().includes(searchLower) ||
      item.code?.toLowerCase().includes(searchLower) ||
      item.category?.toLowerCase().includes(searchLower) ||
      item.subcategory?.toLowerCase().includes(searchLower)
    );
  });

  // Render cell content
  const renderCell = (item: PriceItem, field: keyof PriceItem) => {
    const isEditing = editingCell?.rowId === item._id && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type={['rate', 'labor_rate', 'material_rate', 'wastage_percentage'].includes(field) ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            className="h-7 text-xs"
            autoFocus
          />
          <Button size="sm" variant="ghost" onClick={saveEdit} className="h-6 w-6 p-0">
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-6 w-6 p-0">
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    const value = item[field];
    const displayValue = ['rate', 'labor_rate', 'material_rate'].includes(field) && typeof value === 'number'
      ? formatPrice(value)
      : value || '-';

    return (
      <div 
        className="cursor-pointer hover:bg-gray-50 px-2 py-1 rounded"
        onDoubleClick={() => startEdit(item._id, field, value)}
      >
        {displayValue}
      </div>
    );
  };

  if (error && !priceItems) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-medium mb-2">Failed to load price list</p>
            <p className="text-sm text-gray-500 mb-4">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
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
              <Table className="h-5 w-5" />
              Price List Editor
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <div className="text-sm text-orange-600 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Unsaved changes
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={localData.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate(localData)}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Labor Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material Rate</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredData.map((item) => (
                    <tr key={item._id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'code')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'description')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'category')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'unit')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'rate')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'labor_rate')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'material_rate')}</td>
                      <td className="px-3 py-2 text-sm">{renderCell(item, 'supplier')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredData.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No items match your search' : 'No price items available'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImport}
        className="hidden"
      />
    </div>
  );
}