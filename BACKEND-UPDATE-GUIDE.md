# Backend Update Guide for EC2 (100.24.46.199)

## Reference: BACKEND-UPDATE-GUIDE.md

This guide provides a complete, hassle-free process for updating the backend on EC2 with proper CORS configuration and ensuring everything works correctly.

**Last Successfully Deployed**: August 15, 2025
**Deployment Method**: PowerShell script with local TypeScript build

---

## Quick Info
- **EC2 IP**: 100.24.46.199
- **EC2 Instance ID**: i-08aaff0571cba4906
- **Security Group**: sg-01e6d76ec6665d76e
- **Backend Port**: 5000
- **Process Manager**: PM2 (process name: `boq-backend`)
- **Backend Directory**: `/home/ec2-user/app/backend`
- **PEM Key Location**: `C:\Users\abaza\Downloads\backend-key.pem`
- **CloudFront Domain**: api-mjd.braunwell.io → origin-mjd.braunwell.io → 100.24.46.199

---

## Automated Deployment (Recommended)

### Use PowerShell Script for Major Changes
When you have significant code changes, use the automated deployment script:

```powershell
cd boq-matching-system
powershell -ExecutionPolicy Bypass -File deploy-backend.ps1
```

This script will:
1. Build TypeScript locally
2. Create deployment package
3. Backup current backend on EC2
4. Upload and deploy new code
5. Restart PM2 process
6. Verify deployment

---

## Step 1: Prepare Your Updates Locally

### 1.1 Fix TypeScript Compilation Errors
Before deploying, ensure TypeScript compiles:

```bash
cd boq-matching-system/backend
npm run build

# If there are errors, you can build with less strict checking:
npx tsc -p tsconfig.build.json --skipLibCheck --noEmitOnError false
```

Common fixes needed:
- Ensure UserPayload interface has both `id` and `userId` properties
- Make MatchingService methods public if used by other services
- Remove any temporary deployment routes

### 1.2 Check Files to Update
Common backend files that need updates:
```
backend/
├── src/
│   ├── server.ts           # Main server file with CORS config
│   ├── controllers/        # API controllers
│   ├── services/          # Business logic
│   ├── middleware/        # Auth, CORS, error handling
│   ├── types/             # TypeScript type definitions
│   └── routes/            # API routes
├── dist/                  # Compiled JavaScript (generated)
├── index.js               # Entry point (EC2 version)
├── package.json           # Dependencies
└── .env                   # Environment variables
```

### 1.3 Ensure CORS is Properly Configured
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

### 1.4 Ensure Correct index.js for EC2
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

### Option A: Using SCP (Recommended - PEM key available)
```bash
# 1. Create tar archive
tar -czf backend-update.tar.gz backend-update/

# 2. Upload to EC2
scp -i "C:\Users\abaza\Downloads\backend-key.pem" backend-update.tar.gz ec2-user@100.24.46.199:/home/ec2-user/

# 3. Connect and extract
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199
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
scp -i "C:\Users\abaza\Downloads\backend-key.pem" backend/src/services/matching.service.ts ec2-user@100.24.46.199:/home/ec2-user/app/backend/src/services/
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "cd /home/ec2-user/app/backend && npm run build && pm2 restart boq-backend"
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
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199

# Once connected:
cd /home/ec2-user/app/backend    # Go to backend
pm2 status                       # Check status
pm2 restart boq-backend         # Restart backend
pm2 start index.js --name boq-backend  # Start if stopped
pm2 save                        # Save PM2 configuration

# Test endpoints
curl http://localhost:5000/api/health
curl -k https://100.24.46.199/api/health
curl https://api-mjd.braunwell.io/api/health
```

## Live Log Monitoring Commands

### From Windows (Direct Commands)
```bash
# View live logs
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 logs boq-backend -f"

# View last 100 lines and follow
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 logs boq-backend --lines 100 -f"

# View only error logs
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 logs boq-backend --err -f"

# View only output logs
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 logs boq-backend --out -f"

# Interactive monitoring (CPU, Memory, Logs)
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 monit"
```

### From EC2 Server
```bash
pm2 logs boq-backend            # View recent logs
pm2 logs boq-backend -f         # Follow logs in real-time
pm2 logs boq-backend --lines 200 # View last 200 lines
pm2 logs boq-backend --err      # View only errors
pm2 logs boq-backend --out      # View only output
pm2 monit                       # Interactive dashboard
```

---

## Deployment Success Checklist

After deployment, verify these items:

### ✅ Backend Health
```bash
# Should return {"status":"ok",...}
curl https://api-mjd.braunwell.io/api/health
```

### ✅ CORS Configuration
```bash
# Should show proper CORS headers
curl -X OPTIONS https://api-mjd.braunwell.io/api/auth/me \
  -H "Origin: https://mjd.braunwell.io" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization" -I
```

Expected headers:
- Access-Control-Allow-Origin: https://mjd.braunwell.io
- Access-Control-Allow-Credentials: true
- Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
- Access-Control-Allow-Headers: Content-Type,Authorization,X-Requested-With,Accept

### ✅ PM2 Process Status
```bash
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 "pm2 status"
```
- Should show boq-backend as "online"
- Restart count should be stable (not increasing)

### ✅ Test Authentication
```bash
curl -X POST https://api-mjd.braunwell.io/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"abaza@mjd.com","password":"abaza123"}'
```

---

## Common Deployment Issues & Solutions

### Issue: TypeScript Compilation Errors
**Solution**: Build with less strict checking
```bash
npx tsc -p tsconfig.build.json --skipLibCheck --noEmitOnError false
```

### Issue: PM2 Process Keeps Restarting
**Solution**: Check logs for missing modules
```bash
pm2 logs boq-backend --err --lines 50
# Common fix: Install missing packages
npm install cross-fetch typescript
```

### Issue: 502 Bad Gateway
**Solution**: Backend not running, restart it
```bash
ssh -i "C:\Users\abaza\Downloads\backend-key.pem" ec2-user@100.24.46.199 \
  "cd /home/ec2-user/app/backend && pm2 restart boq-backend"
```

### Issue: CORS Errors in Browser
**Solution**: Verify CORS configuration
1. Check .env file has correct FRONTEND_URL
2. Ensure index.js is EC2 version (not Lambda)
3. Clear browser cache

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

## SSH Troubleshooting

### If SSH Connection Fails
1. **Check your current IP**: `curl https://api.ipify.org`
2. **Update Security Group** if IP changed:
```bash
# Check current SSH rules
aws ec2 describe-security-groups --group-ids sg-01e6d76ec6665d76e --region us-east-1 --query "SecurityGroups[0].IpPermissions[?FromPort==\`22\`]"

# Add your new IP
aws ec2 authorize-security-group-ingress --group-id sg-01e6d76ec6665d76e --protocol tcp --port 22 --cidr YOUR_IP/32 --region us-east-1
```

---

**File Reference**: `BACKEND-UPDATE-GUIDE.md`
**Last Updated**: August 15, 2025
**Last Successful Deployment**: August 15, 2025 (with major code changes)
**EC2 Instance**: 100.24.46.199
**Instance ID**: i-08aaff0571cba4906
**Security Group**: sg-01e6d76ec6665d76e
**PEM Key**: `C:\Users\abaza\Downloads\backend-key.pem`
**Process**: boq-backend (PM2)
**Backend URL**: https://api-mjd.braunwell.io
**Frontend URL**: https://mjd.braunwell.io