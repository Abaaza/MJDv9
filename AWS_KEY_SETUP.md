# AWS EC2 Key Pair Setup Guide

## Current Issue
The existing PEM file `boq-key-202507161911.pem` is not working for SSH access to EC2 instance (54.82.88.31).

## Solution: Create New Key Pair

### Step 1: Create Key Pair in AWS
1. **Login to AWS Console**
   - Go to: https://console.aws.amazon.com/
   - Select your region (appears to be Mumbai/ap-south-1 based on IP)

2. **Navigate to Key Pairs**
   - EC2 Dashboard → Network & Security → Key Pairs
   - Or direct link: https://console.aws.amazon.com/ec2/v2/home#KeyPairs:

3. **Create New Key Pair**
   - Click "Create key pair"
   - Settings:
     - **Name**: `mjd-backend-key`
     - **Key pair type**: RSA
     - **Private key file format**: .pem
   - Click "Create key pair"
   - File will download automatically

### Step 2: Associate Key with EC2 Instance

#### Option A: Add to existing instance (if you have root access)
1. SSH with existing working key (if any)
2. Add new public key to `~/.ssh/authorized_keys`

#### Option B: Replace key pair (requires instance stop)
1. Go to EC2 → Instances
2. Select instance (54.82.88.31)
3. Actions → Instance State → **Stop**
4. Wait for instance to stop
5. Actions → Security → **Modify instance attribute**
6. Change key pair to `mjd-backend-key`
7. Actions → Instance State → **Start**

### Step 3: Configure Security Group
1. Go to EC2 → Security Groups
2. Find the security group attached to your instance
3. Edit inbound rules:
   ```
   Type: SSH
   Protocol: TCP
   Port: 22
   Source: My IP (or your specific IP)
   ```

### Step 4: Copy PEM to Project
```bash
# Windows Command Prompt
copy %USERPROFILE%\Downloads\mjd-backend-key.pem C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\

# Set permissions (Git Bash)
chmod 400 mjd-backend-key.pem
```

### Step 5: Test Connection
```bash
ssh -i mjd-backend-key.pem ec2-user@54.82.88.31
```

## Alternative: Use Session Manager (No PEM needed)
If SSH continues to fail, use AWS Systems Manager Session Manager:
1. Install Session Manager plugin
2. Ensure instance has SSM role attached
3. Connect via AWS Console → EC2 → Connect → Session Manager

## Deployment Commands
Once key is working:
```bash
# Deploy backend
./deploy-with-new-key.sh

# Or manually
scp -i mjd-backend-key.pem backend/dist/* ec2-user@54.82.88.31:/home/ec2-user/mjd-backend/dist/
ssh -i mjd-backend-key.pem ec2-user@54.82.88.31 "pm2 restart mjd-backend"
```

## Troubleshooting
1. **Connection timeout**: Security group issue or instance stopped
2. **Permission denied**: Wrong key or key not associated with instance
3. **Host key verification failed**: Add `-o StrictHostKeyChecking=no`
4. **Bad permissions**: Run `chmod 400 mjd-backend-key.pem`

## Important Files
- PEM Location: `C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\mjd-backend-key.pem`
- Deploy Script: `deploy-with-new-key.sh`
- Setup Script: `setup-new-pem.bat`