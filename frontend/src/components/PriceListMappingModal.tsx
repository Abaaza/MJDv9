import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Link,
  Unlink,
  Search,
  RefreshCw,
  Settings,
  Eye,
  Edit,
  Check,
  X,
  ArrowUpDown,
  FileText,
  Table as TableIcon,
} from 'lucide-react';
import axios from 'axios';
import { useToast } from '@/hooks/use-toast';

interface PriceListMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  priceListId?: string;
  clientId?: string;
}

interface ExcelMapping {
  _id: string;
  priceListId: string;
  priceItemId: string;
  fileName: string;
  sheetName: string;
  rowNumber: number;
  codeColumn?: string;
  descriptionColumn?: string;
  unitColumn?: string;
  rateColumn?: string;
  originalCode?: string;
  originalDescription?: string;
  originalUnit?: string;
  originalRate?: any;
  mappingConfidence: number;
  mappingMethod: string;
  isVerified?: boolean;
  priceItem?: {
    _id: string;
    code?: string;
    description: string;
    unit?: string;
    rate: number;
  };
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

export const PriceListMappingModal: React.FC<PriceListMappingModalProps> = ({
  isOpen,
  onClose,
  priceListId,
  clientId,
}) => {
  const convex = useConvex();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSheet, setSelectedSheet] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [editingMapping, setEditingMapping] = useState<string | null>(null);
  const [selectedPriceItem, setSelectedPriceItem] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch mappings
  const { data: mappings, isLoading: loadingMappings, refetch: refetchMappings } = useQuery({
    queryKey: ['excel-mappings', priceListId],
    queryFn: async () => {
      if (!priceListId) return [];
      const result = await convex.query(api.excelMappings.getByPriceList, {
        priceListId: priceListId as any,
      });
      return result as ExcelMapping[];
    },
    enabled: !!priceListId,
  });

