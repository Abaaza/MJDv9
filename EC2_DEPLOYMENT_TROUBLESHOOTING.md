# EC2 Deployment Troubleshooting Guide

## Issue Identified
SSH connection to EC2 instance 54.82.88.31 is timing out. Port 22 appears to be closed or filtered.

## Possible Causes and Solutions

### 1. EC2 Instance Not Running
**Check and Start Instance:**
```bash
# Using AWS CLI (if configured)
aws ec2 describe-instances --instance-ids i-xxxxxxxxxx --query 'Reservations[*].Instances[*].State.Name'
aws ec2 start-instances --instance-ids i-xxxxxxxxxx
```

### 2. Security Group Configuration
**Required Security Group Rules:**
- **Type:** SSH
- **Protocol:** TCP
- **Port:** 22
- **Source:** Your current public IP address (or 0.0.0.0/0 for testing)

**To check your public IP:**
```bash
curl -s https://checkip.amazonaws.com/
```

### 3. Alternative Deployment Methods

#### Method 1: AWS Systems Manager Session Manager
If SSM is configured on the instance:
```bash
# Install AWS CLI and configure credentials
aws ssm start-session --target i-xxxxxxxxxx
```

#### Method 2: Copy PEM file to project directory first
Since Downloads folder access is restricted, copy the PEM file:

**Option A: Manual copy**
1. Copy `C:\Users\abaza\Downloads\backend-key.pem` 
2. Paste to `C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\backend-key.pem`

**Option B: Use existing PEM file**
We found: `boq-key-202507161911.pem` in the project directory.

#### Method 3: Alternative Connection Methods
```bash
# Try different SSH options
ssh -i "boq-key-202507161911.pem" -o ConnectTimeout=30 -o ConnectionAttempts=3 ubuntu@54.82.88.31

# Try with verbose output for debugging
ssh -v -i "boq-key-202507161911.pem" ubuntu@54.82.88.31
```

## Deployment Commands (Once SSH Works)

### Step 1: Upload deployment package
```bash
scp -i "boq-key-202507161911.pem" backend/deploy.tar.gz ubuntu@54.82.88.31:~/
```

### Step 2: SSH into server and deploy
```bash
ssh -i "boq-key-202507161911.pem" ubuntu@54.82.88.31
```

### Step 3: Extract and deploy on server
```bash
# On the EC2 server
cd ~
tar -xzf deploy.tar.gz
sudo pm2 delete boq-backend || true
sudo pm2 start index-ec2.js --name boq-backend
sudo pm2 save
sudo pm2 startup
```

## Pre-deployment Checklist

1. **Verify EC2 instance is running**
   - Check AWS Console EC2 dashboard
   - Instance state should be "running"

2. **Check Security Group**
   - Allow SSH (port 22) from your IP
   - Allow HTTP (port 80) and HTTPS (port 443) from anywhere
   - Allow your application port (usually 3000 or 5000)

3. **Verify PEM file**
   - Correct permissions (400)
   - Matches the EC2 instance key pair

4. **Network connectivity**
   - Your internet connection allows outbound SSH
   - No corporate firewall blocking SSH

## Emergency Deployment via AWS Console

If SSH is not working, you can use the AWS Console:

1. **Go to EC2 Console**
2. **Select your instance**
3. **Click "Connect" → "Session Manager"**
4. **Upload files via S3:**
   ```bash
   # Upload to S3 bucket first
   aws s3 cp deploy.tar.gz s3://your-bucket-name/
   
   # Download on EC2 via Session Manager
   aws s3 cp s3://your-bucket-name/deploy.tar.gz ~/
   ```

## Next Steps

1. **Check EC2 instance status** in AWS Console
2. **Verify security group** allows SSH from your IP
3. **Try alternative connection methods** above
4. **Copy PEM file** to project directory if needed
5. **Contact AWS support** if instance access issues persist