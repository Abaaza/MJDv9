import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  FileSpreadsheet, 
  Download, 
  Edit, 
  Save, 
  X, 
  Search,
  StopCircle,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Wifi,
  WifiOff,
  Terminal,
  Percent,
  Loader2
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ManualMatchModal } from '../components/ManualMatchModal';
import { DiscountMarkupModal } from '../components/DiscountMarkupModal';
import { useCurrency } from '../hooks/useCurrency';
import { queryKeys, getRefetchInterval } from '../lib/query-config';
import { useDebouncedCallback } from '../hooks/useDebounce';
import { useWebSocket } from '../hooks/useWebSocket';
import { JobLogs } from '../components/JobLogs';
import { JobStatusIndicator } from '../components/JobStatusIndicator';
import { QueuePosition } from '../components/QueuePosition';

interface Job {
  _id: string;
  fileName: string;
  status: string;
  progress: number;
  progressMessage?: string;
  itemCount: number;
  matchedCount: number;
  clientName: string;
  startedAt: number;
  completedAt?: number;
  matchingMethod: string;
  totalValue?: number;
  headers?: string[];
  sheetName?: string;
}

interface MatchResult {
  _id: string;
  jobId: string;
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
  matchMethod: string;
  isManuallyEdited: boolean;
  totalPrice?: number;
  notes?: string;
}

