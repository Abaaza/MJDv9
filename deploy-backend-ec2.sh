#!/bin/bash

# Deploy Backend to EC2 with correct CORS configuration
# This script ensures the proper index-ec2.js file is used

echo "==================================="
echo "🚀 Deploying Backend to EC2"
echo "==================================="

# Configuration
EC2_HOST="13.218.146.247"
EC2_USER="ec2-user"
EC2_KEY_PATH="./backend-key.pem"
BACKEND_DIR="boq-matching-system/backend"
REMOTE_DIR="/home/ec2-user/mjd-backend"

# Check if key file exists
if [ ! -f "$EC2_KEY_PATH" ]; then
    echo "❌ SSH key not found at $EC2_KEY_PATH"
    echo "Please ensure backend-key.pem is in the root directory"
    exit 1
fi

# Set correct permissions for key
chmod 400 "$EC2_KEY_PATH"

echo "📦 Building backend..."
cd "$BACKEND_DIR"
npm run build

# Ensure index-ec2.js exists
if [ ! -f "src/index-ec2.js" ]; then
    echo "❌ index-ec2.js not found in src directory"
    exit 1
fi

# Copy index-ec2.js to dist
cp src/index-ec2.js dist/index-ec2.js

echo "📤 Uploading files to EC2..."
cd ../..

# Create deployment package
tar -czf backend-deploy.tar.gz \
    -C "$BACKEND_DIR" \
    dist \
    package.json \
    package-lock.json \
    .env \
    temp_uploads \
    --exclude=node_modules \
    --exclude=.git

# Upload to EC2
scp -i "$EC2_KEY_PATH" -o StrictHostKeyChecking=no \
    backend-deploy.tar.gz \
    "$EC2_USER@$EC2_HOST:/tmp/"

# Deploy on EC2
ssh -i "$EC2_KEY_PATH" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'ENDSSH'
    echo "🔧 Setting up backend on EC2..."
    
    # Stop existing service
    pm2 stop mjd-backend 2>/dev/null || true
    
    # Backup existing deployment
    if [ -d "/home/ec2-user/mjd-backend" ]; then
        mv /home/ec2-user/mjd-backend /home/ec2-user/mjd-backend.backup.$(date +%Y%m%d%H%M%S)
    fi
    
    # Create new directory
    mkdir -p /home/ec2-user/mjd-backend
    
    # Extract files
    cd /home/ec2-user/mjd-backend
    tar -xzf /tmp/backend-deploy.tar.gz
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm ci --production
    
    # IMPORTANT: Use index-ec2.js instead of server.js
    echo "🚀 Starting server with correct CORS configuration..."
    pm2 start dist/index-ec2.js --name mjd-backend \
        --max-memory-restart 1G \
        --time \
        --merge-logs \
        --log-date-format "YYYY-MM-DD HH:mm:ss Z"
    
    pm2 save
    
    # Show status
    pm2 status mjd-backend
    
    # Show recent logs
    echo "📋 Recent logs:"
    pm2 logs mjd-backend --lines 20 --nostream
    
    # Test the server
    echo "🧪 Testing server..."
    sleep 3
    curl -s http://localhost:5000/health | jq '.'
    
    echo "✅ Deployment complete!"
ENDSSH

# Cleanup
rm -f backend-deploy.tar.gz

echo "==================================="
echo "✅ Backend deployed to EC2!"
echo "==================================="
echo "📍 Server URL: http://$EC2_HOST:5000"
echo "📍 Frontend URL: https://main.d3j084kic0l1ff.amplifyapp.com"
echo ""
echo "Test endpoints:"
echo "  curl http://$EC2_HOST:5000/health"
echo "  curl http://$EC2_HOST:5000/api/health"
echo ""
echo "Monitor logs:"
echo "  ssh -i $EC2_KEY_PATH $EC2_USER@$EC2_HOST 'pm2 logs mjd-backend'"
echo "==================================="