#!/bin/bash

echo "=== Enabling HTTPS for api-mjd.braunwell.io ==="

# Install socat (required for acme.sh)
echo "[1] Installing socat..."
sudo yum install -y socat

# Stop nginx temporarily
echo "[2] Stopping nginx to free port 80..."
sudo systemctl stop nginx

# Issue certificate
echo "[3] Getting SSL certificate..."
~/.acme.sh/acme.sh --issue -d api-mjd.braunwell.io --standalone --force

# Create SSL directory
echo "[4] Setting up SSL files..."
sudo mkdir -p /etc/nginx/ssl
sudo chown ec2-user:ec2-user /etc/nginx/ssl

# Install certificate
~/.acme.sh/acme.sh --install-cert -d api-mjd.braunwell.io \
--key-file /etc/nginx/ssl/api-mjd.key \
--fullchain-file /etc/nginx/ssl/api-mjd.crt

# Fix permissions
sudo chown -R root:root /etc/nginx/ssl
sudo chmod 600 /etc/nginx/ssl/*

# Update Nginx config for HTTPS
echo "[5] Updating Nginx configuration..."
sudo tee /etc/nginx/conf.d/api-mjd.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name api-mjd.braunwell.io;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name api-mjd.braunwell.io;

    ssl_certificate /etc/nginx/ssl/api-mjd.crt;
    ssl_certificate_key /etc/nginx/ssl/api-mjd.key;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' 'https://mjd.braunwell.io' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
        
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' 'https://mjd.braunwell.io' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
            add_header 'Access-Control-Max-Age' 86400;
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
EOF

# Start nginx
echo "[6] Starting nginx..."
sudo systemctl start nginx

echo "[7] Testing HTTPS..."
sleep 2
curl -k https://api-mjd.braunwell.io/api/health

echo ""
echo "=== HTTPS Enabled! ==="
echo "Your API is now available at: https://api-mjd.braunwell.io"