  // Fetch mapping statistics
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['mapping-stats', priceListId],
    queryFn: async () => {
      if (!priceListId) return null;
      const result = await convex.query(api.excelMappings.getMappingStats, {
        priceListId: priceListId as any,
      });
      return result as MappingStats;
    },
    enabled: !!priceListId,
  });

  // Fetch all price items for mapping selection
  const { data: priceItems } = useQuery({
    queryKey: ['price-items'],
    queryFn: async () => {
      const result = await convex.query(api.priceItems.getAll);
      return result;
    },
  });

  // Filter mappings based on search and filters
  const filteredMappings = React.useMemo(() => {
    if (!mappings) return [];
    
    let filtered = [...mappings];
    
    // Sheet filter
    if (selectedSheet !== 'all') {
      filtered = filtered.filter(m => m.sheetName === selectedSheet);
    }
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.originalDescription?.toLowerCase().includes(search) ||
        m.originalCode?.toLowerCase().includes(search) ||
        m.priceItem?.description.toLowerCase().includes(search) ||
        m.priceItem?.code?.toLowerCase().includes(search)
      );
    }
    
    // Confidence filter
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(m => {
        if (confidenceFilter === 'high') return m.mappingConfidence >= 0.8;
        if (confidenceFilter === 'medium') return m.mappingConfidence >= 0.5 && m.mappingConfidence < 0.8;
        if (confidenceFilter === 'low') return m.mappingConfidence < 0.5;
        return true;
      });
    }
    
    // Verified filter
    if (verifiedFilter !== 'all') {
      filtered = filtered.filter(m => 
        verifiedFilter === 'verified' ? m.isVerified : !m.isVerified
      );
    }
    
    return filtered;
  }, [mappings, selectedSheet, searchTerm, confidenceFilter, verifiedFilter]);

  // Handle file upload for remapping
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !priceListId) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('priceListId', priceListId);
    formData.append('createNew', 'false');
    
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/client-price-lists/upload-sync`,
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
          description: `Mapped ${response.data.mappingResults.mappedItems} items successfully`,
        });
        refetchMappings();
        refetchStats();
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
    }
  };

  // Verify a mapping
  const verifyMapping = async (mappingId: string, isVerified: boolean, newPriceItemId?: string) => {
    try {
      await convex.mutation(api.excelMappings.verifyMapping, {
        mappingId: mappingId as any,
        isVerified,
        newPriceItemId: newPriceItemId as any,
      });
      
      toast({
        title: 'Success',
        description: 'Mapping updated successfully',
      });
      
      refetchMappings();
      refetchStats();
      setEditingMapping(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update mapping',
        variant: 'destructive',
      });
    }
  };

  // Sync rates from Excel
  const syncRatesFromExcel = async () => {
    if (!priceListId) return;
    
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/client-price-lists/${priceListId}/sync-rates`,
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

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) {
      return <Badge className="bg-green-500">High</Badge>;
    } else if (confidence >= 0.5) {
      return <Badge className="bg-yellow-500">Medium</Badge>;
    } else {
      return <Badge className="bg-red-500">Low</Badge>;
    }
  };

  const getMethodBadge = (method: string) => {
    const methodColors: Record<string, string> = {
      code: 'bg-blue-500',
      description: 'bg-purple-500',
      fuzzy: 'bg-orange-500',
      manual: 'bg-green-500',
    };
    
    return (
      <Badge className={methodColors[method] || 'bg-gray-500'}>
        {method}
      </Badge>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Price List Mapping Manager</DialogTitle>
          <DialogDescription>
            Manage cell-to-item mappings between Excel spreadsheet and price list database
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mappings">Mappings</TabsTrigger>
            <TabsTrigger value="unverified">Review</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {stats && (
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Mappings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.total}</div>
                    <Progress value={(stats.verified / stats.total) * 100} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.verified} verified, {stats.unverified} pending
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Confidence Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>High ({stats.byConfidence.high})</span>
                        <Progress value={(stats.byConfidence.high / stats.total) * 100} className="w-24" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Medium ({stats.byConfidence.medium})</span>
                        <Progress value={(stats.byConfidence.medium / stats.total) * 100} className="w-24" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Low ({stats.byConfidence.low})</span>
                        <Progress value={(stats.byConfidence.low / stats.total) * 100} className="w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Mapping Methods</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {Object.entries(stats.byMethod).map(([method, count]) => (
                        <div key={method} className="flex justify-between text-sm">
                          <span className="capitalize">{method}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Sheet Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(stats.bySheet).map(([sheet, count]) => (
                      <div key={sheet} className="flex justify-between text-sm p-2 border rounded">
                        <span className="truncate">{sheet}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="mappings" className="mt-4">
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Search mappings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
                <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All sheets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sheets</SelectItem>
                    {stats && Object.keys(stats.bySheet).map(sheet => (
                      <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter as any}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Confidence" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={verifiedFilter} onValueChange={setVerifiedFilter as any}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Mappings Table */}
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Excel Cell</TableHead>
                      <TableHead>Original Description</TableHead>
                      <TableHead>Mapped To</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMappings.map((mapping) => (
                      <TableRow key={mapping._id}>
                        <TableCell className="font-mono text-xs">
                          {mapping.sheetName}!{mapping.rateColumn}{mapping.rowNumber}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          <div>
                            {mapping.originalCode && (
                              <span className="font-mono text-xs mr-2">{mapping.originalCode}</span>
                            )}
                            <span className="text-sm">{mapping.originalDescription}</span>
                          </div>
                          {mapping.originalUnit && (
                            <span className="text-xs text-muted-foreground ml-2">({mapping.originalUnit})</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {editingMapping === mapping._id ? (
                            <Select
                              value={selectedPriceItem}
                              onValueChange={setSelectedPriceItem}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
                                {priceItems?.map(item => (
                                  <SelectItem key={item._id} value={item._id}>
                                    {item.code} - {item.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div>
                              {mapping.priceItem?.code && (
                                <span className="font-mono text-xs mr-2">{mapping.priceItem.code}</span>
                              )}
                              <span className="text-sm">{mapping.priceItem?.description}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>Excel: {mapping.originalRate}</div>
                            <div>DB: {mapping.priceItem?.rate}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getConfidenceBadge(mapping.mappingConfidence)}</TableCell>
                        <TableCell>{getMethodBadge(mapping.mappingMethod)}</TableCell>
                        <TableCell>
                          {mapping.isVerified ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingMapping === mapping._id ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => verifyMapping(mapping._id, true, selectedPriceItem || undefined)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingMapping(null)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingMapping(mapping._id);
                                  setSelectedPriceItem(mapping.priceItemId);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!mapping.isVerified && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => verifyMapping(mapping._id, true)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="unverified" className="mt-4">
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Review and verify low-confidence mappings to ensure accurate price synchronization.
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[450px]">
                {filteredMappings
                  .filter(m => !m.isVerified)
                  .sort((a, b) => a.mappingConfidence - b.mappingConfidence)
                  .slice(0, 20)
                  .map((mapping) => (
                    <Card key={mapping._id} className="mb-4">
                      <CardContent className="pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs">Excel Data</Label>
                            <div className="mt-1 p-2 bg-muted rounded">
                              <div className="font-mono text-xs">
                                {mapping.sheetName}!{mapping.rateColumn}{mapping.rowNumber}
                              </div>
                              <div className="text-sm mt-1">
                                {mapping.originalCode && <span className="font-mono mr-2">{mapping.originalCode}</span>}
                                {mapping.originalDescription}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Unit: {mapping.originalUnit || 'N/A'} | Rate: {mapping.originalRate}
                              </div>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Current Mapping</Label>
                            <div className="mt-1 p-2 bg-muted rounded">
                              <div className="text-sm">
                                {mapping.priceItem?.code && <span className="font-mono mr-2">{mapping.priceItem.code}</span>}
                                {mapping.priceItem?.description || 'No match'}
                              </div>
                              {mapping.priceItem && (
                                <div className="text-xs text-muted-foreground">
                                  Unit: {mapping.priceItem.unit || 'N/A'} | Rate: {mapping.priceItem.rate}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <div className="flex gap-2">
                            {getConfidenceBadge(mapping.mappingConfidence)}
                            {getMethodBadge(mapping.mappingMethod)}
                          </div>
                          <div className="flex gap-2">
                            <Select
                              value={mapping.priceItemId}
                              onValueChange={(value) => verifyMapping(mapping._id, true, value)}
                            >
                              <SelectTrigger className="w-64">
                                <SelectValue placeholder="Change mapping" />
                              </SelectTrigger>
                              <SelectContent>
                                {priceItems?.map(item => (
                                  <SelectItem key={item._id} value={item._id}>
                                    {item.code} - {item.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              onClick={() => verifyMapping(mapping._id, true)}
                            >
                              Verify Current
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => verifyMapping(mapping._id, false)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="sync" className="mt-4">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Upload New Spreadsheet</CardTitle>
                  <CardDescription>
                    Upload the updated MJD-PRICELIST.xlsx to re-map and sync prices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                      <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/50" />
                      <Label htmlFor="file-upload" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium">
                          Click to upload Excel file
                        </span>
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
                    
                    {isUploading && (
                      <div className="space-y-2">
                        <Progress value={uploadProgress} />
                        <p className="text-sm text-center text-muted-foreground">
                          Uploading and processing... {uploadProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sync Operations</CardTitle>
                  <CardDescription>
                    Synchronize rates between Excel and database
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded">
                      <div>
                        <h4 className="font-medium">Pull from Excel</h4>
                        <p className="text-sm text-muted-foreground">
                          Update database rates with values from Excel spreadsheet
                        </p>
                      </div>
                      <Button onClick={syncRatesFromExcel}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync from Excel
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 border rounded">
                      <div>
                        <h4 className="font-medium">Push to Excel</h4>
                        <p className="text-sm text-muted-foreground">
                          Generate updated Excel with current database rates
                        </p>
                      </div>
                      <Button variant="outline">
                        <Upload className="h-4 w-4 mr-2" />
                        Export to Excel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};