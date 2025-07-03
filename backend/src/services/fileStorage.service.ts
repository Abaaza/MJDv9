import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class FileStorageService {
  private static instance: FileStorageService;
  private storageDir: string;

  private constructor() {
    // Use a temporary directory for file storage
    this.storageDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'temp_uploads');
  }

  static getInstance(): FileStorageService {
    if (!FileStorageService.instance) {
      FileStorageService.instance = new FileStorageService();
    }
    return FileStorageService.instance;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
      console.log(`[FileStorage] Storage directory created at: ${this.storageDir}`);
    } catch (error) {
      console.error('[FileStorage] Failed to create storage directory:', error);
    }
  }

  async saveFile(buffer: Buffer, originalName: string): Promise<string> {
    const fileId = uuidv4();
    const extension = path.extname(originalName);
    const fileName = `${fileId}${extension}`;
    const filePath = path.join(this.storageDir, fileName);

    try {
      await fs.writeFile(filePath, buffer);
      console.log(`[FileStorage] File saved: ${fileName}`);
      return fileId;
    } catch (error) {
      console.error('[FileStorage] Failed to save file:', error);
      throw new Error('Failed to save file');
    }
  }

  async getFile(fileId: string): Promise<Buffer | null> {
    try {
      // Find file with this ID
      const files = await fs.readdir(this.storageDir);
      const matchingFile = files.find(f => f.startsWith(fileId));
      
      if (!matchingFile) {
        console.log(`[FileStorage] File not found: ${fileId}`);
        return null;
      }

      const filePath = path.join(this.storageDir, matchingFile);
      const buffer = await fs.readFile(filePath);
      console.log(`[FileStorage] File retrieved: ${matchingFile}`);
      return buffer;
    } catch (error) {
      console.error('[FileStorage] Failed to get file:', error);
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const matchingFile = files.find(f => f.startsWith(fileId));
      
      if (matchingFile) {
        const filePath = path.join(this.storageDir, matchingFile);
        await fs.unlink(filePath);
        console.log(`[FileStorage] File deleted: ${matchingFile}`);
      }
    } catch (error) {
      console.error('[FileStorage] Failed to delete file:', error);
    }
  }

  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const now = Date.now();
      const maxAge = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.storageDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          console.log(`[FileStorage] Cleaned up old file: ${file}`);
        }
      }
    } catch (error) {
      console.error('[FileStorage] Cleanup failed:', error);
    }
  }
}

export const fileStorage = FileStorageService.getInstance();