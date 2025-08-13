# Backend Update Guide for EC2 (100.24.46.199)

## Reference: BACKEND-UPDATE-GUIDE.md

This guide provides a complete, hassle-free process for updating the backend on EC2 with proper CORS configuration and ensuring everything works correctly.

---

## Quick Info
- **EC2 IP**: 100.24.46.199
- **Backend Port**: 5000
- **Process Manager**: PM2 (process name: `boq-backend`)
- **Backend Directory**: `/home/ec2-user/app/backend`
- **CloudFront Domain**: api-mjd.braunwell.io → origin-mjd.braunwell.io → 100.24.46.199

---

## Step 1: Prepare Your Updates Locally

### 1.1 Check Files to Update
Common backend files that need updates:
```
backend/
├── src/
│   ├── server.ts           # Main server file with CORS config
│   ├── controllers/        # API controllers
│   ├── services/          # Business logic
│   ├── middleware/        # Auth, CORS, error handling
│   └── routes/            # API routes
├── index.js               # Entry point (EC2 version)
├── package.json           # Dependencies
└── .env                   # Environment variables
```

### 1.2 Ensure CORS is Properly Configured
In `backend/src/server.ts`, CORS should be:
```typescript
const corsOptions = {
  origin: [
    'https://mjd.braunwell.io',
    'https://main.d3j084kic0l1ff.amplifyapp.com',
    'http://localhost:5173'  // for local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 86400
};
app.use(cors(corsOptions));
```

### 1.3 Ensure Correct index.js for EC2
The `backend/index.js` file MUST be the EC2 version:
```javascript
// EC2 index.js - CRITICAL: This is the correct version
require("cross-fetch/polyfill");

// Set environment variables
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "mjd-boq-matching-access-secret-key-2025-secure";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "mjd-boq-matching-refresh-secret-key-2025-secure";
process.env.CONVEX_URL = process.env.CONVEX_URL || "https://good-dolphin-454.convex.cloud";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "https://mjd.braunwell.io";
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.PORT = process.env.PORT || "5000";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "https://mjd.braunwell.io";

const { app } = require("./dist/server");

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS enabled for: ${process.env.CORS_ORIGIN}`);
});
```

---

## Step 2: Create Update Package

### 2.1 Create a deployment folder
```bash
mkdir backend-update
cp -r backend/src backend-update/
cp backend/index.js backend-update/
cp backend/package.json backend-update/
cp backend/tsconfig.build.json backend-update/
```

### 2.2 Create update script
Save this as `backend-update/update.sh`:
```bash
#!/bin/bash
echo "Updating Backend on EC2..."

# Backup current version
cp -r /home/ec2-user/app/backend /home/ec2-user/app/backend.backup.$(date +%Y%m%d_%H%M%S)

