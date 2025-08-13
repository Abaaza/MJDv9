# EC2 Instance Access Information

## Instance Details
- **Instance ID**: i-08aaff0571cba4906
- **Public IP**: 100.24.46.199
- **Region**: us-east-1
- **Security Group**: sg-01e6d76ec6665d76e

## Open Ports
- **22**: SSH access (restricted to specific IPs)
- **80**: HTTP
- **443**: HTTPS  
- **5000**: Backend API

## Backend Access URLs
- **Direct Backend**: https://100.24.46.199/api
- **Via CloudFront**: https://api-mjd.braunwell.io/api
- **Health Check**: https://100.24.46.199/api/health

## DNS Configuration
- **origin-mjd.braunwell.io** → 100.24.46.199
- **api-mjd.braunwell.io** → CloudFront → origin-mjd.braunwell.io

## Backend Service
- **Process Manager**: PM2
- **Process Name**: boq-backend
- **Port**: 5000 (proxied through Nginx on 443)
- **Directory**: /home/ec2-user/app/backend

## Quick Commands (after SSH access)
```bash
# Check backend status
pm2 status

# View logs
pm2 logs boq-backend

# Restart backend
pm2 restart boq-backend

# Check Nginx
sudo systemctl status nginx

# View backend directory
cd /home/ec2-user/app/backend
```

## Important Notes
1. The PEM key file is required for SSH access
2. Backend runs on port 5000, proxied through Nginx
3. CORS is configured for https://mjd.braunwell.io
4. SSL certificate is configured in Nginx