import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  DollarSign,
} from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface ClientPriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface Client {
  _id: string;
  name: string;
  email?: string;
  isActive: boolean;
}

interface PriceList {
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom?: number;
  effectiveTo?: number;
  sourceFileName?: string;
  lastSyncedAt?: number;
  clientName?: string;
}

interface MappingStats {
  total: number;
  verified: number;
  unverified: number;
  byMethod: Record<string, number>;
  byConfidence: {
    high: number;
    medium: number;
    low: number;
  };
  bySheet: Record<string, number>;
}

export const ClientPriceListModal: React.FC<ClientPriceListModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const convex = useConvex();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedPriceList, setSelectedPriceList] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'new' | 'update'>('new');
  const [priceListName, setPriceListName] = useState('');
  const [priceListDescription, setPriceListDescription] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mappingStats, setMappingStats] = useState<MappingStats | null>(null);

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const result = await convex.query(api.clients.getActive);
      return result as Client[];
    },
  });

  // Fetch price lists for selected client
  const { data: clientPriceLists = [], refetch: refetchPriceLists } = useQuery({
    queryKey: ['clientPriceLists', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const result = await convex.query(api.clientPriceLists.getByClient, {
        clientId: selectedClient as any,
      });
      return result as PriceList[];
    },
    enabled: !!selectedClient,
  });

  // Fetch all price lists for management tab
  const { data: allPriceLists = [], refetch: refetchAllPriceLists } = useQuery({
    queryKey: ['allPriceLists'],
    queryFn: async () => {
      const result = await convex.query(api.clientPriceLists.getAllActive);
      return result as PriceList[];
    },
    enabled: activeTab === 'manage',
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('upload');
      setSelectedClient('');
      setSelectedPriceList('');
      setUploadMode('new');
      setPriceListName('');
      setPriceListDescription('');
      setEffectiveFrom('');
      setEffectiveTo('');
      setIsDefault(false);
      setSelectedFile(null);
      setUploadProgress(0);
      setMappingStats(null);
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

    if (uploadMode === 'update' && !selectedPriceList) {
      toast({
        title: 'Missing information',
        description: 'Please select a price list to update',
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
      } else {
        formData.append('priceListId', selectedPriceList);
      }

      setUploadProgress(30);

      const token = localStorage.getItem('accessToken');
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/client-prices/price-lists/upload-sync`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${token}`,
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              30 + ((progressEvent.loaded * 40) / (progressEvent.total || 1))
            );
            setUploadProgress(percentCompleted);
          },
        }
      );

      setUploadProgress(80);

      if (response.data.success) {
        // Fetch mapping statistics
        const statsResponse = await axios.get(
          `${import.meta.env.VITE_API_URL}/client-prices/price-lists/${response.data.priceListId}/mapping-stats`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        setMappingStats(statsResponse.data);
        setUploadProgress(100);

        toast({
          title: 'Upload successful',
          description: `Successfully processed ${response.data.mappingResults.mappedItems} items`,
        });

        // Refresh price lists
        refetchPriceLists();
        refetchAllPriceLists();
        
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error.response?.data?.error || 'Failed to process the file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle price list sync
  const handleSyncPriceList = async (priceListId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      await axios.post(
        `${import.meta.env.VITE_API_URL}/client-prices/price-lists/${priceListId}/sync`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast({
        title: 'Sync initiated',
        description: 'Price list sync has been started',
      });

      refetchAllPriceLists();
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: 'Sync failed',
        description: 'Failed to sync price list',
        variant: 'destructive',
      });
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
                    <RadioGroupItem value="update" id="update" />
                    <Label htmlFor="update">Update Existing Price List</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* New Price List Details */}
            {uploadMode === 'new' && selectedClient && (
              <div className="space-y-4 border rounded-lg p-4">
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

            {/* Existing Price List Selection */}
            {uploadMode === 'update' && selectedClient && (
              <div>
                <Label htmlFor="priceList">Select Price List to Update</Label>
                <Select value={selectedPriceList} onValueChange={setSelectedPriceList}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a price list" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientPriceLists.map((priceList) => (
                      <SelectItem key={priceList._id} value={priceList._id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{priceList.name}</span>
                          {priceList.isDefault && (
                            <Badge variant="secondary" className="ml-2">Default</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* File Upload */}
            {selectedClient && (uploadMode === 'update' ? selectedPriceList : true) && (
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

            {/* Mapping Statistics */}
            {mappingStats && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-semibold">Mapping Complete!</p>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div>
                        <span className="text-muted-foreground">Total Items:</span>
                        <span className="ml-2 font-medium">{mappingStats.total}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Verified:</span>
                        <span className="ml-2 font-medium text-green-600">{mappingStats.verified}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Needs Review:</span>
                        <span className="ml-2 font-medium text-yellow-600">{mappingStats.unverified}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground">Confidence Levels:</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline">High: {mappingStats.byConfidence.high}</Badge>
                        <Badge variant="outline">Medium: {mappingStats.byConfidence.medium}</Badge>
                        <Badge variant="outline">Low: {mappingStats.byConfidence.low}</Badge>
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Upload Button */}
            <Button
              onClick={handleUploadAndSync}
              disabled={!selectedClient || !selectedFile || isUploading}
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
            <div className="space-y-4">
              {allPriceLists.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No price lists found. Upload a price list for a client to get started.
                  </AlertDescription>
                </Alert>
              ) : (
                allPriceLists.map((priceList) => (
                  <Card key={priceList._id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{priceList.name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Users className="h-3 w-3" />
                            {priceList.clientName}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {priceList.isDefault && (
                            <Badge variant="secondary">Default</Badge>
                          )}
                          {priceList.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="destructive">Inactive</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Source File:</span>
                          <span className="ml-2">{priceList.sourceFileName || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last Synced:</span>
                          <span className="ml-2">
                            {priceList.lastSyncedAt
                              ? format(new Date(priceList.lastSyncedAt), 'MMM dd, yyyy HH:mm')
                              : 'Never'}
                          </span>
                        </div>
                        {priceList.effectiveFrom && (
                          <div>
                            <span className="text-muted-foreground">Effective From:</span>
                            <span className="ml-2">
                              {format(new Date(priceList.effectiveFrom), 'MMM dd, yyyy')}
                            </span>
                          </div>
                        )}
                        {priceList.effectiveTo && (
                          <div>
                            <span className="text-muted-foreground">Effective To:</span>
                            <span className="ml-2">
                              {format(new Date(priceList.effectiveTo), 'MMM dd, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSyncPriceList(priceList._id)}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                        <Button size="sm" variant="outline">
                          <Eye className="mr-2 h-4 w-4" />
                          View Mappings
                        </Button>
                        <Button size="sm" variant="outline">
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};