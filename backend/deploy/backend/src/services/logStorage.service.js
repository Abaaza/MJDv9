"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStorage = void 0;
class LogStorageService {
    constructor() {
        this.logs = new Map();
        this.jobProgress = new Map();
        this.maxLogsPerJob = 1000;
        this.logRetentionMs = 60 * 60 * 1000; // 1 hour
    }
    addLog(jobId, level, message) {
        if (!this.logs.has(jobId)) {
            this.logs.set(jobId, []);
        }
        const logs = this.logs.get(jobId);
        const log = {
            jobId,
            level,
            message,
            timestamp: new Date().toISOString()
        };
        logs.push(log);
        // Keep only the last N logs
        if (logs.length > this.maxLogsPerJob) {
            logs.shift();
        }
        // Log to console for debugging
        const icons = {
            info: 'â„¹ï¸',
            success: 'âœ…',
            warning: 'âš ï¸',
            error: 'âŒ'
        };
        console.log(`[Job ${jobId}] ${icons[level]}  ${message}`);
    }
    getLogs(jobId) {
        return this.logs.get(jobId) || [];
    }
    updateProgress(jobId, updates) {
        const current = this.jobProgress.get(jobId) || {
            jobId,
            status: 'pending',
            progress: 0,
            progressMessage: '',
            matchedCount: 0,
            itemCount: 0,
            startTime: Date.now()
        };
        this.jobProgress.set(jobId, {
            ...current,
            ...updates
        });
    }
    getProgress(jobId) {
        return this.jobProgress.get(jobId) || null;
    }
    clearJob(jobId) {
        this.logs.delete(jobId);
        this.jobProgress.delete(jobId);
    }
    // Clean up old logs periodically
    cleanupOldLogs() {
        const now = Date.now();
        for (const [jobId, progress] of this.jobProgress.entries()) {
            if (now - progress.startTime > this.logRetentionMs) {
                this.clearJob(jobId);
            }
        }
    }
}
// Create singleton instance
exports.logStorage = new LogStorageService();
// Clean up old logs every 30 minutes
setInterval(() => {
    exports.logStorage.cleanupOldLogs();
}, 30 * 60 * 1000);
