#!/bin/bash

# Backend EC2 Deployment Script
# Usage: ./deploy-backend-ec2.sh [server-ip]

set -e

SERVER_IP="${1:-54.82.88.31}"
DEPLOY_PACKAGE="backend/deploy.tar.gz"
PROJECT_DIR="$(pwd)"
PEM_FILE=""

echo "=== Backend EC2 Deployment Script ==="
echo "Server IP: $SERVER_IP"
echo "Deploy Package: $DEPLOY_PACKAGE"
echo "Project Directory: $PROJECT_DIR"

# Function to find PEM file
find_pem_file() {
    echo "Searching for PEM files..."
    
    # Look for PEM files in project directory
    local pem_files=($(find . -name "*.pem" -type f 2>/dev/null))
    if [[ ${#pem_files[@]} -gt 0 ]]; then
        local pem_path="$(realpath "${pem_files[0]}")"
        echo "Found PEM file in project: $pem_path"
        echo "$pem_path"
        return 0
    fi
    
    # Try different Downloads paths
    local downloads_paths=(
        "$HOME/Downloads/backend-key.pem"
        "/mnt/c/Users/$USER/Downloads/backend-key.pem"
        "/mnt/c/Users/abaza/Downloads/backend-key.pem"
        "/c/Users/$USER/Downloads/backend-key.pem"
        "/c/Users/abaza/Downloads/backend-key.pem"
        "C:/Users/$USER/Downloads/backend-key.pem"
        "C:/Users/abaza/Downloads/backend-key.pem"
    )
    
    echo "Checking Downloads folder locations..."
    for path in "${downloads_paths[@]}"; do
        echo "  Trying: $path"
        if [[ -f "$path" ]]; then
            echo "Found PEM file in Downloads: $path"
            # Copy to project directory
            cp "$path" "./backend-key.pem"
            chmod 400 "./backend-key.pem"
            echo "Copied to project directory: ./backend-key.pem"
            echo "$(realpath ./backend-key.pem)"
            return 0
        fi
    done
    
    return 1
}

# Function to test connectivity
test_connectivity() {
    echo "Testing connectivity to $SERVER_IP:22..."
    if timeout 10 bash -c "echo > /dev/tcp/$SERVER_IP/22" 2>/dev/null; then
        echo "✓ Port 22 is accessible"
        return 0
    else
        echo "✗ Port 22 is not accessible"
        return 1
    fi
}

# Function to deploy via SSH
deploy_via_ssh() {
    local pem_file="$1"
    
    echo "Setting PEM file permissions..."
    chmod 400 "$pem_file"
    
    echo "Uploading deployment package..."
    if ! scp -i "$pem_file" \
        -o ConnectTimeout=30 \
        -o StrictHostKeyChecking=no \
        "$DEPLOY_PACKAGE" \
        "ubuntu@$SERVER_IP:~/"; then
        echo "ERROR: Failed to upload deployment package" >&2
        return 1
    fi
    
    echo "Extracting and deploying on server..."
    if ! ssh -i "$pem_file" \
        -o ConnectTimeout=30 \
        -o StrictHostKeyChecking=no \
        "ubuntu@$SERVER_IP" \
        'cd ~ && \
         echo "Extracting deploy package..." && \
         tar -xzf deploy.tar.gz && \
         echo "Stopping existing PM2 processes..." && \
         sudo pm2 delete boq-backend || true && \
         echo "Starting new PM2 process with index-ec2.js..." && \
         sudo pm2 start index-ec2.js --name boq-backend && \
         echo "Saving PM2 configuration..." && \
         sudo pm2 save && \
         echo "Setting up PM2 startup..." && \
         sudo pm2 startup && \
         echo "Checking PM2 status..." && \
         sudo pm2 status && \
         echo "Deployment completed successfully!"'; then
        echo "ERROR: Failed to deploy on server" >&2
        return 1
    fi
    
    echo "✓ Deployment successful!"
    return 0
}

# Function to show troubleshooting steps
show_troubleshooting() {
    local pem_file="$1"
    
    echo ""
    echo "=== TROUBLESHOOTING STEPS ==="
    echo ""
    echo "1. Check EC2 Instance Status:"
    echo "   • Go to AWS EC2 Console"
    echo "   • Verify instance $SERVER_IP is 'running'"
    echo "   • Check instance health checks"
    echo ""
    echo "2. Check Security Group:"
    echo "   • SSH (port 22) should allow your IP"
    echo "   • Your public IP: $(curl -s https://checkip.amazonaws.com/ 2>/dev/null || echo 'Unable to determine')"
    echo "   • HTTP (port 80) and app port should be open"
    echo ""
    echo "3. Manual Deployment Steps:"
    echo "   scp -i \"$pem_file\" \"$DEPLOY_PACKAGE\" ubuntu@$SERVER_IP:~/"
    echo "   ssh -i \"$pem_file\" ubuntu@$SERVER_IP"
    echo "   # On the server:"
    echo "   cd ~ && tar -xzf deploy.tar.gz"
    echo "   sudo pm2 delete boq-backend || true"
    echo "   sudo pm2 start index-ec2.js --name boq-backend"
    echo "   sudo pm2 save && sudo pm2 startup"
    echo ""
    echo "4. Alternative Access Methods:"
    echo "   • AWS Session Manager (if configured)"
    echo "   • EC2 Instance Connect (if enabled)"
    echo "   • VPC connection if using private subnet"
    echo ""
    echo "5. Verify Deployment:"
    echo "   curl http://$SERVER_IP:3000/health"
    echo "   sudo pm2 logs boq-backend"
}

# Function to copy PEM file from Downloads
copy_pem_from_downloads() {
    echo ""
    echo "=== PEM FILE NOT FOUND ==="
    echo ""
    echo "Please manually copy the PEM file to this directory:"
    echo ""
    echo "Option 1: Copy using File Explorer"
    echo "1. Open File Explorer"
    echo "2. Navigate to: C:\\Users\\abaza\\Downloads\\"
    echo "3. Find: backend-key.pem"
    echo "4. Copy it to: $PROJECT_DIR"
    echo "5. Run this script again"
    echo ""
    echo "Option 2: Copy using Command Prompt"
    echo "copy \"C:\\Users\\abaza\\Downloads\\backend-key.pem\" \"$PROJECT_DIR\\backend-key.pem\""
    echo ""
    echo "Option 3: Copy using PowerShell"
    echo "Copy-Item \"C:\\Users\\abaza\\Downloads\\backend-key.pem\" \"$PROJECT_DIR\\backend-key.pem\""
}

# Main execution
main() {
    # Check if deployment package exists
    if [[ ! -f "$DEPLOY_PACKAGE" ]]; then
        echo "ERROR: Deployment package not found at $DEPLOY_PACKAGE" >&2
        echo "Make sure you're in the correct directory and the deploy.tar.gz exists" >&2
        exit 1
    fi
    
    echo "✓ Found deployment package: $DEPLOY_PACKAGE"
    
    # Find PEM file
    if ! PEM_FILE=$(find_pem_file); then
        copy_pem_from_downloads
        exit 1
    fi
    
    echo "✓ Using PEM file: $PEM_FILE"
    
    # Test connectivity first
    if ! test_connectivity; then
        echo ""
        echo "⚠️  WARNING: Cannot connect to server on port 22"
        echo "This could mean:"
        echo "  • EC2 instance is not running"
        echo "  • Security group doesn't allow SSH from your IP"
        echo "  • Network connectivity issues"
        echo ""
        echo "Attempting deployment anyway..."
    fi
    
    # Attempt deployment
    echo ""
    echo "🚀 Starting deployment to $SERVER_IP..."
    if deploy_via_ssh "$PEM_FILE"; then
        echo ""
        echo "🎉 DEPLOYMENT SUCCESSFUL!"
        echo ""
        echo "Your backend application is now running on the EC2 server."
        echo ""
        echo "Next Steps:"
        echo "1. Test the API: curl http://$SERVER_IP:3000/health"
        echo "2. Check logs: ssh -i \"$PEM_FILE\" ubuntu@$SERVER_IP \"sudo pm2 logs boq-backend\""
        echo "3. Monitor: ssh -i \"$PEM_FILE\" ubuntu@$SERVER_IP \"sudo pm2 monit\""
    else
        echo ""
        echo "❌ DEPLOYMENT FAILED!"
        show_troubleshooting "$PEM_FILE"
        exit 1
    fi
}

# Run main function
main "$@"