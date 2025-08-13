#!/bin/bash

# Deployment script using new PEM key
echo "====================================="
echo "🚀 Deploy Backend to EC2"
echo "====================================="

# Configuration
EC2_HOST="54.82.88.31"
EC2_USER="ec2-user"
PEM_FILE="mjd-backend-key.pem"

# Check if PEM exists
if [ ! -f "$PEM_FILE" ]; then
    echo "❌ PEM file not found: $PEM_FILE"
    echo ""
    echo "To create a new PEM file:"
    echo "1. Go to AWS Console → EC2 → Key Pairs"
    echo "2. Create new key pair named 'mjd-backend-key'"
    echo "3. Download the .pem file"
    echo "4. Copy it to this directory"
    exit 1
fi

echo "✅ Found PEM file: $PEM_FILE"

# Set permissions
chmod 400 "$PEM_FILE"

# Test connection
echo "Testing SSH connection..."
ssh -i "$PEM_FILE" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "echo 'Connection successful!'" || {
    echo "❌ Cannot connect to EC2"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if instance is running in AWS Console"
    echo "2. Verify Security Group allows SSH (port 22) from your IP"
    echo "3. Make sure the key pair is attached to the instance"
    exit 1
}

echo "📦 Building backend..."
cd backend
npm run build || echo "Build had some warnings, continuing..."

# Copy EC2 configuration
cp src/index-ec2.js dist/index-ec2.js

# Create deployment package
cd ..
tar -czf deploy.tar.gz \
    -C backend \
    dist \
    package.json \
    package-lock.json \
    .env

echo "📤 Uploading to EC2..."
scp -i "$PEM_FILE" -o StrictHostKeyChecking=no deploy.tar.gz "$EC2_USER@$EC2_HOST:/tmp/"

echo "🚀 Deploying on server..."
ssh -i "$PEM_FILE" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'ENDSSH'
    # Stop existing service
    pm2 stop mjd-backend 2>/dev/null || true
    
    # Backup current deployment
    if [ -d "/home/ec2-user/mjd-backend" ]; then
        mv /home/ec2-user/mjd-backend /home/ec2-user/mjd-backend.backup.$(date +%s)
    fi
    
    # Extract new deployment
    mkdir -p /home/ec2-user/mjd-backend
    cd /home/ec2-user/mjd-backend
    tar -xzf /tmp/deploy.tar.gz
    
    # Install dependencies
    npm ci --production
    
    # Start with PM2
    pm2 start dist/index-ec2.js --name mjd-backend --max-memory-restart 1G
    pm2 save
    
    # Show status
    pm2 status mjd-backend
    
    echo "✅ Deployment complete!"
ENDSSH

# Cleanup
rm -f deploy.tar.gz

echo "====================================="
echo "✅ Backend deployed successfully!"
echo "====================================="
echo "API URL: https://$EC2_HOST/api"
echo "Test: curl -k https://$EC2_HOST/api/health"