"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.debugLog = exports.DebugLogger = void 0;
class DebugLogger {
    constructor() {
        this.enabled = true;
        this.enabled = process.env.DEBUG_MATCHING === 'true' || process.env.NODE_ENV === 'development';
    }
    static getInstance() {
        if (!DebugLogger.instance) {
            DebugLogger.instance = new DebugLogger();
        }
        return DebugLogger.instance;
    }
    log(context, message, data) {
        if (!this.enabled)
            return;
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ${message}`;
        console.log('\x1b[36m%s\x1b[0m', logMessage);
        if (data) {
            console.log('\x1b[90m%s\x1b[0m', JSON.stringify(data, null, 2));
        }
    }
    error(context, message, error) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] ERROR: ${message}`;
        console.error('\x1b[31m%s\x1b[0m', logMessage);
        if (error) {
            console.error('\x1b[31m%s\x1b[0m', error.stack || error);
        }
    }
    success(context, message, data) {
        if (!this.enabled)
            return;
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] âœ“ ${message}`;
        console.log('\x1b[32m%s\x1b[0m', logMessage);
        if (data) {
            console.log('\x1b[90m%s\x1b[0m', JSON.stringify(data, null, 2));
        }
    }
    warning(context, message, data) {
        if (!this.enabled)
            return;
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${context}] âš  ${message}`;
        console.log('\x1b[33m%s\x1b[0m', logMessage);
        if (data) {
            console.log('\x1b[90m%s\x1b[0m', JSON.stringify(data, null, 2));
        }
    }
    startTimer(context, operation) {
        const startTime = Date.now();
        this.log(context, `Starting ${operation}...`);
        return () => {
            const duration = Date.now() - startTime;
            this.success(context, `${operation} completed in ${duration}ms`);
        };
    }
}
exports.DebugLogger = DebugLogger;
exports.debugLog = DebugLogger.getInstance();
