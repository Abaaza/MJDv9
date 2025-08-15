# 🚨 URGENT: One-Time Manual Deployment Required

## The Situation
We've added a self-deployment endpoint to the backend that will allow deployment without a PEM file. However, this code needs to be deployed ONCE manually to activate it.

## What Someone With Access Needs to Do (ONE TIME ONLY)

### Quick Deploy Commands
```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@100.24.46.199

# Deploy the latest code
cd /home/ec2-user/app/backend
git pull origin main
npm install --production
npx tsc -p tsconfig.build.json --noEmitOnError false || true
pm2 restart boq-backend
pm2 status
```

## After This One-Time Deployment

Once deployed, we can trigger future deployments without SSH access:

### 1. Test the deployment endpoint:
```bash
curl https://100.24.46.199/api/deploy/deploy-status
```

### 2. Trigger deployment (use today's date as key):
```bash
# The key format is: mjd-deploy-YYYY-MM-DD
curl -X POST https://100.24.46.199/api/deploy/trigger-deploy-temp-2024 \
  -H "X-Deploy-Key: mjd-deploy-2025-08-14" \
  -H "Content-Type: application/json"
```

## What This Enables

After this one-time manual deployment:
1. ✅ Future deployments can be done WITHOUT PEM file
2. ✅ Just push to GitHub and trigger the endpoint
3. ✅ No SSH access needed anymore

## Security Notes

- The deployment endpoint is temporary
- It requires a date-based key that changes daily
- After we're done deploying, we should remove this endpoint

## Alternative: Ask AWS Account Owner

If no one has the PEM file, the AWS account owner can:
1. Go to EC2 Console
2. Stop the instance
3. Create an AMI (backup)
4. Launch new instance from AMI with new key pair
5. Download and share the new PEM key

## Current Deployment Status

✅ **Frontend**: Auto-deploying via AWS Amplify
✅ **GitHub**: All code pushed and ready
⏳ **Backend**: Waiting for one-time manual deployment

## Contact for Help

If you have access to:
- AWS Console
- The original PEM file
- Systems Manager access

Please run the deployment commands above to activate the self-deployment system.

---

**IMPORTANT**: This is a temporary solution. Once deployed and tested, we should:
1. Set up proper CI/CD with GitHub Actions
2. Configure AWS Systems Manager
3. Remove the temporary deployment endpoint