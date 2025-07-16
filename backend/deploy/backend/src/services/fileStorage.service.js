"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileStorage = exports.FileStorageService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const blob_1 = require("@vercel/blob");
class FileStorageService {
    constructor() {
        // Use Vercel Blob in production, local storage in development
        this.useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
        this.storageDir = process.env.UPLOAD_DIR || path_1.default.join(process.cwd(), 'temp_uploads');
    }
    static getInstance() {
        if (!FileStorageService.instance) {
            FileStorageService.instance = new FileStorageService();
        }
        return FileStorageService.instance;
    }
    async initialize() {
        if (!this.useVercelBlob) {
            try {
                await promises_1.default.mkdir(this.storageDir, { recursive: true });
                console.log(`[FileStorage] Storage directory created at: ${this.storageDir}`);
            }
            catch (error) {
                console.error('[FileStorage] Failed to create storage directory:', error);
            }
        }
        else {
            console.log('[FileStorage] Using Vercel Blob storage');
        }
    }
    async saveFile(buffer, originalName) {
        const fileId = (0, uuid_1.v4)();
        const extension = path_1.default.extname(originalName);
        const fileName = `${fileId}${extension}`;
        try {
            if (this.useVercelBlob) {
                // Use Vercel Blob
                const blob = await (0, blob_1.put)(fileName, buffer, {
                    access: 'public',
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                console.log(`[FileStorage] File saved to Vercel Blob: ${blob.url}`);
                return fileId;
            }
            else {
                // Use local file system
                const filePath = path_1.default.join(this.storageDir, fileName);
                await promises_1.default.writeFile(filePath, buffer);
                console.log(`[FileStorage] File saved locally: ${fileName}`);
                return fileId;
            }
        }
        catch (error) {
            console.error('[FileStorage] Failed to save file:', error);
            throw new Error('Failed to save file');
        }
    }
    async getFile(fileId) {
        try {
            if (this.useVercelBlob) {
                // Use Vercel Blob
                const { blobs } = await (0, blob_1.list)({
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                const blob = blobs.find(b => b.pathname.startsWith(fileId));
                if (!blob) {
                    console.log(`[FileStorage] File not found in Vercel Blob: ${fileId}`);
                    return null;
                }
                const response = await fetch(blob.url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                console.log(`[FileStorage] File retrieved from Vercel Blob: ${blob.pathname}`);
                return buffer;
            }
            else {
                // Use local file system
                const files = await promises_1.default.readdir(this.storageDir);
                const matchingFile = files.find(f => f.startsWith(fileId));
                if (!matchingFile) {
                    console.log(`[FileStorage] File not found locally: ${fileId}`);
                    return null;
                }
                const filePath = path_1.default.join(this.storageDir, matchingFile);
                const buffer = await promises_1.default.readFile(filePath);
                console.log(`[FileStorage] File retrieved locally: ${matchingFile}`);
                return buffer;
            }
        }
        catch (error) {
            console.error('[FileStorage] Failed to get file:', error);
            return null;
        }
    }
    async deleteFile(fileId) {
        try {
            if (this.useVercelBlob) {
                // Use Vercel Blob
                const { blobs } = await (0, blob_1.list)({
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                const blob = blobs.find(b => b.pathname.startsWith(fileId));
                if (blob) {
                    await (0, blob_1.del)(blob.url, {
                        token: process.env.BLOB_READ_WRITE_TOKEN,
                    });
                    console.log(`[FileStorage] File deleted from Vercel Blob: ${blob.pathname}`);
                }
            }
            else {
                // Use local file system
                const files = await promises_1.default.readdir(this.storageDir);
                const matchingFile = files.find(f => f.startsWith(fileId));
                if (matchingFile) {
                    const filePath = path_1.default.join(this.storageDir, matchingFile);
                    await promises_1.default.unlink(filePath);
                    console.log(`[FileStorage] File deleted locally: ${matchingFile}`);
                }
            }
        }
        catch (error) {
            console.error('[FileStorage] Failed to delete file:', error);
        }
    }
    async cleanupOldFiles(maxAgeHours = 24) {
        try {
            if (this.useVercelBlob) {
                // Vercel Blob cleanup
                const { blobs } = await (0, blob_1.list)({
                    token: process.env.BLOB_READ_WRITE_TOKEN,
                });
                const now = Date.now();
                const maxAge = maxAgeHours * 60 * 60 * 1000;
                for (const blob of blobs) {
                    const uploadedAt = new Date(blob.uploadedAt).getTime();
                    if (now - uploadedAt > maxAge) {
                        await (0, blob_1.del)(blob.url, {
                            token: process.env.BLOB_READ_WRITE_TOKEN,
                        });
                        console.log(`[FileStorage] Cleaned up old blob: ${blob.pathname}`);
                    }
                }
            }
            else {
                // Local file system cleanup
                const files = await promises_1.default.readdir(this.storageDir);
                const now = Date.now();
                const maxAge = maxAgeHours * 60 * 60 * 1000;
                for (const file of files) {
                    const filePath = path_1.default.join(this.storageDir, file);
                    const stats = await promises_1.default.stat(filePath);
                    if (now - stats.mtimeMs > maxAge) {
                        await promises_1.default.unlink(filePath);
                        console.log(`[FileStorage] Cleaned up old file: ${file}`);
                    }
                }
            }
        }
        catch (error) {
            console.error('[FileStorage] Cleanup failed:', error);
        }
    }
}
exports.FileStorageService = FileStorageService;
exports.fileStorage = FileStorageService.getInstance();
