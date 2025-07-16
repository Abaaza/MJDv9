export class PerformanceMonitor {
    static timers = new Map();
    static start(label) {
        this.timers.set(label, Date.now());
    }
    static end(label, warnThresholdMs) {
        const startTime = this.timers.get(label);
        if (!startTime) {
            console.warn(`No timer found for label: ${label}`);
            return 0;
        }
        const duration = Date.now() - startTime;
        this.timers.delete(label);
        if (warnThresholdMs && duration > warnThresholdMs) {
            console.warn(`âš ï¸  Performance warning: ${label} took ${duration}ms (threshold: ${warnThresholdMs}ms)`);
        }
        return duration;
    }
    static async measure(label, fn, warnThresholdMs) {
        this.start(label);
        try {
            const result = await fn();
            const duration = this.end(label, warnThresholdMs);
            console.log(`â±ï¸  ${label}: ${duration}ms`);
            return result;
        }
        catch (error) {
            this.end(label);
            throw error;
        }
    }
}
//# sourceMappingURL=performance.js.map