# Safe Backend Deployment Script with Backup
# Minimal memory usage version

Write-Host "`n=== SAFE BACKEND DEPLOYMENT ===" -ForegroundColor Cyan
Write-Host "This script will safely deploy your backend changes with backup" -ForegroundColor Yellow

$sshKey = "boq-key-202507161911.pem"
$ec2Instance = "ec2-user@13.218.146.247"

# Step 1: Build locally
Write-Host "`n[1] Building backend locally..." -ForegroundColor Yellow
Set-Location backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}
Set-Location ..

# Step 2: Create backup on EC2
Write-Host "`n[2] Creating backup on EC2..." -ForegroundColor Yellow
$backupCmd = @"
cd /home/ec2-user/app && 
cp -r backend backend-backup-\$(date +%Y%m%d-%H%M%S) && 
pm2 save && 
echo 'Backup created successfully'
"@
ssh -i $sshKey $ec2Instance $backupCmd

# Step 3: Deploy only changed files
Write-Host "`n[3] Deploying changes..." -ForegroundColor Yellow

# Copy only the compiled dist folder and essential files
scp -i $sshKey -r backend/dist $ec2Instance":/home/ec2-user/app/backend/"
scp -i $sshKey backend/package.json $ec2Instance":/home/ec2-user/app/backend/"
scp -i $sshKey backend/index.js $ec2Instance":/home/ec2-user/app/backend/"

# Step 4: Restart PM2
Write-Host "`n[4] Restarting application..." -ForegroundColor Yellow
ssh -i $sshKey $ec2Instance "cd /home/ec2-user/app/backend && pm2 restart boq-backend"

# Step 5: Verify deployment
Write-Host "`n[5] Verifying deployment..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
$healthCheck = ssh -i $sshKey $ec2Instance "curl -s -k https://localhost:5000/api/health"
Write-Host "Health check response: $healthCheck" -ForegroundColor Green

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host "Your dashboard fix has been deployed!" -ForegroundColor Green
Write-Host "`nTo rollback if needed, SSH to EC2 and run:" -ForegroundColor Yellow
Write-Host "cd /home/ec2-user/app && rm -rf backend && mv backend-backup-* backend && cd backend && pm2 restart boq-backend" -ForegroundColor Cyan