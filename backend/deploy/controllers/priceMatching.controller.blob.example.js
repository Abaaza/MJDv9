// Example of how to modify your Express controller to use Blob storage
import { BlobStorageService } from '../services/blobStorage.service.js';
// In uploadAndMatch function:
export async function uploadAndMatchWithBlob(req, res) {
    try {
        // ... existing validation code ...
        const buffer = req.file.buffer;
        const blobStorage = BlobStorageService.getInstance();
        // Upload to Blob storage instead of local
        const { url: blobUrl, fileId } = await blobStorage.uploadBOQFile(req.user.id, req.file.originalname, buffer);
        // Create job with blob URL
        const jobId = await convex.mutation(api.priceMatching.createJob, {
            // ... other fields ...
            originalFileUrl: blobUrl, // Store blob URL instead of local file ID
        });
        // ... rest of the function ...
    }
    catch (error) {
        // ... error handling ...
    }
}
// In exportResults function:
export async function exportResultsWithBlob(req, res) {
    try {
        const { jobId } = req.params;
        // ... validation code ...
        // Get job with blob URL
        const job = await convex.query(api.priceMatching.getJob, { jobId });
        // Download original file from Blob
        const blobStorage = BlobStorageService.getInstance();
        let originalBuffer;
        if (job.originalFileUrl) {
            originalBuffer = await blobStorage.downloadFile(job.originalFileUrl);
        }
        else {
            // Fallback to local storage if no blob URL
            const originalFile = await fileStorage.getFile(job.originalFileId);
            originalBuffer = originalFile || Buffer.alloc(0);
        }
        // Generate Excel with results
        const exportBuffer = await excelService.exportMatchResults(originalBuffer, results, {
            matchingMethod: job.matchingMethod,
            matchedCount: job.matchedCount,
            itemCount: job.itemCount,
        });
        // Optionally store result in Blob for permanent access
        if (process.env.STORE_RESULTS_IN_BLOB === 'true') {
            const resultUrl = await blobStorage.uploadResultFile(jobId, exportBuffer, job.fileName);
            // Update job with result URL
            await convex.mutation(api.priceMatching.updateJobResultUrl, {
                jobId,
                resultFileUrl: resultUrl,
            });
        }
        // Send file to client
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="matched_${job.fileName}"`);
        res.send(exportBuffer);
    }
    catch (error) {
        console.error('Export results error:', error);
        res.status(500).json({ error: 'Failed to export results' });
    }
}
//# sourceMappingURL=priceMatching.controller.blob.example.js.map