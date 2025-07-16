"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// Import the Express app configuration
let app;
// Lazy load the server to avoid initialization issues
async function getApp() {
    if (!app) {
        // Dynamically import server to ensure proper initialization
        const serverModule = await Promise.resolve().then(() => __importStar(require('./server.js')));
        app = serverModule.app || serverModule.default;
    }
    return app;
}
// Lambda handler function
const handler = async (event, context) => {
    var _a, _b;
    console.log('Lambda handler invoked', {
        path: event.path || event.rawPath,
        method: event.httpMethod || ((_b = (_a = event.requestContext) === null || _a === void 0 ? void 0 : _a.http) === null || _b === void 0 ? void 0 : _b.method),
        headers: event.headers
    });
    // Get the Express app
    const expressApp = await getApp();
    // Convert Lambda event to Express request/response
    return new Promise((resolve, reject) => {
        var _a, _b, _c, _d, _e;
        // Create mock request
        const req = {
            method: event.httpMethod || ((_b = (_a = event.requestContext) === null || _a === void 0 ? void 0 : _a.http) === null || _b === void 0 ? void 0 : _b.method) || 'GET',
            url: event.path || event.rawPath || '/',
            headers: event.headers || {},
            body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : undefined,
            query: event.queryStringParameters || {},
            ip: ((_d = (_c = event.requestContext) === null || _c === void 0 ? void 0 : _c.identity) === null || _d === void 0 ? void 0 : _d.sourceIp) || '127.0.0.1'
        };
        // Parse JSON body if needed
        if (((_e = req.headers['content-type']) === null || _e === void 0 ? void 0 : _e.includes('application/json')) && typeof req.body === 'string') {
            try {
                req.body = JSON.parse(req.body);
            }
            catch (e) {
                console.error('Failed to parse JSON body:', e);
            }
        }
        // Create mock response
        let statusCode = 200;
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Credentials': 'true'
        };
        let body = '';
        const res = {
            status: (code) => {
                statusCode = code;
                return res;
            },
            set: (key, value) => {
                headers[key] = value;
                return res;
            },
            setHeader: (key, value) => {
                headers[key] = value;
                return res;
            },
            json: (data) => {
                headers['Content-Type'] = 'application/json';
                body = JSON.stringify(data);
                resolve({
                    statusCode,
                    headers,
                    body
                });
            },
            send: (data) => {
                if (typeof data === 'object') {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify(data);
                }
                else {
                    body = String(data);
                }
                resolve({
                    statusCode,
                    headers,
                    body
                });
            },
            end: () => {
                resolve({
                    statusCode,
                    headers,
                    body
                });
            }
        };
        // Handle OPTIONS requests
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        // Process request through Express
        try {
            // @ts-ignore - Express typing issues
            expressApp(req, res, (err) => {
                if (err) {
                    console.error('Express error:', err);
                    resolve({
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ error: 'Internal server error' })
                    });
                }
            });
        }
        catch (error) {
            console.error('Handler error:', error);
            resolve({
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Internal server error' })
            });
        }
    });
};
exports.handler = handler;
