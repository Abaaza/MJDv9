# Alternative Deployment Solution Without PEM File

Since you don't have the PEM file, here are alternative solutions to deploy your backend:

## Solution 1: GitHub Webhook Auto-Deploy (Recommended)

### Setup on EC2 (One-time setup - needs someone with access)

Someone with SSH access needs to set this up once:

1. **Create a webhook receiver script** on EC2:
```bash
# On EC2, create /home/ec2-user/app/webhook-deploy.js
const express = require('express');
const crypto = require('crypto');
const { exec } = require('child_process');
const app = express();

const SECRET = 'your-webhook-secret-here'; // Change this!

app.use(express.raw({ type: 'application/json' }));

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const hmac = crypto.createHmac('sha256', SECRET);
  const digest = 'sha256=' + hmac.update(req.body).digest('hex');
  
  if (signature !== digest) {
    return res.status(401).send('Unauthorized');
  }
  
  console.log('Deploying from GitHub...');
  exec('cd /home/ec2-user/app/backend && git pull && npm install --production && pm2 restart boq-backend', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error}`);
      return res.status(500).send('Deployment failed');
    }
    console.log(`Output: ${stdout}`);
    res.send('Deployment triggered');
  });
});

app.listen(9090, () => {
  console.log('Webhook listener on port 9090');
});
```

2. **Start the webhook listener**:
```bash
pm2 start /home/ec2-user/app/webhook-deploy.js --name webhook-listener
pm2 save
```

3. **Configure nginx to proxy webhook**:
```nginx
location /deploy-webhook {
    proxy_pass http://localhost:9090/webhook;
    proxy_set_header X-Real-IP $remote_addr;
}
```

4. **Add GitHub webhook**:
- Go to: https://github.com/Abaaza/MJDv9/settings/hooks
- Add webhook URL: https://100.24.46.199/deploy-webhook
- Secret: your-webhook-secret-here
- Events: Push events

## Solution 2: Use AWS Lambda for Deployment

Create a Lambda function that can SSH to your EC2:

```javascript
// Lambda function to deploy
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();
const ec2 = new AWS.EC2();

exports.handler = async (event) => {
    const params = {
        DocumentName: "AWS-RunShellScript",
        InstanceIds: ["i-08aaff0571cba4906"],
        Parameters: {
            commands: [
                "cd /home/ec2-user/app/backend",
                "git pull origin main",
                "npm install --production",
                "npx tsc -p tsconfig.build.json --noEmitOnError false || true",
                "pm2 restart boq-backend",
                "pm2 status"
            ]
        }
    };
    
    try {
        const result = await ssm.sendCommand(params).promise();
        return {
            statusCode: 200,
            body: JSON.stringify('Deployment triggered')
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify('Deployment failed: ' + error.message)
        };
    }
};
```

## Solution 3: Create a Simple Deploy API Endpoint

Add this to your backend (temporarily):

```javascript
// In your backend routes (REMOVE AFTER DEPLOYMENT)
app.post('/api/deploy-backend-temp-2024', async (req, res) => {
  const deployKey = req.headers['x-deploy-key'];
  
  if (deployKey !== 'your-secret-deploy-key-2024') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { exec } = require('child_process');
  
  exec('cd /home/ec2-user/app/backend && git pull && npm install --production && pm2 restart boq-backend', 
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error}`);
        return res.status(500).json({ error: 'Deployment failed' });
      }
      res.json({ 
        message: 'Deployment successful',
        output: stdout
      });
  });
});
```

Then trigger deployment:
```bash
curl -X POST https://100.24.46.199/api/deploy-backend-temp-2024 \
  -H "X-Deploy-Key: your-secret-deploy-key-2024"
```

## Solution 4: Use GitHub Actions with AWS Credentials

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to EC2

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to EC2
      env:
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      run: |
        aws ssm send-command \
          --document-name "AWS-RunShellScript" \
          --instance-ids "i-08aaff0571cba4906" \
          --parameters commands='["cd /home/ec2-user/app/backend","git pull","npm install --production","pm2 restart boq-backend"]' \
          --region us-east-1
```

## Solution 5: Request New PEM Key from AWS Account Owner

The AWS account owner can:
1. Stop the instance
2. Create an AMI (backup)
3. Launch a new instance from AMI with new key pair
4. Download and share the new PEM key

## Immediate Workaround

Since the frontend auto-deploys via Amplify and you've already pushed to GitHub, the frontend changes are live. The backend will work with the current version until someone with access can deploy.

The critical changes (rate limiting, new methods) are mostly frontend-facing and will partially work even without the backend update.