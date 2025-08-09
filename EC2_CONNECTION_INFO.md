# EC2 Connection Information

## Instance Details
- **Instance ID**: i-08aaff0571cba4906
- **Public IP**: 54.82.88.31 (NEW - Changed after restart)
- **Old IP**: 13.218.146.247 (no longer valid)
- **Region**: us-east-1
- **Security Group**: sg-01e6d76ec6665d76e (boq-matching-sg)

## SSH Access
- **PEM File**: `mjd-backend-key-us.pem`
- **Location**: `C:\Users\abaza\OneDrive\Desktop\MJDv9\boq-matching-system\mjd-backend-key-us.pem`
- **User**: ec2-user

## Connect to EC2
```bash
ssh -i mjd-backend-key-us.pem ec2-user@54.82.88.31
```

## Deploy Backend
```bash
cd boq-matching-system/backend
npm run build
scp -i ../mjd-backend-key-us.pem -r dist package.json .env ec2-user@54.82.88.31:/home/ec2-user/app/backend/
ssh -i ../mjd-backend-key-us.pem ec2-user@54.82.88.31 "cd /home/ec2-user/app/backend && npm install --production && pm2 restart boq-backend"
```

## Backend Status
- **PM2 Process**: boq-backend
- **Port**: 3000
- **Health Check**: http://54.82.88.31:3000/health

## Important Notes
1. The IP address changed from 13.218.146.247 to 54.82.88.31 after instance restart
2. Both old key (boq-key-202507161911.pem) and new key (mjd-backend-key-us.pem) work
3. SSH access is allowed from IP: 41.69.152.54/32
4. Update your frontend .env file with the new IP address

## Update Frontend Configuration
In `frontend/.env`:
```
VITE_API_URL=http://54.82.88.31:3000/api
```

## AWS CLI Commands Used
```bash
# Created key pair
aws ec2 create-key-pair --key-name mjd-backend-key --region us-east-1 --query 'KeyMaterial' --output text > mjd-backend-key-us.pem

# Added SSH access
aws ec2 authorize-security-group-ingress --group-id sg-01e6d76ec6665d76e --protocol tcp --port 22 --cidr 41.69.152.54/32 --region us-east-1
```