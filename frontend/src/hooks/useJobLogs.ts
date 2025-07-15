import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../lib/api';

interface JobLog {
  timestamp: number;
  level: 'info' | 'error' | 'warning';
  message: string;
}

interface LogCache {
  logs: JobLog[];
  lastFetch: number;
  lastTimestamp: number;
}

const LOG_CACHE_DURATION = 10000; // Cache logs for 10 seconds
const LOG_POLL_INTERVAL = 5000; // Poll every 5 seconds for logs
const MAX_LOGS_PER_JOB = 100; // Keep only last 100 logs

export function useJobLogs() {
  const [jobLogs, setJobLogs] = useState<Record<string, JobLog[]>>({});
  const logCache = useRef<Map<string, LogCache>>(new Map());
  const activePolls = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Fetch logs for a specific job
  const fetchJobLogs = useCallback(async (jobId: string): Promise<JobLog[]> => {
    const now = Date.now();
    const cached = logCache.current.get(jobId);
    
    // Return cached logs if still fresh
    if (cached && (now - cached.lastFetch) < LOG_CACHE_DURATION) {
      return cached.logs;
    }

    try {
      // Only fetch new logs since last timestamp
      const lastTimestamp = cached?.lastTimestamp || 0;
      const response = await api.get(`/jobs/${jobId}/logs`, {
        params: { since: lastTimestamp }
      });
      
      const newLogs: JobLog[] = response.data.logs || [];
      
      // Merge with existing logs
      const existingLogs = cached?.logs || [];
      const mergedLogs = [...existingLogs, ...newLogs]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-MAX_LOGS_PER_JOB); // Keep only last 100
      
      // Update cache
      logCache.current.set(jobId, {
        logs: mergedLogs,
        lastFetch: now,
        lastTimestamp: mergedLogs.length > 0 
          ? mergedLogs[mergedLogs.length - 1].timestamp 
          : lastTimestamp
      });
      
      return mergedLogs;
    } catch (error) {
      console.error('[JobLogs] Error fetching logs:', error);
      return cached?.logs || [];
    }
  }, []);

  // Subscribe to logs for a job
  const subscribeToJobLogs = useCallback((jobId: string) => {
    // Stop any existing polling
    const existingPoll = activePolls.current.get(jobId);
    if (existingPoll) {
      clearInterval(existingPoll);
    }

    // Initial fetch
    fetchJobLogs(jobId).then(logs => {
      setJobLogs(prev => ({ ...prev, [jobId]: logs }));
    });

    // Set up polling
    const interval = setInterval(async () => {
      const logs = await fetchJobLogs(jobId);
      setJobLogs(prev => ({ ...prev, [jobId]: logs }));
    }, LOG_POLL_INTERVAL);

    activePolls.current.set(jobId, interval);
  }, [fetchJobLogs]);

  // Unsubscribe from logs
  const unsubscribeFromJobLogs = useCallback((jobId: string) => {
    const poll = activePolls.current.get(jobId);
    if (poll) {
      clearInterval(poll);
      activePolls.current.delete(jobId);
    }
    
    // Keep logs in state but clear cache
    logCache.current.delete(jobId);
  }, []);

  // Clear logs for a job
  const clearJobLogs = useCallback((jobId: string) => {
    setJobLogs(prev => {
      const { [jobId]: _, ...rest } = prev;
      return rest;
    });
    logCache.current.delete(jobId);
    unsubscribeFromJobLogs(jobId);
  }, [unsubscribeFromJobLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activePolls.current.forEach(interval => clearInterval(interval));
      activePolls.current.clear();
      logCache.current.clear();
    };
  }, []);

  return {
    jobLogs,
    subscribeToJobLogs,
    unsubscribeFromJobLogs,
    clearJobLogs,
  };
}