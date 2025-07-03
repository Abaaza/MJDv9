# Deployment Guide

## Vercel Deployment

### Frontend Deployment

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. **Configure Environment Variables** in Vercel:
   - Go to your Vercel project settings
   - Add the following environment variables:
     ```
     VITE_API_URL=https://your-backend-url.com/api
     ```

3. **Deploy Frontend**:
   ```bash
   vercel --prod
   ```

### Backend Deployment

The backend needs to be deployed separately as it's a Node.js Express server. Options include:

1. **Vercel Functions** (serverless)
2. **Railway, Render, or Fly.io** (traditional hosting)
3. **AWS EC2/ECS, Google Cloud Run, or Azure App Service**

#### Environment Variables for Backend:
```env
NODE_ENV=production
PORT=5000

# JWT Configuration
JWT_ACCESS_SECRET=<generate-secure-secret>
JWT_REFRESH_SECRET=<generate-secure-secret>

# Convex Database
CONVEX_URL=<your-convex-url>

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_5RXB2NRA8LBhhYEp_ANxsXYQaqSPXQdI7eCA5LEACMpUv2n

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend.vercel.app
```

### Vercel Configuration

The `vercel.json` file is configured to:
- Build and serve the frontend from the `frontend/dist` directory
- Redirect API calls to your backend URL
- Handle client-side routing for the React SPA

### Vercel Blob Storage

The application now supports Vercel Blob storage for file uploads:
- When `BLOB_READ_WRITE_TOKEN` is set, files are stored in Vercel Blob
- When not set, files are stored locally (for development)
- Files are automatically cleaned up after 24 hours

### Deployment Steps

1. **Deploy Convex Database**:
   ```bash
   npx convex deploy
   ```

2. **Deploy Backend** to your chosen platform

3. **Update Frontend Environment**:
   - Set `VITE_API_URL` to your backend URL in Vercel

4. **Deploy Frontend**:
   ```bash
   vercel --prod
   ```

### Post-Deployment

1. **Create Admin User**:
   - Register first user
   - Manually update user role to 'admin' in Convex dashboard

2. **Configure API Keys**:
   - Login as admin
   - Go to Admin Settings
   - Add Cohere and OpenAI API keys

3. **Test File Upload**:
   - Upload a test BOQ file
   - Verify it's stored in Vercel Blob (check Vercel dashboard)

### Troubleshooting

- **"Function Runtimes must have a valid version" error**: This is fixed by the vercel.json configuration
- **API calls failing**: Ensure the backend URL in vercel.json is correct
- **File uploads failing**: Check that BLOB_READ_WRITE_TOKEN is set correctly
- **CORS errors**: Verify FRONTEND_URL is set correctly in backend environment