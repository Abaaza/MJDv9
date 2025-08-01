#!/bin/bash
# Setup SSL on EC2

echo "Setting up SSL/HTTPS..."

# Create SSL config
sudo tee /etc/nginx/conf.d/ssl.conf > /dev/null << 'EOF'
server {
    listen 443 ssl;
    server_name _;
    
    ssl_certificate /etc/pki/tls/certs/nginx.crt;
    ssl_certificate_key /etc/pki/tls/private/nginx.key;
    
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        
        add_header Access-Control-Allow-Origin https://main.d3j084kic0l1ff.amplifyapp.com always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Allow-Credentials true always;
        
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
    
    location / {
        return 200 '{"status":"ok","https":"enabled"}';
        add_header Content-Type application/json;
    }
}
EOF

# Test config
echo "Testing nginx config..."
sudo nginx -t

# Restart nginx
echo "Restarting nginx..."
sudo systemctl restart nginx

# Check ports
echo "Checking ports..."
sudo ss -tlnp | grep -E '443|80'

# Test HTTPS
echo "Testing HTTPS..."
curl -k https://localhost/

echo "Done! HTTPS is configured."