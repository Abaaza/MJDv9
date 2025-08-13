# Simple Backend Deployment Guide

## Prerequisites
- SSH access to EC2 (PEM key required)
- Node.js 16+ installed on EC2
- PM2 installed globally on EC2

## Deployment Steps

### 1. Connect to EC2
```bash
ssh -i your-key.pem ec2-user@100.24.46.199
```

### 2. Navigate to backend directory
```bash
cd /home/ec2-user/app/backend
```

### 3. Pull latest code (if using Git)
```bash
git pull origin main
```

### 4. Install dependencies
```bash
npm install --production
```

### 5. Build TypeScript (if needed)
```bash
npx tsc -p tsconfig.build.json --skipLibCheck --noEmitOnError false
```

### 6. Restart the backend
```bash
pm2 restart boq-backend
```

### 7. Check status
```bash
pm2 status
pm2 logs boq-backend --lines 20
```

## Manual File Upload (without Git)

If you need to upload files manually:

### From your local machine:
```bash
# Upload a single file
scp -i your-key.pem local-file.js ec2-user@100.24.46.199:/home/ec2-user/app/backend/

# Upload entire src directory
scp -i your-key.pem -r ./src ec2-user@100.24.46.199:/home/ec2-user/app/backend/

# Then restart PM2
ssh -i your-key.pem ec2-user@100.24.46.199 "pm2 restart boq-backend"
```

## Environment Variables

The backend uses these environment variables (stored in `/home/ec2-user/app/backend/.env`):

```env
PORT=5000
NODE_ENV=production
CONVEX_URL=https://good-dolphin-454.convex.cloud
JWT_ACCESS_SECRET=mjd-boq-matching-access-secret-key-2025-secure
JWT_REFRESH_SECRET=mjd-boq-matching-refresh-secret-key-2025-secure
FRONTEND_URL=https://mjd.braunwell.io
CORS_ORIGIN=https://mjd.braunwell.io
```

## Testing the Deployment

```bash
# Test health endpoint
curl https://100.24.46.199/api/health

# Test from CloudFront
curl https://api-mjd.braunwell.io/api/health
```

## Troubleshooting

### If backend won't start:
```bash
# Check error logs
pm2 logs boq-backend --err --lines 50

# Check if port 5000 is in use
sudo lsof -i :5000

# Restart PM2 daemon
pm2 kill
pm2 start /home/ec2-user/app/backend/index.js --name boq-backend
```

### If CORS errors occur:
1. Check that CORS_ORIGIN in .env matches your frontend URL
2. Restart backend: `pm2 restart boq-backend`
3. Clear browser cache

### If Nginx issues:
```bash
# Test Nginx config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log
```