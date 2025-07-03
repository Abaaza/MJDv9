import { useState, useEffect } from 'react';
import { X, Search, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';
import { useCurrency } from '../hooks/useCurrency';

interface MatchResult {
  _id: string;
  rowNumber: number;
  originalDescription: string;
  originalQuantity?: number;
  originalUnit?: string;
  contextHeaders?: string[];
  matchedItemId?: string;
  matchedDescription?: string;
  matchedCode?: string;
  matchedUnit?: string;
  matchedRate?: number;
  confidence: number;
  totalPrice?: number;
  notes?: string;
}

interface PriceItem {
  _id: string;
  code: string;
  description: string;
  unit: string;
  rate: number;
  category?: string;
  specifications?: string;
}

interface MatchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: MatchResult;
  onSave: (updates: Partial<MatchResult>) => void;
  onRunAIMatch?: () => void;
  onRunLocalMatch?: () => void;
  priceItems?: PriceItem[];
  matchingMethod?: string; // Add matching method to know if AI should be disabled
}

export default function MatchResultModal({
  isOpen,
  onClose,
  result,
  onSave,
  onRunAIMatch,
  onRunLocalMatch,
  priceItems = [],
  matchingMethod,
}: MatchResultModalProps) {
  const { formatPrice } = useCurrency();
  // Check if AI methods are disabled based on matching method
  const isAIDisabled = matchingMethod === 'LOCAL' || 
                       matchingMethod === 'LOCAL_UNIT' || 
                       matchingMethod === 'ADVANCED';
  
  // Set default tab based on whether AI is disabled
  const [activeTab, setActiveTab] = useState<'ai' | 'local' | 'manual'>(isAIDisabled ? 'manual' : 'ai');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<PriceItem | null>(null);
  const [customRate, setCustomRate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (result) {
      setNotes(result.notes || '');
      setCustomRate(result.matchedRate?.toString() || '');
      // Reset selected item when result changes
      setSelectedItem(null);
    }
  }, [result]);

  // Update active tab when AI disabled state changes
  useEffect(() => {
    if (isAIDisabled && activeTab === 'ai') {
      setActiveTab('local');
    }
  }, [isAIDisabled, activeTab]);

  const filteredPriceItems = priceItems.filter(item =>
    item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectItem = (item: PriceItem) => {
    setSelectedItem(item);
    setCustomRate(item.rate.toString());
  };

  const handleSave = () => {
    if (!selectedItem && activeTab === 'manual') {
      return;
    }

    const updates: Partial<MatchResult> = {
      notes,
    };

    if (activeTab === 'manual' && selectedItem) {
      updates.matchedItemId = selectedItem._id;
      updates.matchedDescription = selectedItem.description;
      updates.matchedCode = selectedItem.code;
      updates.matchedUnit = selectedItem.unit;
      updates.matchedRate = parseFloat(customRate) || selectedItem.rate;
      updates.confidence = 1.0; // Manual match has 100% confidence
    } else if (customRate) {
      updates.matchedRate = parseFloat(customRate);
    }

    if (result.originalQuantity && updates.matchedRate) {
      updates.totalPrice = result.originalQuantity * updates.matchedRate;
    }

    onSave(updates);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Match Result</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {/* Context Headers */}
          {result.contextHeaders && result.contextHeaders.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">Section</h4>
              <div className="text-sm text-yellow-700">
                {result.contextHeaders.map((header, index) => (
                  <span key={index}>
                    {header}
                    {index < result.contextHeaders!.length - 1 && ' > '}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Original Item Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">Original Item (Row {result.rowNumber})</h3>
            <p className="text-sm text-gray-600">{result.originalDescription}</p>
            {result.originalQuantity && (
              <p className="text-sm mt-1">
                Quantity: {result.originalQuantity} {result.originalUnit}
              </p>
            )}
          </div>

          {/* Current Match Info */}
          {result.matchedDescription && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-medium mb-2">Current Match</h3>
              <div className="text-sm space-y-1">
                <p><span className="font-medium">Code:</span> {result.matchedCode}</p>
                <p><span className="font-medium">Description:</span> {result.matchedDescription}</p>
                <p><span className="font-medium">Rate:</span> {formatPrice(result.matchedRate)}</p>
                <p><span className="font-medium">Confidence:</span> {Math.round(result.confidence * 100)}%</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            {!isAIDisabled && (
              <button
                onClick={() => setActiveTab('ai')}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  activeTab === 'ai'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                AI Match
              </button>
            )}
            <button
              onClick={() => setActiveTab('local')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                activeTab === 'local'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              Local Match
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors',
                activeTab === 'manual'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              Manual Selection
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'ai' && !isAIDisabled && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Run AI-powered matching using advanced embeddings to find the best match.
              </p>
              <Button 
                onClick={async () => {
                  if (isProcessing || !onRunAIMatch) return;
                  setIsProcessing(true);
                  try {
                    await onRunAIMatch();
                  } catch (error) {
                    console.error('AI match error:', error);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? 'Processing...' : 'Run AI Match'}
              </Button>
            </div>
          )}

          {activeTab === 'local' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Run local fuzzy string matching for quick results.
              </p>
              <Button 
                onClick={async () => {
                  if (isProcessing || !onRunLocalMatch) return;
                  setIsProcessing(true);
                  try {
                    await onRunLocalMatch();
                  } catch (error) {
                    console.error('Local match error:', error);
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? 'Processing...' : 'Run Local Match'}
              </Button>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search price list..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Price Items List */}
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                {filteredPriceItems.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-2"></th>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-left p-2">Unit</th>
                        <th className="text-left p-2">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPriceItems.map((item) => (
                        <tr
                          key={item._id}
                          onClick={() => handleSelectItem(item)}
                          className={cn(
                            'cursor-pointer hover:bg-gray-50',
                            selectedItem?._id === item._id && 'bg-blue-50'
                          )}
                        >
                          <td className="p-2">
                            {selectedItem?._id === item._id && (
                              <Check className="h-4 w-4 text-blue-500" />
                            )}
                          </td>
                          <td className="p-2">{item.code}</td>
                          <td className="p-2">{item.description}</td>
                          <td className="p-2">{item.unit}</td>
                          <td className="p-2">{formatPrice(item.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-4 text-center text-gray-500">No items found</p>
                )}
              </div>
            </div>
          )}

          {/* Custom Rate */}
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="customRate">Custom Rate (Optional)</Label>
              <Input
                id="customRate"
                type="number"
                step="0.01"
                value={customRate}
                onChange={(e) => setCustomRate(e.target.value)}
                placeholder="Enter custom rate"
                className="mt-1"
              />
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
              />
            </div>

            {/* Total Price Preview */}
            {result.originalQuantity && customRate && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm">
                  <span className="font-medium">Total Price:</span>{' '}
                  {formatPrice(result.originalQuantity * parseFloat(customRate))}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}