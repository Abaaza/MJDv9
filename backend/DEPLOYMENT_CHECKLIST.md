# Lambda Deployment Checklist

## ✅ Fixed Issues

1. **Convex API Imports**
   - Created local copy in `src/convex-generated/`
   - All imports now use `../lib/convex-api` instead of parent directory
   - Added missing `dataModel.js` file
   - Updated `convexId.ts` to use local imports

2. **Environment Variables**
   - JWT secrets extended to 42 characters (meeting 32 char requirement)
   - FRONTEND_URL changed from '*' to valid URL
   - Added AWS_S3_BUCKET environment variable

3. **File System Issues**
   - Logger now uses `/tmp/logs` in Lambda environment
   - File storage uses `/tmp/uploads` in Lambda
   - Replaced Vercel Blob with S3 storage

4. **Express 5 Compatibility**
   - Changed wildcard route from `*` to `/*`
   - Fixed path-to-regexp parameter parsing

5. **S3 Integration**
   - Created `s3Storage.service.ts` with full S3 support
   - Added IAM permissions in serverless.yml
   - Supports both S3 (production) and local storage (development)

## 📋 Pre-Deployment Steps

1. **Build TypeScript**
   ```bash
   npx tsc -p tsconfig.lambda.json
   ```

2. **Clean up large files (if needed)**
   ```bash
   node prepare-lambda.js
   ```

3. **Set AWS credentials**
   ```bash
   aws configure
   ```

## 🚀 Deployment Command

```bash
serverless deploy
```

## 🔧 Environment Variables Needed

- `CONVEX_URL` - Your Convex database URL
- `JWT_ACCESS_SECRET` - At least 32 characters
- `JWT_REFRESH_SECRET` - At least 32 characters
- `AWS_S3_BUCKET` - S3 bucket name (optional, defaults to 'mjd-boq-uploads-prod')

## 📦 Package Contents

The deployment includes:
- `dist/**` - Compiled TypeScript files
- `handler.js` - Lambda entry point
- `node_modules/**` - Production dependencies
- `src/convex-generated/**` - Convex API files
- `package.json` & `package-lock.json`

## 🧪 Testing

After deployment:
```bash
node test-lambda.js
```

Or check logs:
```bash
serverless logs -f app -t
```

## ⚠️ Important Notes

1. The Lambda function has a 30-second timeout for HTTP requests
2. Long-running jobs should use the async pattern (commented out for now)
3. S3 bucket will be created automatically if it doesn't exist
4. Files are stored with S3 URLs in format: `s3://bucket/uploads/filename`