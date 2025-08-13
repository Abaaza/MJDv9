#!/bin/bash

# Simple EC2 Deployment Script
# After fixing security group, run: ./simple-deploy.sh

set -e

SERVER_IP="13.218.146.247"
PEM_FILE="boq-key-202507161911.pem"
DEPLOY_PACKAGE="backend/deploy.tar.gz"

echo "=== Simple EC2 Deploy ==="
echo "Server: $SERVER_IP"
echo "PEM: $PEM_FILE"
echo "Package: $DEPLOY_PACKAGE"

# Check files exist
if [[ ! -f "$PEM_FILE" ]]; then
    echo "❌ PEM file not found: $PEM_FILE"
    echo "Available PEM files:"
    ls -la *.pem 2>/dev/null || echo "No PEM files found"
    exit 1
fi

if [[ ! -f "$DEPLOY_PACKAGE" ]]; then
    echo "❌ Deploy package not found: $DEPLOY_PACKAGE"
    exit 1
fi

echo "✅ Files found"

# Set permissions
chmod 400 "$PEM_FILE"
echo "✅ PEM permissions set"

# Test connection
echo "🔍 Testing connection..."
if timeout 5 bash -c "echo > /dev/tcp/$SERVER_IP/22" 2>/dev/null; then
    echo "✅ Port 22 accessible"
else
    echo "❌ Cannot connect to port 22"
    echo "Fix required:"
    echo "1. AWS Console → EC2 → Security Groups"
    echo "2. Allow SSH (port 22) from IP: 41.69.152.54"
    echo "3. Make sure EC2 instance is running"
    exit 1
fi

# Upload
echo "📤 Uploading..."
scp -i "$PEM_FILE" -o StrictHostKeyChecking=no "$DEPLOY_PACKAGE" ubuntu@$SERVER_IP:~/ || {
    echo "❌ Upload failed"
    exit 1
}
echo "✅ Upload complete"

# Deploy
echo "🚀 Deploying..."
ssh -i "$PEM_FILE" -o StrictHostKeyChecking=no ubuntu@$SERVER_IP << 'EOF'
set -e
echo "Extracting..."
cd ~
tar -xzf deploy.tar.gz

echo "Stopping old process..."
pm2 delete boq-backend 2>/dev/null || echo "No existing process"

echo "Starting new process..."
pm2 start index-ec2.js --name boq-backend

echo "Saving PM2 config..."
pm2 save

echo "Setting up startup..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || echo "Startup already configured"

echo "Checking status..."
pm2 status
EOF

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "Test: curl http://$SERVER_IP:3000/health"
echo "Logs: ssh -i $PEM_FILE ubuntu@$SERVER_IP 'pm2 logs boq-backend'"