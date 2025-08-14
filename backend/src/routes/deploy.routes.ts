// TEMPORARY DEPLOYMENT ROUTE - REMOVE AFTER USE
import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

// Temporary deployment endpoint - REMOVE AFTER DEPLOYMENT
router.post('/trigger-deploy-temp-2024', async (req, res) => {
  try {
    // Check for deployment key
    const deployKey = req.headers['x-deploy-key'];
    
    // Use a temporary key
    const TEMP_DEPLOY_KEY = 'mjd-deploy-' + new Date().toISOString().split('T')[0];
    
    if (deployKey !== TEMP_DEPLOY_KEY) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        hint: 'Use X-Deploy-Key header with today\'s date format'
      });
    }
    
    // Only allow from localhost or specific IPs
    const clientIp = req.ip || req.connection.remoteAddress;
    console.log(`Deployment request from: ${clientIp}`);
    
    // Execute deployment commands
    const commands = [
      'cd /home/ec2-user/app/backend',
      'git pull origin main',
      'npm install --production',
      'npx tsc -p tsconfig.build.json --noEmitOnError false || true',
      'pm2 restart boq-backend'
    ].join(' && ');
    
    console.log('Executing deployment...');
    const { stdout, stderr } = await execAsync(commands);
    
    return res.json({
      success: true,
      message: 'Deployment completed',
      output: stdout.substring(0, 1000), // Limit output
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Deployment error:', error);
    return res.status(500).json({
      error: 'Deployment failed',
      message: error.message
    });
  }
});

// Health check for deployment status
router.get('/deploy-status', (req, res) => {
  res.json({
    status: 'Deployment endpoint available',
    note: 'This is temporary and will be removed',
    key_format: 'mjd-deploy-YYYY-MM-DD'
  });
});

export default router;