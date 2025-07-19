#!/bin/bash
echo "=== Fixing CORS Header Duplication ==="

# Update the origin nginx config to remove CORS headers (let Express handle them)
sudo tee /etc/nginx/conf.d/origin-mjd.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name origin-mjd.braunwell.io;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host api-mjd.braunwell.io;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        
        # NO CORS headers here - Express handles them
    }
}
EOF

# Also update the main api-mjd config if it exists
if [ -f /etc/nginx/conf.d/api-mjd.conf ]; then
    sudo tee /etc/nginx/conf.d/api-mjd.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name api-mjd.braunwell.io;
    
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
        
        # NO CORS headers - Express handles them
    }
}
EOF
fi

# Test and reload
sudo nginx -t && sudo systemctl reload nginx

echo "CORS duplication fixed! Express backend now handles all CORS headers."