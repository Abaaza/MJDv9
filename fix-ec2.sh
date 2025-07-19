#!/bin/bash
echo "=== Fixing API Setup on EC2 ==="

# 1. Check and restart backend if needed
echo "[1] Checking backend status..."
pm2 status
pm2 restart boq-backend

# 2. Fix Nginx configuration
echo "[2] Fixing Nginx configuration..."
sudo tee /etc/nginx/conf.d/api-mjd.conf > /dev/null << 'NGINX'
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
NGINX

# 3. Remove any conflicting configs
echo "[3] Removing old configs..."
sudo rm -f /etc/nginx/conf.d/boq.conf
sudo rm -f /etc/nginx/conf.d/boq-ssl.conf
sudo rm -f /etc/nginx/conf.d/default.conf

# 4. Test and restart Nginx
echo "[4] Testing Nginx configuration..."
sudo nginx -t

echo "[5] Restarting Nginx..."
sudo systemctl restart nginx

# 5. Update backend environment
echo "[6] Updating backend environment..."
cd /home/ec2-user/app/backend
if [ -f .env ]; then
    sed -i 's|FRONTEND_URL=.*|FRONTEND_URL=https://mjd.braunwell.io|' .env
    sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN=https://mjd.braunwell.io|' .env
fi

# 6. Restart backend again with new env
echo "[7] Restarting backend with new environment..."
pm2 restart boq-backend

# 7. Wait for services to start
echo "[8] Waiting for services to start..."
sleep 5

# 8. Test the endpoints
echo "[9] Testing endpoints..."
echo "Testing localhost:5000..."
curl -s http://localhost:5000/api/health | jq . || echo "Local backend test failed"

echo ""
echo "Testing api-mjd.braunwell.io..."
curl -s http://api-mjd.braunwell.io/api/health | jq . || echo "Domain test failed"

echo ""
echo "=== Status Check ==="
pm2 status
sudo systemctl status nginx --no-pager

echo ""
echo "=== Fix Complete! ==="
echo "API should be available at: http://api-mjd.braunwell.io/api"
echo "Note: Using HTTP (no SSL) for simplicity"
