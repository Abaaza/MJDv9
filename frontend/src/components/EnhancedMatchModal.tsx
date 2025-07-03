import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Zap, 
  Search,
  Brain,
  Cpu,
  Activity,
  AlertCircle,
  Check
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import { debounce } from 'lodash';
import { useCurrency } from '../hooks/useCurrency';

interface MatchResult {
  _id: string;
  jobId: string;
  rowNumber: number;
  originalDescription: string;
  originalQuantity?: number;
  originalUnit?: string;
  originalRowData?: any;
  contextHeaders?: string[];
  matchedItemId?: string;
  matchedDescription?: string;
  matchedCode?: string;
  matchedUnit?: string;
  matchedRate?: number;
  confidence: number;
  matchMethod: string;
  isManuallyEdited: boolean;
  totalPrice?: number;
  notes?: string;
}

interface Job {
  _id: string;
  fileName: string;
  headers?: string[];
  sheetName?: string;
  matchingMethod?: string;
}

interface EnhancedMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: MatchResult;
  allResults: MatchResult[];
  job: Job;
  onSave: (updates: Partial<MatchResult>) => Promise<void>;
  onNavigate: (resultId: string) => void;
}

type MatchingMethod = 'AI' | 'LOCAL' | 'MANUAL';

export function EnhancedMatchModal({
  isOpen,
  onClose,
  result,
  allResults,
  job,
  onSave,
  onNavigate,
}: EnhancedMatchModalProps) {
  const { formatPrice, symbol } = useCurrency();
  const [matchingMethod, setMatchingMethod] = useState<MatchingMethod>('AI');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [formData, setFormData] = useState({
    matchedDescription: '',
    matchedCode: '',
    matchedUnit: '',
    matchedRate: 0,
    notes: '',
  });

  const currentIndex = allResults.findIndex(r => r._id === result._id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allResults.length - 1;
  
  // Check if AI matching should be disabled based on the job's matching method
  const isAIDisabled = job.matchingMethod === 'LOCAL' || 
                       job.matchingMethod === 'LOCAL_UNIT' || 
                       job.matchingMethod === 'ADVANCED';

  useEffect(() => {
    setFormData({
      matchedDescription: result.matchedDescription || '',
      matchedCode: result.matchedCode || '',
      matchedUnit: result.matchedUnit || '',
      matchedRate: result.matchedRate || 0,
      notes: result.notes || '',
    });
    setHasUnsavedChanges(false);
    
    // If AI is disabled and it's selected, switch to LOCAL
    if (isAIDisabled && matchingMethod === 'AI') {
      setMatchingMethod('LOCAL');
    }
  }, [result, isAIDisabled]);

  // Auto-save mutation
  const autoSaveMutation = useMutation({
    mutationFn: async (updates: Partial<MatchResult>) => {
      const response = await api.post(`/price-matching/results/${result._id}/autosave`, updates);
      return response.data;
    },
  });

  // Debounced auto-save
  const debouncedAutoSave = useCallback(
    debounce((updates: Partial<MatchResult>) => {
      autoSaveMutation.mutate(updates);
    }, 1000),
    [result._id]
  );

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await api.post('/price-list/search', { query, limit: 10 });
      return response.data;
    },
    onSuccess: (data) => {
      setSearchResults(data);
      setIsSearching(false);
    },
    onError: () => {
      toast.error('Search failed');
      setIsSearching(false);
    },
  });

  // Run AI match mutation
  const runMatchMutation = useMutation({
    mutationFn: async (method: string) => {
      const response = await api.post(`/price-matching/results/${result._id}/match`, { method });
      return response.data;
    },
    onSuccess: (data) => {
      setFormData({
        matchedDescription: data.matchedDescription || '',
        matchedCode: data.matchedCode || '',
        matchedUnit: data.matchedUnit || '',
        matchedRate: data.matchedRate || 0,
        notes: formData.notes,
      });
      toast.success('AI matching completed');
      setHasUnsavedChanges(true);
    },
    onError: () => {
      toast.error('AI matching failed');
    },
  });

  const handleFieldChange = (field: keyof typeof formData, value: any) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    setHasUnsavedChanges(true);
    
    // Auto-save
    debouncedAutoSave({
      [field]: value,
      totalPrice: field === 'matchedRate' && result.originalQuantity 
        ? Number(value) * result.originalQuantity 
        : undefined,
    });
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    searchMutation.mutate(searchQuery);
  };

  const handleSelectSearchResult = (item: any) => {
    setFormData({
      matchedDescription: item.description,
      matchedCode: item.code || '',
      matchedUnit: item.unit || '',
      matchedRate: item.rate || 0,
      notes: formData.notes,
    });
    setHasUnsavedChanges(true);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        totalPrice: formData.matchedRate && result.originalQuantity 
          ? formData.matchedRate * result.originalQuantity 
          : undefined,
      });
      setHasUnsavedChanges(false);
      toast.success('Changes saved');
    } catch (error) {
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Continue?')) {
      return;
    }
    
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < allResults.length) {
      onNavigate(allResults[newIndex]._id);
    }
  };

  const getMethodIcon = (method: MatchingMethod) => {
    switch (method) {
      case 'AI':
        return <Brain className="h-4 w-4" />;
      case 'LOCAL':
        return <Cpu className="h-4 w-4" />;
      case 'MANUAL':
        return <Search className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Edit Match - Row {result.rowNumber}</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleNavigate('prev')}
                disabled={!hasPrevious}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {allResults.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleNavigate('next')}
                disabled={!hasNext}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* Original Item Context */}
          <Card className="p-4 bg-muted/50">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Original Item Context
            </h3>
            
            <div className="space-y-2">
              {/* Context Headers (Section Headers) */}
              {result.contextHeaders && result.contextHeaders.length > 0 && (
                <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                  <Label className="text-xs text-yellow-800 mb-1 block">Section</Label>
                  <p className="text-sm text-yellow-700 font-medium">
                    {result.contextHeaders.join(' > ')}
                  </p>
                </div>
              )}
              
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="font-medium">{result.originalDescription}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Quantity</Label>
                  <p>{result.originalQuantity || '-'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unit</Label>
                  <p>{result.originalUnit || '-'}</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Matching Method Selection */}
          <div>
            <Label className="mb-2">Matching Method</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['AI', 'LOCAL', 'MANUAL'] as MatchingMethod[]).map((method) => {
                const disabled = method === 'AI' && isAIDisabled;
                return (
                  <button
                    key={method}
                    onClick={() => !disabled && setMatchingMethod(method)}
                    disabled={disabled}
                    className={cn(
                      'p-3 rounded-lg border transition-colors flex flex-col items-center gap-1',
                      disabled && 'opacity-50 cursor-not-allowed',
                      matchingMethod === method
                        ? 'border-primary bg-primary/10'
                        : disabled 
                          ? 'border-border'
                          : 'border-border hover:border-primary/50'
                    )}
                  >
                    {getMethodIcon(method)}
                    <span className="text-sm font-medium">
                      {method}
                      {disabled && <span className="text-xs block text-muted-foreground">(Disabled)</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Method-specific UI */}
          {matchingMethod === 'AI' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Select defaultValue="ADVANCED">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADVANCED">Advanced</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                    <SelectItem value="COHERE">Cohere</SelectItem>
                    <SelectItem value="OPENAI">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => runMatchMutation.mutate('ADVANCED')}
                  disabled={runMatchMutation.isPending}
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Run AI Match
                </Button>
              </div>
              {result.confidence > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Current confidence:</span>
                  <span className={cn('font-medium', getConfidenceColor(result.confidence))}>
                    {Math.round(result.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {matchingMethod === 'LOCAL' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search price list..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={isSearching}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              
              {searchResults.length > 0 && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item._id}
                      onClick={() => handleSelectSearchResult(item)}
                      className="w-full p-3 text-left hover:bg-muted border-b last:border-0 transition-colors"
                    >
                      <div className="font-medium">{item.code} - {item.description}</div>
                      <div className="text-sm text-muted-foreground">
                        Rate: {formatPrice(item.rate)} | Unit: {item.unit}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Match Result Form */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="matchedDescription">Matched Description</Label>
              <Textarea
                id="matchedDescription"
                value={formData.matchedDescription}
                onChange={(e) => handleFieldChange('matchedDescription', e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="matchedCode">Code</Label>
                <Input
                  id="matchedCode"
                  value={formData.matchedCode}
                  onChange={(e) => handleFieldChange('matchedCode', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="matchedUnit">Unit</Label>
                <Input
                  id="matchedUnit"
                  value={formData.matchedUnit}
                  onChange={(e) => handleFieldChange('matchedUnit', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="matchedRate">Rate</Label>
                <Input
                  id="matchedRate"
                  type="number"
                  value={formData.matchedRate}
                  onChange={(e) => handleFieldChange('matchedRate', parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Total Price</Label>
                <div className="mt-1 p-2 bg-muted rounded-md font-medium">
                  {result.originalQuantity && formData.matchedRate
                    ? formatPrice(result.originalQuantity * formData.matchedRate)
                    : '-'}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleFieldChange('notes', e.target.value)}
                rows={2}
                className="mt-1"
                placeholder="Add any notes or comments..."
              />
            </div>
          </div>

          {/* Auto-save indicator */}
          {autoSaveMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-3 w-3 animate-pulse" />
              Auto-saving...
            </div>
          )}
          {autoSaveMutation.isSuccess && !hasUnsavedChanges && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-3 w-3" />
              All changes saved
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}