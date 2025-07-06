# Vercel Deployment Guide

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install with `npm i -g vercel`
3. **Convex Account**: Already set up
4. **Environment Variables**: Have all API keys ready

## Deployment Steps

### 1. Install Dependencies

```bash
npm install
npm run install:all
```

### 2. Set Up Vercel Project

```bash
vercel
```

Follow the prompts:
- Link to existing project or create new
- Select the project directory
- Override settings if needed

### 3. Configure Environment Variables

Go to your Vercel dashboard > Project Settings > Environment Variables and add:

```env
# Convex Database
CONVEX_URL=https://your-instance.convex.cloud

# AI Services
COHERE_API_KEY=your-cohere-api-key
OPENAI_API_KEY=your-openai-api-key

# Authentication
JWT_SECRET=your-jwt-secret-min-32-chars

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your-blob-token
```

To get the Blob token:
1. Go to Vercel Dashboard > Storage
2. Create a new Blob store
3. Copy the read-write token

### 4. Deploy Convex Functions

```bash
npm run build:convex
```

### 5. Deploy to Vercel

```bash
vercel --prod
```

## Project Structure for Vercel

```
boq-matching-system/
├── api/                    # Serverless functions
│   ├── auth/              # Auth endpoints
│   ├── price-matching/    # Price matching endpoints
│   ├── price-list/        # Price list endpoints
│   ├── projects/          # Project endpoints
│   ├── admin/             # Admin endpoints
│   └── _utils/            # Shared utilities
├── frontend/              # React app
│   ├── dist/             # Built files (generated)
│   └── src/              # Source files
├── backend/              # Shared backend logic
│   └── src/
│       ├── services/     # Business logic
│       └── types/        # TypeScript types
├── convex/               # Convex functions
└── vercel.json          # Vercel configuration
```

## API Endpoints

All backend endpoints are now serverless functions:

- `/api/auth/login` - User login
- `/api/auth/register` - User registration
- `/api/auth/refresh` - Token refresh
- `/api/price-matching/upload` - Upload BOQ file
- `/api/price-matching/status/[jobId]` - Check job status
- `/api/price-matching/download/[jobId]` - Download results
- `/api/price-list/*` - Price list management
- `/api/projects/*` - Project management
- `/api/admin/*` - Admin functions

## File Storage with Vercel Blob

Files are stored in Vercel Blob storage:
- Uploaded BOQ files: `/boq-files/{userId}/{timestamp}-{filename}`
- Result files: `/results/{jobId}/matched-results.xlsx`

## Processing Jobs

Job processing is handled differently in serverless:

1. **Upload**: Creates job and stores in Convex
2. **Processing**: Can be triggered by:
   - Cron job (Vercel cron)
   - Queue service (e.g., Upstash QStash)
   - Manual trigger via API

### Setting Up Cron Job

Create `vercel.json` cron configuration:

```json
{
  "crons": [{
    "path": "/api/cron/process-jobs",
    "schedule": "*/1 * * * *"
  }]
}
```

### Using Upstash QStash (Recommended)

1. Sign up at [upstash.com](https://upstash.com)
2. Create a QStash instance
3. Update job creation to publish to queue:

```typescript
// In upload handler
await qstash.publishJSON({
  url: `${process.env.VERCEL_URL}/api/price-matching/process-job`,
  body: { jobId },
  retries: 3,
  delay: 2, // seconds
});
```

## Performance Considerations

1. **Function Size**: Keep under 50MB (compressed)
2. **Execution Time**: Max 30 seconds per function
3. **Memory**: Default 1024MB, can increase if needed
4. **Cold Starts**: First request may be slower

## Monitoring

1. **Vercel Dashboard**: Monitor function logs
2. **Convex Dashboard**: Monitor database operations
3. **Error Tracking**: Consider adding Sentry

## Troubleshooting

### Common Issues

1. **Module not found errors**
   - Ensure all dependencies are in package.json
   - Check import paths (use .js extension)

2. **Timeout errors**
   - Break large operations into smaller chunks
   - Use background jobs for heavy processing

3. **CORS errors**
   - Vercel handles CORS automatically
   - Check API endpoint paths

4. **Environment variables not working**
   - Redeploy after adding new env vars
   - Check variable names match exactly

### Debugging

1. Check function logs:
   ```bash
   vercel logs
   ```

2. Test functions locally:
   ```bash
   vercel dev
   ```

3. Check build output:
   ```bash
   vercel build
   ```

## Cost Optimization

1. **Use ISR for static pages**: Reduce function invocations
2. **Optimize images**: Use Vercel Image Optimization
3. **Cache API responses**: Reduce repeated processing
4. **Monitor usage**: Set spending limits

## Security

1. **API Keys**: Never commit to code
2. **Rate Limiting**: Implement in API routes
3. **Authentication**: Verify JWT on each request
4. **Input Validation**: Sanitize all inputs

## Backup Plan

If Vercel is down:
1. Deploy to Netlify (similar structure)
2. Use Railway/Render for full Node.js app
3. Self-host with Docker

## Support

- Vercel Docs: https://vercel.com/docs
- Convex Docs: https://docs.convex.dev
- Project Issues: Create GitHub issue