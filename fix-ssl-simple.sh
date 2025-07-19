#!/bin/bash

echo "=== Simple SSL Fix for api-mjd.braunwell.io ==="

# Stop any existing nginx to free port 80
sudo systemctl stop nginx

# Install acme.sh
cd ~
if [ ! -d ~/.acme.sh ]; then
    curl https://get.acme.sh | sh
fi

# Get certificate using standalone mode
~/.acme.sh/acme.sh --issue -d api-mjd.braunwell.io --standalone

# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Install certificate
~/.acme.sh/acme.sh --install-cert -d api-mjd.braunwell.io \
--key-file /etc/nginx/ssl/api-mjd.key \
--fullchain-file /etc/nginx/ssl/api-mjd.crt

# Create proper Nginx config
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
        
        add_header 'Access-Control-Allow-Origin' 'https://mjd.braunwell.io' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
    }
}
EOF

# Start nginx
sudo systemctl start nginx
sudo systemctl reload nginx

# Update backend environment
cd /home/ec2-user/app/backend
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://mjd.braunwell.io|' .env
sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=https://mjd.braunwell.io|' .env

# Restart backend
pm2 restart boq-backend

echo "=== DONE! ==="
echo "Your API should now be available at https://api-mjd.braunwell.io"
echo "Test with: curl https://api-mjd.braunwell.io/api/health"