import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { PriceListMappingModal } from '../components/PriceListMappingModal';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings,
  RefreshCw,
  Download,
  Plus,
  Edit,
  MapPin,
  Database,
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface Client {
  _id: string;
  name: string;
  code: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
}

interface PriceList {
  _id: string;
  clientId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  effectiveFrom?: number;
  effectiveTo?: number;
  sourceFileName?: string;
  sourceFileUrl?: string;
  lastSyncedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export const ClientPriceListManager: React.FC = () => {
  const convex = useConvex();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedPriceList, setSelectedPriceList] = useState<string>('');
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch all clients
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/clients`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      return response.data as Client[];
    },
  });

  // Fetch price lists for selected client
  const { data: priceLists, isLoading: loadingPriceLists, refetch: refetchPriceLists } = useQuery({
    queryKey: ['client-price-lists', selectedClient],
    queryFn: async () => {
      if (!selectedClient) return [];
      const result = await convex.query(api.clientPriceLists.getByClient, {
        clientId: selectedClient as any,
      });
      return result as PriceList[];
    },
    enabled: !!selectedClient,
  });

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedClient) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientId', selectedClient);
    formData.append('createNew', 'true');
    formData.append('priceListName', `${file.name} - ${new Date().toLocaleDateString()}`);
    
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/client-prices/price-lists/upload-sync`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setUploadProgress(percentCompleted);
          },
        }
      );
      
      if (response.data.success) {
        toast({
          title: 'Success',
          description: `Created price list with ${response.data.mappingResults.mappedItems} mapped items`,
        });
        setSelectedPriceList(response.data.priceListId);
        refetchPriceLists();
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to upload and sync file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset file input
      event.target.value = '';
    }
  };

  // Sync rates from Excel
  const syncRatesFromExcel = async (priceListId: string) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/client-prices/price-lists/${priceListId}/sync-rates`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
        }
      );
      
      if (response.data.success) {
        toast({
          title: 'Success',
          description: `Updated ${response.data.updatedCount} rates from Excel`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to sync rates',
        variant: 'destructive',
      });
    }
  };

  // Export to Excel
  const exportToExcel = async (priceListId: string) => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL}/client-prices/price-lists/${priceListId}/export`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          responseType: 'blob',
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MJD-PRICELIST-${new Date().toISOString()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast({
        title: 'Success',
        description: 'Excel file downloaded successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to export to Excel',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Client Price List Manager</h1>
          <p className="text-muted-foreground mt-1">
            Manage client-specific price lists and Excel mappings
          </p>
        </div>
      </div>

      {/* Client Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
          <CardDescription>
            Choose a client to manage their price lists
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="client-select">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger id="client-select">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client._id} value={client._id}>
                      {client.name} ({client.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedClient && (
              <div className="flex gap-2">
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <Button variant="outline" asChild>
                    <span>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload MJD-PRICELIST.xlsx
                    </span>
                  </Button>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                </Label>
              </div>
            )}
          </div>

          {isUploading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Uploading and processing...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price Lists */}
      {selectedClient && (
        <Card>
          <CardHeader>
            <CardTitle>Price Lists</CardTitle>
            <CardDescription>
              Manage price lists and their Excel mappings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingPriceLists ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : priceLists && priceLists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Source File</th>
                      <th className="text-left p-2">Last Synced</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceLists.map((priceList) => (
                      <tr key={priceList._id} className="border-b">
                        <td className="p-2 font-medium">
                          {priceList.name}
                          {priceList.isDefault && (
                            <Badge className="ml-2" variant="secondary">
                              Default
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">{priceList.description || '-'}</td>
                        <td className="p-2">
                          <Badge
                            variant={priceList.isActive ? 'default' : 'secondary'}
                          >
                            {priceList.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {priceList.sourceFileName || 'No file'}
                        </td>
                        <td className="p-2">
                          {priceList.lastSyncedAt
                            ? new Date(priceList.lastSyncedAt).toLocaleString()
                            : 'Never'}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPriceList(priceList._id);
                                setIsMappingModalOpen(true);
                              }}
                            >
                              <MapPin className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => syncRatesFromExcel(priceList._id)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => exportToExcel(priceList._id)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No price lists found. Upload an Excel file to create one.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mapping Modal */}
      {selectedPriceList && (
        <PriceListMappingModal
          isOpen={isMappingModalOpen}
          onClose={() => setIsMappingModalOpen(false)}
          priceListId={selectedPriceList}
          clientId={selectedClient}
        />
      )}
    </div>
  );
};