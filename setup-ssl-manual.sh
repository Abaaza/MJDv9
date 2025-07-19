#!/bin/bash

echo "=== Manual SSL Setup for api-mjd.braunwell.io ==="

# Create SSL directory
sudo mkdir -p /etc/nginx/ssl

# Generate self-signed certificate temporarily
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/api-mjd.key \
  -out /etc/nginx/ssl/api-mjd.crt \
  -subj "/C=US/ST=State/L=City/O=MJD/CN=api-mjd.braunwell.io"

# Create Nginx configuration
sudo cat > /etc/nginx/conf.d/boq-ssl.conf << 'EOF'
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
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }
}
EOF

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

echo "=== SSL Setup Complete ==="
echo "Your API is now accessible at: https://api-mjd.braunwell.io"
echo ""
echo "Note: This uses a self-signed certificate. For production, use Let's Encrypt."
echo ""
echo "To install Let's Encrypt later:"
echo "1. sudo yum install -y python3"
echo "2. curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py"
echo "3. sudo python3 get-pip.py"
echo "4. sudo pip3 install certbot certbot-nginx"
echo "5. sudo certbot --nginx -d api-mjd.braunwell.io"