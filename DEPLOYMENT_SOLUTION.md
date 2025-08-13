# EC2 Backend Deployment Solution

## Current Situation

✅ **What We Have:**
- Deployment package: `backend/deploy.tar.gz` (459,517 bytes)
- PEM file: `boq-key-202507161911.pem` (found in project directory)
- Target server: 54.82.88.31
- Your public IP: 41.69.152.54

❌ **Current Problem:**
- SSH connection to port 22 is timing out
- This indicates network connectivity issues

## Root Cause Analysis

The SSH timeout suggests one of these issues:

1. **EC2 Instance Not Running**
   - Instance might be stopped/terminated
   - Check AWS Console → EC2 → Instances

2. **Security Group Misconfiguration**
   - SSH (port 22) not allowed from your IP
   - Security group might only allow specific IPs

3. **Network Issues**
   - Corporate firewall blocking SSH
   - Internet connectivity problems

## Immediate Solutions

### Solution 1: Check and Fix Security Group (Recommended)

1. **Go to AWS Console:**
   - Navigate to EC2 → Security Groups
   - Find the security group for instance 54.82.88.31

2. **Add SSH Rule:**
   ```
   Type: SSH
   Protocol: TCP
   Port: 22
   Source: 41.69.152.54/32  (Your current IP)
   ```

3. **Also ensure these ports are open:**
   ```
   Type: HTTP
   Protocol: TCP
   Port: 80
   Source: 0.0.0.0/0

   Type: Custom TCP
   Protocol: TCP
   Port: 3000
   Source: 0.0.0.0/0  (or your specific IP)
   ```

### Solution 2: Verify EC2 Instance Status

1. **Check Instance State:**
   - AWS Console → EC2 → Instances
   - Instance should show "running" state
   - If stopped, click "Start instance"

2. **Verify IP Address:**
   - Confirm public IP is still 54.82.88.31
   - If IP changed, update scripts with new IP

### Solution 3: Alternative Deployment Methods

#### Option A: AWS Session Manager (if configured)
```bash
# Install AWS CLI and configure credentials
aws configure
aws ssm start-session --target i-instanceid

# Then upload via S3:
aws s3 cp backend/deploy.tar.gz s3://your-bucket/
# On server: aws s3 cp s3://your-bucket/deploy.tar.gz ~/
```

#### Option B: EC2 Instance Connect (if enabled)
- Use AWS Console → EC2 → Connect → EC2 Instance Connect
- Upload files via web interface

#### Option C: Copy PEM File to Downloads Location
Since we can't access Downloads directly, copy it manually:

**Windows Command Prompt:**
```cmd
copy "C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\boq-key-202507161911.pem" "C:\Users\abaza\Downloads\backend-key.pem"
```

**Windows PowerShell:**
```powershell
Copy-Item "C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\boq-key-202507161911.pem" "C:\Users\abaza\Downloads\backend-key.pem"
```

## Fixed Deployment Commands

Once SSH access is working, use these corrected commands:

### 1. Upload Deployment Package
```bash
cd "C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system"
scp -i "boq-key-202507161911.pem" -o StrictHostKeyChecking=no "backend/deploy.tar.gz" ubuntu@54.82.88.31:~/
```

### 2. SSH and Deploy
```bash
ssh -i "boq-key-202507161911.pem" -o StrictHostKeyChecking=no ubuntu@54.82.88.31
```

### 3. On the Server (after SSH)
```bash
# Extract deployment package
cd ~
tar -xzf deploy.tar.gz

# Stop existing PM2 process
pm2 delete boq-backend || true

# Start new process with index-ec2.js
pm2 start index-ec2.js --name boq-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Check status
pm2 status
pm2 logs boq-backend
```

## Test Connectivity

Once you fix the security group, test with:

```bash
# Test SSH connectivity
ssh -i "boq-key-202507161911.pem" -o ConnectTimeout=10 ubuntu@54.82.88.31 "echo 'Connection successful!'"

# Test application
curl http://54.82.88.31:3000/health
```

## Quick Fix Script

After fixing the security group, run this simplified command:

```bash
cd "C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system"

# Upload and deploy in one command
scp -i "boq-key-202507161911.pem" "backend/deploy.tar.gz" ubuntu@54.82.88.31:~/ && \
ssh -i "boq-key-202507161911.pem" ubuntu@54.82.88.31 "cd ~ && tar -xzf deploy.tar.gz && pm2 delete boq-backend || true && pm2 start index-ec2.js --name boq-backend && pm2 save && pm2 status"
```

## Verification Steps

After successful deployment:

1. **Check PM2 Status:**
   ```bash
   ssh -i "boq-key-202507161911.pem" ubuntu@54.82.88.31 "pm2 status"
   ```

2. **View Application Logs:**
   ```bash
   ssh -i "boq-key-202507161911.pem" ubuntu@54.82.88.31 "pm2 logs boq-backend --lines 50"
   ```

3. **Test API Endpoint:**
   ```bash
   curl http://54.82.88.31:3000/health
   curl http://54.82.88.31:3000/api/auth/health
   ```

## Next Steps

1. **Fix Security Group** - This is most likely the issue
2. **Verify EC2 instance is running**
3. **Run the deployment commands above**
4. **Test the application**

## Emergency Contacts

If you need immediate help:
- Check AWS Support Center
- Use AWS forums for community help
- Contact your AWS administrator if using company account

---

**Status:** Ready to deploy once SSH access is fixed
**Priority:** Fix security group first, then run deployment commands