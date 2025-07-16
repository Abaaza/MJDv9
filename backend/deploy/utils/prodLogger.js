// Production-safe logger wrapper
const isDevelopment = process.env.NODE_ENV === 'development';
export const logger = {
    info: (...args) => {
        if (isDevelopment) {
            console.log('[INFO]', ...args);
        }
    },
    warn: (...args) => {
        if (isDevelopment) {
            console.warn('[WARN]', ...args);
        }
    },
    error: (...args) => {
        // Always log errors
        console.error('[ERROR]', ...args);
    },
    debug: (...args) => {
        if (isDevelopment) {
            console.log('[DEBUG]', ...args);
        }
    }
};
// Replace console.log globally in production
if (!isDevelopment) {
    console.log = () => { };
    console.debug = () => { };
    console.info = () => { };
}
//# sourceMappingURL=prodLogger.js.map