"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchingLogger = exports.excelLogger = exports.projectLogger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logDir = process.env.LOG_DIR || 'logs';
// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};
// Define log colors
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};
// Tell winston about the colors
winston_1.default.addColors(colors);
// Define format
const format = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`));
// Define transports
const transports = [
    // Console transport
    new winston_1.default.transports.Console({
        format,
    }),
    // Error log file
    new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'error.log'),
        level: 'error',
        format: winston_1.default.format.combine(winston_1.default.format.uncolorize(), winston_1.default.format.json()),
    }),
    // Combined log file
    new winston_1.default.transports.File({
        filename: path_1.default.join(logDir, 'combined.log'),
        format: winston_1.default.format.combine(winston_1.default.format.uncolorize(), winston_1.default.format.json()),
    }),
];
// Create logger
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    transports,
});
// Create specialized loggers
exports.projectLogger = logger.child({ service: 'projects' });
exports.excelLogger = logger.child({ service: 'excel' });
exports.matchingLogger = logger.child({ service: 'matching' });
exports.default = logger;