export default function Projects() {
  const { formatPrice } = useCurrency();
  const { connected, jobProgress, jobLogs, subscribeToJob, unsubscribeFromJob } = useWebSocket();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<MatchResult>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<MatchResult | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMatchTypes, setSelectedMatchTypes] = useState<{ [key: string]: 'AI' | 'LOCAL' | 'MANUAL' }>({});
  const [showLogs, setShowLogs] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'discount' | 'markup'>('discount');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [runningLocalTests, setRunningLocalTests] = useState<{ [key: string]: boolean }>({});
  const [localTestResults, setLocalTestResults] = useState<{ [key: string]: any }>({});
  const jobsPerPage = 8;

  // Check URL hash for job ID on mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      setSelectedJobId(hash);
      // Clear the hash
      window.location.hash = '';
    }
  }, []);

  // Fetch all jobs
  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<Job[]>({
    queryKey: queryKeys.jobs,
    queryFn: async () => {
      const response = await api.get('/price-matching/jobs');
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });

  // Subscribe to WebSocket updates for selected job
  useEffect(() => {
    if (selectedJobId) {
      subscribeToJob(selectedJobId);
      return () => {
        unsubscribeFromJob(selectedJobId);
      };
    }
  }, [selectedJobId, subscribeToJob, unsubscribeFromJob]);

  // Fetch job status for selected job
  const { data: jobStatus, refetch: refetchJobStatus } = useQuery({
    queryKey: queryKeys.jobStatus(selectedJobId || ''),
    queryFn: async () => {
      if (!selectedJobId) return null;
      const response = await api.get(`/price-matching/${selectedJobId}/status`);
      return response.data;
    },
    enabled: !!selectedJobId,
    // Disable polling if we have WebSocket connection
    refetchInterval: connected ? false : (data) => getRefetchInterval(data?.status),
    staleTime: 5 * 1000, // 5 seconds for active jobs
  });

  // Merge WebSocket progress with job status
  const currentJobProgress = selectedJobId ? jobProgress[selectedJobId] : null;
  const mergedJobStatus = currentJobProgress ? {
    ...jobStatus,
    ...currentJobProgress,
  } : jobStatus;

  // Get the selected job to access its matching method
  const selectedJob = jobs?.find(job => job._id === selectedJobId);
  const isAIDisabled = selectedJob?.matchingMethod === 'LOCAL' || 
                       selectedJob?.matchingMethod === 'LOCAL_UNIT' || 
                       selectedJob?.matchingMethod === 'ADVANCED';

  // Fetch match results for selected job
  const { data: results, isLoading: resultsLoading, refetch: refetchResults } = useQuery<MatchResult[]>({
    queryKey: queryKeys.matchResults(selectedJobId || ''),
    queryFn: async () => {
      if (!selectedJobId) return [];
      const response = await api.get(`/price-matching/${selectedJobId}/results`);
      return response.data;
    },
    enabled: !!selectedJobId,
    staleTime: 60 * 1000, // 1 minute - results don't change often
  });

  // Delete job mutation
  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/price-matching/${jobId}`);
    },
    onSuccess: () => {
      toast.success('Job deleted successfully');
      refetchJobs();
      if (selectedJobId === deletedJobId) {
        setSelectedJobId(null);
      }
    },
    onError: () => {
      toast.error('Failed to delete job');
    },
  });

  // Update result mutation
  const updateResultMutation = useMutation({
    mutationFn: async ({ resultId, updates }: { resultId: string; updates: Partial<MatchResult> }) => {
      const response = await api.patch(`/price-matching/results/${resultId}`, updates);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Result updated successfully');
      refetchResults();
      setEditingResultId(null);
      setEditValues({});
    },
    onError: () => {
      toast.error('Failed to update result');
    },
  });

  // Debounced autosave mutation
  const autosaveMutation = useMutation({
    mutationFn: async ({ resultId, updates }: { resultId: string; updates: Partial<MatchResult> }) => {
      const response = await api.post(`/price-matching/results/${resultId}/autosave`, updates);
      return response.data;
    },
    onError: (error) => {
      console.error('Autosave failed:', error);
    },
  });

  // Debounced autosave function
  const debouncedAutosave = useDebouncedCallback(
    (resultId: string, updates: Partial<MatchResult>) => {
      if (Object.keys(updates).length > 0) {
        autosaveMutation.mutate({ resultId, updates });
      }
    },
    2000 // 2 second delay
  );

  // Track changes for autosave
  useEffect(() => {
    if (editingResultId && editValues) {
      debouncedAutosave(editingResultId, editValues);
    }
  }, [editValues, editingResultId]);

  // Subscribe to WebSocket updates for selected job
  useEffect(() => {
    if (selectedJobId && connected) {
      subscribeToJob(selectedJobId);
      return () => {
        unsubscribeFromJob(selectedJobId);
      };
    }
  }, [selectedJobId, connected, subscribeToJob, unsubscribeFromJob]);

  // Initialize match types based on results
  useEffect(() => {
    if (results && results.length > 0) {
      const initialTypes: { [key: string]: 'AI' | 'LOCAL' | 'MANUAL' } = {};
      results.forEach((result: MatchResult) => {
        if (result.isManuallyEdited) {
          initialTypes[result._id] = 'MANUAL';
        } else if (result.matchMethod === 'LOCAL' || result.matchMethod === 'LOCAL_UNIT' || result.matchMethod === 'ADVANCED') {
          initialTypes[result._id] = 'LOCAL';
        } else if (isAIDisabled) {
          // If AI is disabled, default to LOCAL instead of AI
          initialTypes[result._id] = 'LOCAL';
        } else {
          initialTypes[result._id] = 'AI';
        }
      });
      setSelectedMatchTypes(initialTypes);
    }
  }, [results, isAIDisabled]);

  // Stop job mutation
  const stopJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/price-matching/${jobId}/stop`);
    },
    onSuccess: () => {
      toast.success('Job stopped');
      refetchJobs();
      refetchJobStatus();
    },
    onError: () => {
      toast.error('Failed to stop job');
    },
  });

  // Re-run local match mutation
  const rerunLocalMatchMutation = useMutation({
    mutationFn: async ({ resultId, jobId }: { resultId: string; jobId: string }) => {
      const response = await api.post(`/price-matching/results/${resultId}/rematch`, {
        method: 'LOCAL',
        jobId: jobId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Local match re-run successfully');
      refetchResults();
    },
    onError: () => {
      toast.error('Failed to re-run local match');
    },
  });

  // Instant local test mutation
  const instantLocalTestMutation = useMutation({
    mutationFn: async ({ resultId, description }: { resultId: string; description: string }) => {
      const response = await api.post(`/price-matching/test/local`, {
        description,
      });
      return response.data;
    },
    onSuccess: (data, variables) => {
      setLocalTestResults(prev => ({ ...prev, [variables.resultId]: data }));
      setRunningLocalTests(prev => ({ ...prev, [variables.resultId]: false }));
    },
    onError: (error, variables) => {
      toast.error('Failed to run local test');
      setRunningLocalTests(prev => ({ ...prev, [variables.resultId]: false }));
    },
  });

  // Re-run AI match mutation
  const rerunAIMatchMutation = useMutation({
    mutationFn: async ({ resultId, jobId, method }: { resultId: string; jobId: string; method: string }) => {
      const response = await api.post(`/price-matching/results/${resultId}/rematch`, {
        method: method,
        jobId: jobId,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('AI match re-run successfully');
      refetchResults();
    },
    onError: () => {
      toast.error('Failed to re-run AI match');
    },
  });

  const handleEdit = (result: MatchResult) => {
    setEditingResultId(result._id);
    setEditValues({
      matchedCode: result.matchedCode,
      matchedUnit: result.matchedUnit,
      matchedRate: result.matchedRate,
      originalQuantity: result.originalQuantity,
      notes: result.notes,
    });
  };

  const handleCancelEdit = () => {
    setEditingResultId(null);
    setEditValues({});
  };

  const handleSaveEdit = async (resultId: string) => {
    const quantity = editValues.originalQuantity || 0;
    const rate = editValues.matchedRate || 0;
    const totalPrice = quantity * rate;
    
    await updateResultMutation.mutateAsync({
      resultId,
      updates: {
        ...editValues,
        totalPrice,
      },
    });
  };

  const [deletedJobId, setDeletedJobId] = useState<string | null>(null);

  const handleDeleteJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      setDeletedJobId(jobId);
      await deleteJobMutation.mutateAsync(jobId);
    }
  };

  const handleStopJob = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to stop this job?')) {
      await stopJobMutation.mutateAsync(jobId);
    }
  };

  const handleOpenModal = (result: MatchResult) => {
    setSelectedResult(result);
    setModalOpen(true);
  };

  const handleModalSave = async (updates: {
    matchedItemId: string;
    matchedDescription: string;
    matchedCode?: string;
    matchedUnit?: string;
    matchedRate: number;
  }) => {
    if (!selectedResult) return;
    
    // Calculate total price
    const totalPrice = (selectedResult.originalQuantity || 0) * updates.matchedRate;
    
    // Remove matchedItemId from updates as backend doesn't expect it
    const { matchedItemId, ...updateData } = updates;
    
    await updateResultMutation.mutateAsync({
      resultId: selectedResult._id,
      updates: {
        ...updateData,
        totalPrice,
        isManuallyEdited: true,
      },
    });
    
    // Update the selected match type to reflect manual selection
    setSelectedMatchTypes(prev => ({ ...prev, [selectedResult._id]: 'MANUAL' }));
    setModalOpen(false);
  };


  const handleDownloadResults = async (jobId: string) => {
    try {
      const response = await api.get(`/price-matching/${jobId}/export`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `matched_results_${jobId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Excel file downloaded successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download results');
    }
  };

  const handleApplyDiscountMarkup = async (type: 'discount' | 'markup', percentage: number) => {
    if (!selectedJobId || !results) return;
    
    try {
      // Apply discount/markup to all results
      const updatePromises = results.map(result => {
        if (result.matchedRate) {
          const adjustment = (result.matchedRate * percentage) / 100;
          const newRate = type === 'discount' 
            ? result.matchedRate - adjustment 
            : result.matchedRate + adjustment;
          
          const newTotalPrice = (result.originalQuantity || 0) * newRate;
          
          return updateResultMutation.mutateAsync({
            resultId: result._id,
            updates: {
              matchedRate: newRate,
              totalPrice: newTotalPrice,
              notes: `${type === 'discount' ? 'Discount' : 'Markup'} of ${percentage}% applied`,
            },
          });
        }
        return Promise.resolve();
      });
      
      await Promise.all(updatePromises);
      toast.success(`${type === 'discount' ? 'Discount' : 'Markup'} of ${percentage}% applied successfully`);
      setShowDiscountModal(false);
      setDiscountValue(0);
    } catch (error) {
      toast.error(`Failed to apply ${type}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  // Separate context headers and actual items
  const contextHeaders = results?.filter(result => 
    result.matchMethod === 'CONTEXT' || !result.originalQuantity || result.originalQuantity === 0
  ) || [];
  
  const actualItems = results?.filter(result => 
    result.matchMethod !== 'CONTEXT' && result.originalQuantity && result.originalQuantity > 0
  ) || [];
  
  const filteredResults = actualItems.filter(result => 
    result.originalDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.matchedDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    result.matchedCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group results by sections based on row numbers
  const groupResultsBySection = () => {
    if (!results || results.length === 0) return [];
    
    const allResultsSorted = [...results].sort((a, b) => a.rowNumber - b.rowNumber);
    const groups: Array<{ header?: typeof results[0], items: typeof results }> = [];
    let currentGroup: typeof groups[0] = { items: [] };
    
    allResultsSorted.forEach((result) => {
      // Check if this is a header/context row
      if (result.matchMethod === 'CONTEXT' || !result.originalQuantity || result.originalQuantity === 0) {
        // If we have items in the current group, push it
        if (currentGroup.items.length > 0) {
          groups.push(currentGroup);
        }
        // Start a new group with this header
        currentGroup = { header: result, items: [] };
      } else {
        // This is a regular item
        currentGroup.items.push(result);
      }
    });
    
    // Don't forget the last group
    if (currentGroup.items.length > 0 || currentGroup.header) {
      groups.push(currentGroup);
    }
    
    return groups;
  };
  
  const groupedResults = groupResultsBySection();

  // Pagination calculations
  const totalPages = Math.ceil((jobs?.length || 0) / jobsPerPage);
  const startIndex = (currentPage - 1) * jobsPerPage;
  const endIndex = startIndex + jobsPerPage;
  const paginatedJobs = jobs?.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Matching Jobs */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CardTitle>Matching Jobs</CardTitle>
            <div className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-full",
              connected ? "text-green-600 bg-green-50" : "text-red-600 bg-red-50"
            )}>
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {connected ? "Live" : "Offline"}
            </div>
          </div>
          {jobs && jobs.length > jobsPerPage && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <p className="text-muted-foreground">Loading jobs...</p>
          ) : paginatedJobs && paginatedJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {paginatedJobs.map((job, index) => (
                <div
                  key={job._id}
                  onClick={() => setSelectedJobId(job._id)}
                  className={cn(
                    'p-4 rounded-lg cursor-pointer transition-colors border',
                    'animate-in fade-in slide-in-from-bottom-2',
                    selectedJobId === job._id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getStatusIcon(job.status)}
                      <h4 className="font-medium text-sm truncate" title={job.fileName}>
                        {job.fileName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(job.status === 'parsing' || job.status === 'matching') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => handleStopJob(job._id, e)}
                          disabled={stopJobMutation.isPending}
                          className="h-8 w-8 p-0"
                        >
                          <StopCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => handleDeleteJob(job._id, e)}
                        disabled={deleteJobMutation.isPending}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <p className="text-xs text-muted-foreground mb-1 truncate">
                    {job.clientName}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    {format(new Date(job.startedAt), 'MMM d, h:mm a')}
                  </p>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Progress</span>
                      <span>
                        {jobProgress[job._id]?.matchedCount || job.matchedCount}/
                        {jobProgress[job._id]?.itemCount || job.itemCount}
                      </span>
                    </div>
                    {(job.status === 'parsing' || job.status === 'matching' || jobProgress[job._id]) && (
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${jobProgress[job._id]?.progress || job.progress}%` }}
                        />
                      </div>
                    )}
                    {jobProgress[job._id]?.progressMessage && (
                      <p className="text-xs text-muted-foreground truncate">
                        {jobProgress[job._id].progressMessage}
                      </p>
                    )}
                    {(job.status === 'pending' || job.status === 'queued') && (
                      <QueuePosition 
                        jobId={job._id}
                        status={job.status}
                        createdAt={job.startedAt}
                      />
                    )}
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between">
                    <JobStatusIndicator 
                      status={jobProgress[job._id]?.status || job.status}
                      progress={jobProgress[job._id]?.progress || job.progress}
                      progressMessage={jobProgress[job._id]?.progressMessage}
                      showLabel={true}
                      className="scale-90"
                    />
                    <span className="text-xs text-muted-foreground">
                      {job.matchingMethod}
                    </span>
                  </div>
                  
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No matching jobs found</p>
          )}
        </CardContent>
      </Card>

      {/* Match Results */}
      {selectedJobId && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle>Match Results</CardTitle>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                {jobStatus?.status === 'completed' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadResults(selectedJobId)}
                      className="w-full sm:w-auto"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export Excel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowDiscountModal(true)}
                      className="w-full sm:w-auto"
                    >
                      <Percent className="h-4 w-4 mr-2" />
                      Apply Discount/Markup
                    </Button>
                  </>
                )}
                <div className="relative w-full sm:w-64">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search results..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
            {mergedJobStatus && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span>Status: {mergedJobStatus.status}</span>
                  <span>Progress: {mergedJobStatus.matchedCount}/{mergedJobStatus.itemCount}</span>
                  {mergedJobStatus.totalValue && (
                    <span>Total Value: {formatPrice(mergedJobStatus.totalValue)}</span>
                  )}
                </div>
                {mergedJobStatus.progressMessage && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="animate-pulse flex-shrink-0">
                      <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    </div>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {mergedJobStatus.progressMessage}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {resultsLoading ? (
              <p className="text-muted-foreground">Loading results...</p>
            ) : (results && results.length > 0) ? (
              <>
                {/* Match Results Summary */}
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">
                    Match Results ({actualItems.length} items, {contextHeaders.length} sections)
                  </h4>
                  <div className="text-sm text-gray-500">
                    Total Sections: {groupedResults.length}
                  </div>
                </div>
                
                {/* Match Results Section */}
                {groupedResults.length > 0 ? (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium text-sm">Row</th>
                      <th className="text-left p-2 font-medium text-sm min-w-[300px]">Original Description</th>
                      <th className="text-left p-2 font-medium text-sm min-w-[300px]">Matched Item</th>
                      <th className="text-left p-2 font-medium text-sm">Excel Unit</th>
                      <th className="text-left p-2 font-medium text-sm">Price List Unit</th>
                      <th className="text-left p-2 font-medium text-sm">Rate</th>
                      <th className="text-left p-2 font-medium text-sm">Quantity</th>
                      <th className="text-left p-2 font-medium text-sm">Total</th>
                      <th className="text-left p-2 font-medium text-sm">Confidence</th>
                      <th className="text-left p-2 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedResults.map((group, groupIndex) => (
                      <React.Fragment key={`group-${groupIndex}`}>
                        {/* Section Header Row */}
                        {group.header && (
                          <tr className="bg-gray-100 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                            <td className="p-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                              {group.header.rowNumber}
                            </td>
                            <td colSpan={9} className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-0.5 w-8 bg-gray-300 dark:bg-gray-600"></div>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                                  {group.header.originalDescription}
                                </span>
                                <div className="flex-1 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* Item Rows */}
                        {group.items.filter(item => 
                          searchTerm === '' || 
                          item.originalDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.matchedDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.matchedCode?.toLowerCase().includes(searchTerm.toLowerCase())
                        ).map((result) => (
                      <tr key={result._id} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-sm">{result.rowNumber}</td>
                        <td className="p-2 text-sm">
                          <div className="whitespace-normal break-words max-w-md">
                            {/* Context headers removed - now shown as section dividers */}
                            {result.originalDescription}
                          </div>
                        </td>
                        <td className="p-2 text-sm">
                          <div className="space-y-2">
                            {/* Match Type Radio Buttons */}
                            <div className="flex gap-3 mb-2">
                              <label className={cn(
                                "flex items-center gap-1",
                                isAIDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                              )}>
                                <input
                                  type="radio"
                                  name={`match-type-${result._id}`}
                                  value="AI"
                                  checked={selectedMatchTypes[result._id] === 'AI'}
                                  onChange={() => {
                                    if (!isAIDisabled && selectedJobId) {
                                      const previousType = selectedMatchTypes[result._id];
                                      setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'AI' }));
                                      
                                      // Clear local test results when switching back to AI
                                      if (previousType === 'LOCAL' && localTestResults[result._id]) {
                                        setLocalTestResults(prev => {
                                          const newResults = { ...prev };
                                          delete newResults[result._id];
                                          return newResults;
                                        });
                                      }
                                      
                                      // Get the original matching method from the job
                                      const job = jobs?.find(j => j._id === selectedJobId);
                                      const method = job?.matchingMethod || 'HYBRID';
                                      rerunAIMatchMutation.mutate({ 
                                        resultId: result._id, 
                                        jobId: selectedJobId,
                                        method: method
                                      });
                                    }
                                  }}
                                  disabled={isAIDisabled}
                                  className="text-blue-600"
                                />
                                <span className={cn("text-xs", isAIDisabled && "text-gray-400")}>
                                  AI Match {isAIDisabled && "(Disabled)"}
                                </span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`match-type-${result._id}`}
                                  value="LOCAL"
                                  checked={selectedMatchTypes[result._id] === 'LOCAL'}
                                  onChange={() => {
                                    if (selectedJobId) {
                                      const previousType = selectedMatchTypes[result._id];
                                      setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'LOCAL' }));
                                      
                                      // If switching from AI to LOCAL, run instant test
                                      if (previousType === 'AI' && !isAIDisabled) {
                                        setRunningLocalTests(prev => ({ ...prev, [result._id]: true }));
                                        instantLocalTestMutation.mutate({
                                          resultId: result._id,
                                          description: result.originalDescription
                                        });
                                      } else {
                                        // Otherwise run normal local match
                                        rerunLocalMatchMutation.mutate({ 
                                          resultId: result._id, 
                                          jobId: selectedJobId 
                                        });
                                      }
                                    }
                                  }}
                                  className="text-green-600"
                                />
                                <span className="text-xs">Local</span>
                                {runningLocalTests[result._id] && (
                                  <Loader2 className="h-3 w-3 animate-spin text-green-600" />
                                )}
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`match-type-${result._id}`}
                                  value="MANUAL"
                                  checked={selectedMatchTypes[result._id] === 'MANUAL'}
                                  onChange={() => {
                                    setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'MANUAL' }));
                                    handleOpenModal(result);
                                  }}
                                  className="text-purple-600"
                                />
                                <span className="text-xs">Manual</span>
                              </label>
                            </div>
                            
                            {/* Matched Item Display */}
                            <div className={cn(
                              "rounded-lg transition-all",
                              result.matchedDescription 
                                ? "bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-3 border"
                                : "bg-gray-50 dark:bg-gray-800 p-3 border-2 border-dashed",
                              result.isManuallyEdited && "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-500"
                            )}>
                              {result.matchedDescription ? (
                                <div className="space-y-1">
                                  <p className="font-medium text-sm">{result.matchedDescription}</p>
                                  {result.matchedCode && (
                                    <p className="text-xs text-muted-foreground">Code: {result.matchedCode}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground italic">No match selected</p>
                              )}
                            </div>
                            
                            {/* Local Test Results Preview */}
                            {localTestResults[result._id] && selectedMatchTypes[result._id] === 'LOCAL' && (
                              <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-medium text-green-700 dark:text-green-300">
                                    Local Test Results
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      const testResult = localTestResults[result._id];
                                      if (testResult && selectedJobId) {
                                        // Apply the local test result
                                        rerunLocalMatchMutation.mutate({
                                          resultId: result._id,
                                          jobId: selectedJobId
                                        });
                                        // Clear test results
                                        setLocalTestResults(prev => {
                                          const newResults = { ...prev };
                                          delete newResults[result._id];
                                          return newResults;
                                        });
                                      }
                                    }}
                                  >
                                    Apply Match
                                  </Button>
                                </div>
                                {localTestResults[result._id].matches && localTestResults[result._id].matches.length > 0 ? (
                                  <div className="space-y-1">
                                    <div className="text-xs">
                                      <p className="font-medium">{localTestResults[result._id].matches[0].description}</p>
                                      {localTestResults[result._id].matches[0].code && (
                                        <p className="text-muted-foreground">Code: {localTestResults[result._id].matches[0].code}</p>
                                      )}
                                      <p className="text-muted-foreground">
                                        Confidence: {(localTestResults[result._id].matches[0].confidence * 100).toFixed(0)}%
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">No local matches found</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2 text-sm">
                          {result.originalUnit || '-'}
                        </td>
                        <td className="p-2 text-sm">
                          {editingResultId === result._id ? (
                            <Input
                              value={editValues.matchedUnit || ''}
                              onChange={(e) => setEditValues({ ...editValues, matchedUnit: e.target.value })}
                              className="h-8 w-16"
                            />
                          ) : (
                            result.matchedUnit || '-'
                          )}
                        </td>
                        <td className="p-2 text-sm">
                          {editingResultId === result._id ? (
                            <Input
                              type="number"
                              value={editValues.matchedRate || ''}
                              onChange={(e) => setEditValues({ ...editValues, matchedRate: parseFloat(e.target.value) })}
                              className="h-8 w-20"
                            />
                          ) : (
                            result.matchedRate ? formatPrice(result.matchedRate) : '-'
                          )}
                        </td>
                        <td className="p-2 text-sm">
                          {editingResultId === result._id ? (
                            <Input
                              type="number"
                              value={editValues.originalQuantity || ''}
                              onChange={(e) => {
                                const newQuantity = parseFloat(e.target.value) || 0;
                                setEditValues({ ...editValues, originalQuantity: newQuantity });
                              }}
                              className="h-8 w-20"
                            />
                          ) : (
                            result.originalQuantity || '-'
                          )}
                        </td>
                        <td className="p-2 text-sm font-medium">
                          {editingResultId === result._id ? (
                            formatPrice((editValues.originalQuantity || 0) * (editValues.matchedRate || 0))
                          ) : (
                            result.totalPrice ? formatPrice(result.totalPrice) : '-'
                          )}
                        </td>
                        <td className="p-2 text-sm">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            getConfidenceColor(result.confidence)
                          )}>
                            {(result.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            {editingResultId === result._id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSaveEdit(result._id)}
                                  disabled={updateResultMutation.isPending}
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(result)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (window.confirm('Are you sure you want to delete this match result?')) {
                                      // TODO: Implement delete functionality
                                      toast.error('Delete functionality not yet implemented');
                                    }
                                  }}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="lg:hidden space-y-6">
                  {groupedResults.map((group, groupIndex) => (
                    <div key={`mobile-group-${groupIndex}`} className="space-y-4">
                      {/* Section Header */}
                      {group.header && (
                        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg border-l-4 border-gray-400 dark:border-gray-600">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Row {group.header.rowNumber}</span>
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase">
                              {group.header.originalDescription}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Item Cards */}
                      {group.items.filter(item => 
                        searchTerm === '' || 
                        item.originalDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.matchedDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.matchedCode?.toLowerCase().includes(searchTerm.toLowerCase())
                      ).map((result) => (
                    <div key={result._id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">Row {result.rowNumber}</span>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-xs font-medium",
                              getConfidenceColor(result.confidence)
                            )}>
                              {(result.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            {/* Context headers removed - now shown as section dividers */}
                            <p className="text-sm font-medium">{result.originalDescription}</p>
                          </div>
                        </div>
                      </div>

                      {/* Match Type Radio Buttons */}
                      <div className="flex gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <label className={cn(
                          "flex items-center gap-1",
                          isAIDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                        )}>
                          <input
                            type="radio"
                            name={`match-type-mobile-${result._id}`}
                            value="AI"
                            checked={(selectedMatchTypes[result._id] || 'AI') === 'AI'}
                            onChange={() => {
                              if (!isAIDisabled) {
                                setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'AI' }));
                                toast.info('AI matching will be implemented');
                              }
                            }}
                            disabled={isAIDisabled}
                            className="text-blue-600"
                          />
                          <span className={cn("text-xs", isAIDisabled && "text-gray-400")}>
                            AI Match {isAIDisabled && "(Disabled)"}
                          </span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`match-type-mobile-${result._id}`}
                            value="LOCAL"
                            checked={selectedMatchTypes[result._id] === 'LOCAL'}
                            onChange={() => {
                              setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'LOCAL' }));
                              toast.info('Local matching will be implemented');
                            }}
                            className="text-green-600"
                          />
                          <span className="text-xs">Local</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`match-type-mobile-${result._id}`}
                            value="MANUAL"
                            checked={selectedMatchTypes[result._id] === 'MANUAL' || result.isManuallyEdited}
                            onChange={() => {
                              setSelectedMatchTypes(prev => ({ ...prev, [result._id]: 'MANUAL' }));
                              handleOpenModal(result);
                            }}
                            className="text-purple-600"
                          />
                          <span className="text-xs">Manual</span>
                        </label>
                      </div>

                      {/* Matched Item Display - Mobile */}
                      <div className={cn(
                        "rounded-lg transition-all",
                        result.matchedDescription 
                          ? "bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 p-3 border"
                          : "bg-gray-50 dark:bg-gray-800 p-3 border-2 border-dashed",
                        result.isManuallyEdited && "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-500"
                      )}>
                        <p className="text-xs text-muted-foreground mb-1">Matched Item</p>
                        {result.matchedDescription ? (
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{result.matchedDescription}</p>
                            {result.matchedCode && (
                              <p className="text-xs text-muted-foreground">Code: {result.matchedCode}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">No match selected</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Excel Unit:</span>
                          <p className="font-medium">{result.originalUnit || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Price List Unit:</span>
                          <p className="font-medium">{result.matchedUnit || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Quantity:</span>
                          {editingResultId === result._id ? (
                            <Input
                              type="number"
                              value={editValues.originalQuantity || ''}
                              onChange={(e) => {
                                const newQuantity = parseFloat(e.target.value) || 0;
                                setEditValues({ ...editValues, originalQuantity: newQuantity });
                              }}
                              className="h-8 w-full mt-1"
                            />
                          ) : (
                            <p className="font-medium">{result.originalQuantity || '-'}</p>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Rate:</span>
                          <p className="font-medium">
                            {result.matchedRate ? formatPrice(result.matchedRate) : '-'}
                          </p>
                        </div>
                      </div>

                      <div className="border-t pt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total:</span>
                          <span className="font-bold text-lg">
                            {editingResultId === result._id ? (
                              formatPrice((editValues.originalQuantity || 0) * (editValues.matchedRate || result.matchedRate || 0))
                            ) : (
                              result.totalPrice ? formatPrice(result.totalPrice) : '-'
                            )}
                          </span>
                        </div>
                      </div>

                      {result.notes && (
                        <div className="border-t pt-3">
                          <p className="text-xs text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm">{result.notes}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        {editingResultId === result._id ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleSaveEdit(result._id)}
                              disabled={updateResultMutation.isPending}
                            >
                              <Save className="h-4 w-4 mr-2" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={handleCancelEdit}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleEdit(result)}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this match result?')) {
                                  toast.error('Delete functionality not yet implemented');
                                }
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                      ))}
                    </div>
                  ))}
                </div>
                
                {/* Total Quotation Sum */}
                {actualItems.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Total Quotation:</span>
                      <span className="text-xl font-bold text-green-600 dark:text-green-400">
                        {formatPrice(actualItems.reduce((sum, result) => sum + (result.totalPrice || 0), 0))}
                      </span>
                    </div>
                  </div>
                )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No items with quantities found</p>
                    <p className="text-sm text-muted-foreground mt-2">Only header sections were found in this document</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                {selectedJobId ? 'No results found' : 'Select a job to view results'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Job Processing Logs */}
      {selectedJobId && (jobLogs[selectedJobId]?.length > 0 || 
        (mergedJobStatus && ['parsing', 'matching', 'queued'].includes(mergedJobStatus.status))) && (
        <JobLogs 
          logs={jobLogs[selectedJobId] || []} 
          title={`Processing Logs - ${jobs?.find(j => j._id === selectedJobId)?.fileName || 'Job'}`}
          className="animate-in fade-in slide-in-from-bottom-3"
          jobStatus={mergedJobStatus?.status}
          startTime={jobs?.find(j => j._id === selectedJobId)?.startedAt}
        />
      )}

      {/* Manual Match Modal */}
      {selectedResult && (
        <ManualMatchModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          result={selectedResult}
          onSave={handleModalSave}
        />
      )}
      
      {/* Discount/Markup Modal */}
      {filteredResults && (
        <DiscountMarkupModal
          isOpen={showDiscountModal}
          onClose={() => setShowDiscountModal(false)}
          currentTotal={filteredResults.reduce((sum, result) => sum + (result.totalPrice || 0), 0)}
          onApply={handleApplyDiscountMarkup}
        />
      )}

    </div>
  );
}