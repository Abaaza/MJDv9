import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { put, head, del, list } from '@vercel/blob';

export class FileStorageService {
  private static instance: FileStorageService;
  private storageDir: string;
  private useVercelBlob: boolean;

  private constructor() {
    // Use Vercel Blob in production, local storage in development
    this.useVercelBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
    this.storageDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'temp_uploads');
  }

  static getInstance(): FileStorageService {
    if (!FileStorageService.instance) {
      FileStorageService.instance = new FileStorageService();
    }
    return FileStorageService.instance;
  }

  async initialize(): Promise<void> {
    if (!this.useVercelBlob) {
      try {
        await fs.mkdir(this.storageDir, { recursive: true });
        console.log(`[FileStorage] Storage directory created at: ${this.storageDir}`);
      } catch (error) {
        console.error('[FileStorage] Failed to create storage directory:', error);
      }
    } else {
      console.log('[FileStorage] Using Vercel Blob storage');
    }
  }

  async saveFile(buffer: Buffer, originalName: string): Promise<string> {
    const fileId = uuidv4();
    const extension = path.extname(originalName);
    const fileName = `${fileId}${extension}`;

    try {
      if (this.useVercelBlob) {
        // Use Vercel Blob
        const blob = await put(fileName, buffer, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        console.log(`[FileStorage] File saved to Vercel Blob: ${blob.url}`);
        return fileId;
      } else {
        // Use local file system
        const filePath = path.join(this.storageDir, fileName);
        await fs.writeFile(filePath, buffer);
        console.log(`[FileStorage] File saved locally: ${fileName}`);
        return fileId;
      }
    } catch (error) {
      console.error('[FileStorage] Failed to save file:', error);
      throw new Error('Failed to save file');
    }
  }

  async getFile(fileId: string): Promise<Buffer | null> {
    try {
      if (this.useVercelBlob) {
        // Use Vercel Blob
        const { blobs } = await list({
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
      } else {
        // Use local file system
        const files = await fs.readdir(this.storageDir);
        const matchingFile = files.find(f => f.startsWith(fileId));
        
        if (!matchingFile) {
          console.log(`[FileStorage] File not found locally: ${fileId}`);
          return null;
        }

        const filePath = path.join(this.storageDir, matchingFile);
        const buffer = await fs.readFile(filePath);
        console.log(`[FileStorage] File retrieved locally: ${matchingFile}`);
        return buffer;
      }
    } catch (error) {
      console.error('[FileStorage] Failed to get file:', error);
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      if (this.useVercelBlob) {
        // Use Vercel Blob
        const { blobs } = await list({
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        
        const blob = blobs.find(b => b.pathname.startsWith(fileId));
        if (blob) {
          await del(blob.url, {
            token: process.env.BLOB_READ_WRITE_TOKEN,
          });
          console.log(`[FileStorage] File deleted from Vercel Blob: ${blob.pathname}`);
        }
      } else {
        // Use local file system
        const files = await fs.readdir(this.storageDir);
        const matchingFile = files.find(f => f.startsWith(fileId));
        
        if (matchingFile) {
          const filePath = path.join(this.storageDir, matchingFile);
          await fs.unlink(filePath);
          console.log(`[FileStorage] File deleted locally: ${matchingFile}`);
        }
      }
    } catch (error) {
      console.error('[FileStorage] Failed to delete file:', error);
    }
  }

  async cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    try {
      if (this.useVercelBlob) {
        // Vercel Blob cleanup
        const { blobs } = await list({
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        
        const now = Date.now();
        const maxAge = maxAgeHours * 60 * 60 * 1000;

        for (const blob of blobs) {
          const uploadedAt = new Date(blob.uploadedAt).getTime();
          if (now - uploadedAt > maxAge) {
            await del(blob.url, {
              token: process.env.BLOB_READ_WRITE_TOKEN,
            });
            console.log(`[FileStorage] Cleaned up old blob: ${blob.pathname}`);
          }
        }
      } else {
        // Local file system cleanup
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
      }
    } catch (error) {
      console.error('[FileStorage] Cleanup failed:', error);
    }
  }
}

export const fileStorage = FileStorageService.getInstance();