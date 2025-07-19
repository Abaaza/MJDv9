#!/bin/bash
# Fix nginx to work with HTTP only
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
        
        add_header 'Access-Control-Allow-Origin' 'https://mjd.braunwell.io' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization,Content-Type' always;
    }
}
EOF

sudo nginx -t && sudo systemctl restart nginx
echo "API is now available at http://api-mjd.braunwell.io"