# Copy new files
cp -r src/* /home/ec2-user/app/backend/src/
cp index.js /home/ec2-user/app/backend/
cp package.json /home/ec2-user/app/backend/

# Navigate to backend
cd /home/ec2-user/app/backend

# Install dependencies
npm install --production

# Build TypeScript
npx tsc -p tsconfig.build.json --skipLibCheck --noEmitOnError false || true

# Ensure temp_uploads directory exists
mkdir -p temp_uploads

# Restart PM2
pm2 restart boq-backend

# Show status
pm2 status
echo "Update complete!"
```

---

## Step 3: Upload and Execute Update

### Option A: Using SCP (if you have PEM key)
```bash
# 1. Create tar archive
tar -czf backend-update.tar.gz backend-update/

# 2. Upload to EC2
scp -i your-key.pem backend-update.tar.gz ec2-user@100.24.46.199:/home/ec2-user/

# 3. Connect and extract
ssh -i your-key.pem ec2-user@100.24.46.199
tar -xzf backend-update.tar.gz
cd backend-update
chmod +x update.sh
./update.sh
```

### Option B: Using Git (if backend is in Git repo)
```bash
# On EC2
cd /home/ec2-user/app/backend
git pull origin main
npm install --production
npx tsc -p tsconfig.build.json --skipLibCheck --noEmitOnError false
pm2 restart boq-backend
```

### Option C: Manual file updates via SSH
```bash
# For individual file updates
scp -i your-key.pem backend/src/services/matching.service.ts ec2-user@100.24.46.199:/home/ec2-user/app/backend/src/services/
ssh -i your-key.pem ec2-user@100.24.46.199 "cd /home/ec2-user/app/backend && npm run build && pm2 restart boq-backend"
```

---

## Step 4: Critical Environment Variables

Ensure these are set in `/home/ec2-user/app/backend/.env`:
```env
# Database
CONVEX_URL=https://good-dolphin-454.convex.cloud

# JWT Configuration
JWT_ACCESS_SECRET=mjd-boq-matching-access-secret-key-2025-secure
JWT_REFRESH_SECRET=mjd-boq-matching-refresh-secret-key-2025-secure
JWT_ACCESS_EXPIRY=16h
JWT_REFRESH_EXPIRY=30d

# API Keys
COHERE_API_KEY=your-cohere-api-key
OPENAI_API_KEY=your-openai-api-key

# Server Configuration
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://mjd.braunwell.io
CORS_ORIGIN=https://mjd.braunwell.io
COOKIE_SECURE=true
```

---

## Step 5: Verify Everything Works

### 5.1 Check Backend Health
```bash
# Direct backend
curl -k https://100.24.46.199/api/health

# Via CloudFront
curl https://api-mjd.braunwell.io/api/health
```

### 5.2 Test CORS Headers
```bash
curl -X OPTIONS https://api-mjd.braunwell.io/api/auth/me \
  -H "Origin: https://mjd.braunwell.io" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" -v
```

Should return:
```
< Access-Control-Allow-Origin: https://mjd.braunwell.io
< Access-Control-Allow-Credentials: true
< Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
< Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept
```

### 5.3 Check PM2 Status
```bash
pm2 status
pm2 logs boq-backend --lines 20
```

---

## Step 6: Troubleshooting

### If CORS errors occur:
1. Check that `CORS_ORIGIN` in .env matches frontend URL
2. Verify index.js is the EC2 version (not Lambda)
3. Clear browser cache and cookies
4. Check Nginx isn't overriding CORS headers:
```bash
sudo cat /etc/nginx/conf.d/api-mjd.conf
# Should NOT have CORS headers - Express handles them
```

### If backend won't start:
```bash
# Check logs
pm2 logs boq-backend --err --lines 50

# Check if cross-fetch is installed
npm list cross-fetch

# If missing, install it
npm install cross-fetch

# Restart
pm2 restart boq-backend
```

### If 502 Bad Gateway:
```bash
# Backend crashed, restart it
pm2 restart boq-backend

# Check if port 5000 is listening
sudo lsof -i :5000

# Restart Nginx if needed
sudo systemctl restart nginx
```

---

## Step 7: Rollback if Needed

If update causes issues:
```bash
# Find backup
ls -la /home/ec2-user/app/ | grep backend.backup

# Restore backup (use appropriate timestamp)
rm -rf /home/ec2-user/app/backend
mv /home/ec2-user/app/backend.backup.20250813_210000 /home/ec2-user/app/backend
cd /home/ec2-user/app/backend
pm2 restart boq-backend
```

---

## Important DNS/CloudFront Info

- **origin-mjd.braunwell.io** → 100.24.46.199 (Route 53 A record)
- **api-mjd.braunwell.io** → CloudFront → origin-mjd.braunwell.io
- CloudFront Distribution ID: E22KB3OMRSSLLE
- Changes to CloudFront take 5-10 minutes to propagate

---

## Quick Commands Reference

```bash
# SSH to EC2
ssh -i your-key.pem ec2-user@100.24.46.199

# Once connected:
cd /home/ec2-user/app/backend    # Go to backend
pm2 status                       # Check status
pm2 restart boq-backend         # Restart backend
pm2 logs boq-backend            # View logs
pm2 monit                       # Real-time monitoring

# Test endpoints
curl http://localhost:5000/api/health
curl -k https://100.24.46.199/api/health
curl https://api-mjd.braunwell.io/api/health
```

---

## Notes for Claude Code

When asking Claude Code to update the backend, reference this file:
"Please update the backend following BACKEND-UPDATE-GUIDE.md"

Key points Claude Code should verify:
1. ✅ CORS configuration includes https://mjd.braunwell.io
2. ✅ index.js is the EC2 version (not Lambda)
3. ✅ cross-fetch polyfill is included
4. ✅ Environment variables are set correctly
5. ✅ PM2 restart after updates
6. ✅ Test health endpoint after deployment

---

**File Reference**: `BACKEND-UPDATE-GUIDE.md`
**Last Updated**: August 13, 2025
**EC2 Instance**: 100.24.46.199
**Process**: boq-backend (PM2)