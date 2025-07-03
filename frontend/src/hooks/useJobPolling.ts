import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';

interface JobProgress {
  jobId: string;
  status: string;
  progress: number;
  progressMessage: string;
  matchedCount: number;
  itemCount: number;
}

interface JobLog {
  timestamp: number;
  level: 'info' | 'error' | 'warning';
  message: string;
}

interface JobStatus {
  jobId: string;
  status: 'pending' | 'parsing' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  progressMessage: string;
  itemCount: number;
  matchedCount: number;
  startTime: number;
  lastUpdate: number;
  errors: string[];
  logs: JobLog[];
}

export function useJobPolling() {
  const [connected, setConnected] = useState(true); // Always "connected" for polling
  const [jobProgress, setJobProgress] = useState<Record<string, JobProgress>>({});
  const [jobLogs, setJobLogs] = useState<Record<string, JobLog[]>>({});
  const activePolls = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastStatusRef = useRef<Map<string, string>>(new Map());

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const response = await api.get(`/jobs/${jobId}/status`);
      const status: JobStatus = response.data;
      
      // Update progress
      setJobProgress(prev => ({
        ...prev,
        [jobId]: {
          jobId: status.jobId,
          status: status.status,
          progress: status.progress,
          progressMessage: status.progressMessage,
          matchedCount: status.matchedCount,
          itemCount: status.itemCount,
        }
      }));
      
      // Update logs
      if (status.logs && status.logs.length > 0) {
        setJobLogs(prev => ({
          ...prev,
          [jobId]: status.logs.slice(-100) // Keep last 100 logs
        }));
      }
      
      // Check for status changes
      const previousStatus = lastStatusRef.current.get(jobId);
      if (previousStatus !== status.status) {
        lastStatusRef.current.set(jobId, status.status);
        
        // Show notifications for status changes
        if (status.status === 'completed') {
          toast.success(`Job completed! Matched ${status.matchedCount} of ${status.itemCount} items`);
          // Stop polling after completion
          stopPolling(jobId);
          // Remove from progress after delay
          setTimeout(() => {
            setJobProgress(prev => {
              const { [jobId]: _, ...rest } = prev;
              return rest;
            });
          }, 5000);
        } else if (status.status === 'failed') {
          toast.error(`Job failed: ${status.errors?.[0] || 'Unknown error'}`);
          stopPolling(jobId);
          // Remove from progress
          setJobProgress(prev => {
            const { [jobId]: _, ...rest } = prev;
            return rest;
          });
        } else if (status.status === 'cancelled') {
          toast('Job cancelled');
          stopPolling(jobId);
          // Remove from progress
          setJobProgress(prev => {
            const { [jobId]: _, ...rest } = prev;
            return rest;
          });
        }
      }
      
      // Continue polling if job is still running
      if (status.status === 'pending' || status.status === 'parsing' || status.status === 'processing') {
        return true; // Continue polling
      }
      
      return false; // Stop polling
      
    } catch (error) {
      console.error('Error polling job status:', error);
      return true; // Continue polling on error
    }
  }, []);

  // Stop polling for a specific job
  const stopPolling = useCallback((jobId: string) => {
    const timeout = activePolls.current.get(jobId);
    if (timeout) {
      clearInterval(timeout);
      activePolls.current.delete(jobId);
      lastStatusRef.current.delete(jobId);
    }
  }, []);

  // Subscribe to job updates (start polling)
  const subscribeToJob = useCallback((jobId: string) => {
    console.log('Starting polling for job:', jobId);
    
    // Stop any existing polling for this job
    stopPolling(jobId);
    
    // Initial poll
    pollJobStatus(jobId);
    
    // Set up interval polling (every 2 seconds)
    const interval = setInterval(async () => {
      const shouldContinue = await pollJobStatus(jobId);
      if (!shouldContinue) {
        stopPolling(jobId);
      }
    }, 2000);
    
    activePolls.current.set(jobId, interval);
  }, [pollJobStatus, stopPolling]);

  // Unsubscribe from job updates (stop polling)
  const unsubscribeFromJob = useCallback((jobId: string) => {
    console.log('Stopping polling for job:', jobId);
    stopPolling(jobId);
  }, [stopPolling]);

  // Clear logs for a job
  const clearJobLogs = useCallback((jobId: string) => {
    setJobLogs(prev => {
      const { [jobId]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop all active polls
      activePolls.current.forEach((timeout) => {
        clearInterval(timeout);
      });
      activePolls.current.clear();
      lastStatusRef.current.clear();
    };
  }, []);

  // Mock processor status (not needed for serverless)
  const processorStatus = null;
  const requestProcessorStatus = useCallback(() => {
    // No-op for polling system
  }, []);

  return {
    connected,
    jobProgress,
    jobLogs,
    processorStatus,
    subscribeToJob,
    unsubscribeFromJob,
    requestProcessorStatus,
    clearJobLogs,
  };
}