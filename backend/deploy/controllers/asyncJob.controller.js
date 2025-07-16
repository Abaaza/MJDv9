import { ConvexClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
// AWS SDK types for development only
let lambda;
if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // In Lambda environment, use the provided AWS SDK
    const AWS = require('aws-sdk');
    lambda = new AWS.Lambda();
}
else {
    // Mock for local development
    lambda = {
        invoke: () => ({ promise: () => Promise.resolve() })
    };
}
const convex = new ConvexClient(process.env.CONVEX_URL || '');
export class AsyncJobController {
    // Submit job for async processing
    async submitJob(req, res) {
        try {
            const { items, matchingMethod = 'HYBRID' } = req.body;
            const userId = req.user?.id;
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Items array is required' });
            }
            // Create job in database
            const jobId = await convex.mutation(api.aiMatchingJobs.createJob, {
                userId,
                status: 'pending',
                itemCount: items.length,
                matchingMethod,
                progress: 0,
                processedCount: 0,
                results: []
            });
            // Store items for the job
            await convex.mutation(api.aiMatchingJobs.storeJobItems, {
                jobId,
                items
            });
            // Invoke Lambda asynchronously
            const params = {
                FunctionName: process.env.LAMBDA_FUNCTION_NAME || 'boq-matching-system-prod-processJob',
                InvocationType: 'Event', // Async invocation
                Payload: JSON.stringify({ jobId })
            };
            await lambda.invoke(params).promise();
            // Return job ID immediately
            res.status(202).json({
                jobId,
                status: 'pending',
                message: 'Job submitted for processing',
                statusUrl: `/api/jobs/${jobId}/status`
            });
        }
        catch (error) {
            console.error('Error submitting job:', error);
            res.status(500).json({ error: 'Failed to submit job' });
        }
    }
    // Check job status
    async getJobStatus(req, res) {
        try {
            const { jobId } = req.params;
            const job = await convex.query(api.aiMatchingJobs.getJob, { jobId });
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            res.json({
                jobId,
                status: job.status,
                progress: job.progress,
                processedCount: job.processedCount,
                totalItems: job.itemCount,
                error: job.error,
                downloadUrl: job.status === 'completed' ? `/api/jobs/${jobId}/download` : null
            });
        }
        catch (error) {
            console.error('Error getting job status:', error);
            res.status(500).json({ error: 'Failed to get job status' });
        }
    }
    // Download job results
    async downloadResults(req, res) {
        try {
            const { jobId } = req.params;
            const job = await convex.query(api.aiMatchingJobs.getJob, { jobId });
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            if (job.status !== 'completed') {
                return res.status(400).json({ error: 'Job not completed yet' });
            }
            // Get results from database
            const results = await convex.query(api.aiMatchingJobs.getJobResults, { jobId });
            // Generate Excel file or return JSON
            res.json({ results });
        }
        catch (error) {
            console.error('Error downloading results:', error);
            res.status(500).json({ error: 'Failed to download results' });
        }
    }
}
//# sourceMappingURL=asyncJob.controller.js.map