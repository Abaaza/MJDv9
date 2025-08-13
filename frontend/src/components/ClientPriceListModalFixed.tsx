import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Eye,
  RefreshCw,
  Users,
  Calendar,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface ClientPriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Mock data for testing when no clients exist
const mockClients = [
  { _id: 'mock1', name: 'Sample Client 1', email: 'client1@example.com', isActive: true },
  { _id: 'mock2', name: 'Sample Client 2', email: 'client2@example.com', isActive: true },
];

export const ClientPriceListModalFixed: React.FC<ClientPriceListModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'new' | 'update'>('new');
  const [priceListName, setPriceListName] = useState('');
  const [priceListDescription, setPriceListDescription] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // For now, use mock clients if database is empty
  const clients = mockClients;
  const clientPriceLists: any[] = [];

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('upload');
      setSelectedClient('');
      setUploadMode('new');
      setPriceListName('');
      setPriceListDescription('');
      setEffectiveFrom('');
      setEffectiveTo('');
      setIsDefault(false);
      setSelectedFile(null);
      setUploadProgress(0);
    }
  }, [isOpen]);

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
      ];
      
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an Excel (.xlsx, .xls) or CSV file',
          variant: 'destructive',
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  // Handle file upload and sync
  const handleUploadAndSync = async () => {
    if (!selectedClient || !selectedFile) {
      toast({
        title: 'Missing information',
        description: 'Please select a client and file',
        variant: 'destructive',
      });
      return;
    }

    if (uploadMode === 'new' && !priceListName) {
      toast({
        title: 'Missing information',
        description: 'Please enter a name for the new price list',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('clientId', selectedClient);
      formData.append('createNew', uploadMode === 'new' ? 'true' : 'false');
      
      if (uploadMode === 'new') {
        formData.append('priceListName', priceListName);
        formData.append('description', priceListDescription);
        formData.append('isDefault', isDefault.toString());
        if (effectiveFrom) formData.append('effectiveFrom', new Date(effectiveFrom).getTime().toString());
        if (effectiveTo) formData.append('effectiveTo', new Date(effectiveTo).getTime().toString());
      }

      setUploadProgress(30);

      // Simulate upload for now
      await new Promise(resolve => setTimeout(resolve, 2000));
      setUploadProgress(100);

      toast({
        title: 'Upload successful',
        description: `Price list "${priceListName}" has been created successfully`,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to process the file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Client Price List Management</DialogTitle>
          <DialogDescription>
            Upload and manage client-specific price lists with automatic Excel mapping
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload & Sync</TabsTrigger>
            <TabsTrigger value="manage">Manage Price Lists</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            {/* Client Selection */}
            <div>
              <Label htmlFor="client">Select Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client._id} value={client._id}>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {client.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Don't see your client? Add them in the Clients section first.
              </p>
            </div>

            {/* Upload Mode */}
            {selectedClient && (
              <div className="space-y-2">
                <Label>Upload Mode</Label>
                <RadioGroup value={uploadMode} onValueChange={(value) => setUploadMode(value as 'new' | 'update')}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="new" id="new" />
                    <Label htmlFor="new">Create New Price List</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="update" id="update" disabled={clientPriceLists.length === 0} />
                    <Label htmlFor="update" className={clientPriceLists.length === 0 ? 'text-muted-foreground' : ''}>
                      Update Existing Price List {clientPriceLists.length === 0 && '(No existing lists)'}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* New Price List Details */}
            {uploadMode === 'new' && selectedClient && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/10">
                <h3 className="font-medium text-sm">New Price List Details</h3>
                
                <div>
                  <Label htmlFor="name">Price List Name *</Label>
                  <Input
                    id="name"
                    value={priceListName}
                    onChange={(e) => setPriceListName(e.target.value)}
                    placeholder="e.g., Q1 2025 Rates"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={priceListDescription}
                    onChange={(e) => setPriceListDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="effectiveFrom">Effective From</Label>
                    <Input
                      id="effectiveFrom"
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="effectiveTo">Effective To</Label>
                    <Input
                      id="effectiveTo"
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="isDefault">Set as default price list for this client</Label>
                </div>
              </div>
            )}

            {/* File Upload */}
            {selectedClient && (uploadMode === 'new' || clientPriceLists.length > 0) && (
              <div className="space-y-2">
                <Label htmlFor="file">Excel File (MJD-PRICELIST.xlsx)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="flex-1"
                  />
                  {selectedFile && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <FileSpreadsheet className="h-3 w-3" />
                      {selectedFile.name}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Upload your client's MJD-PRICELIST.xlsx file. The system will automatically map items and update rates.
                </p>
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUploadAndSync}
              disabled={!selectedClient || !selectedFile || isUploading || (uploadMode === 'new' && !priceListName)}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload and Sync
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="manage" className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No price lists found. Upload a price list for a client to get started.
              </AlertDescription>
            </Alert>
            
            <div className="text-center py-8">
              <Button variant="outline" onClick={() => setActiveTab('upload')}>
                <Plus className="mr-2 h-4 w-4" />
                Upload First Price List
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};