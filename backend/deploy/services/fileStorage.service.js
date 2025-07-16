import { s3Storage } from './s3Storage.service';
export class FileStorageService {
    static instance;
    constructor() {
        // S3Storage handles all the configuration internally
    }
    static getInstance() {
        if (!FileStorageService.instance) {
            FileStorageService.instance = new FileStorageService();
        }
        return FileStorageService.instance;
    }
    async initialize() {
        // Initialize S3 storage
        await s3Storage.initialize();
    }
    async saveFile(buffer, originalName) {
        return await s3Storage.saveFile(buffer, originalName);
    }
    async getFile(fileId) {
        return await s3Storage.getFile(fileId);
    }
    async deleteFile(fileId) {
        await s3Storage.deleteFile(fileId);
    }
    async fileExists(fileId) {
        try {
            await s3Storage.getFile(fileId);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async getFileUrl(fileId) {
        // Get a signed URL for S3 files
        return await s3Storage.getSignedUrl(fileId);
    }
    async cleanupOldFiles(daysOld = 7) {
        // This would need to be implemented in S3Storage service
        console.log(`[FileStorage] Cleanup not implemented for S3 yet`);
    }
}
// Export singleton instance
export const fileStorage = FileStorageService.getInstance();
//# sourceMappingURL=fileStorage.service.js.map