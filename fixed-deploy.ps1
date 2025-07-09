# Fixed Deploy to Azure Web App Script

$RESOURCE_GROUP = "Pricing-WE-RG"
$APP_NAME = "boq-matcher-windows"

Write-Host "Deploying to Azure Web App (Fixed)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Step 1: Configure Node.js and other settings
Write-Host "`nStep 1: Configuring app settings..." -ForegroundColor Green
az webapp config set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --use-32bit-worker-process false `
    --web-sockets-enabled true

az webapp config appsettings set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings `
    WEBSITE_NODE_DEFAULT_VERSION="18.17.1" `
    SCM_DO_BUILD_DURING_DEPLOYMENT="true" `
    WEBSITE_RUN_FROM_PACKAGE="0"

# Step 2: Enable proper logging
Write-Host "`nStep 2: Configuring logging..." -ForegroundColor Green
az webapp log config `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --application-logging filesystem `
    --level verbose `
    --web-server-logging filesystem

# Step 3: Handle file locks and create deployment package
Write-Host "`nStep 3: Creating deployment package..." -ForegroundColor Green

# Kill any processes that might have the CSV file open
Write-Host "  Closing any applications that might lock files..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -match "excel|EXCEL|notepad|csv"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Remove old package
if (Test-Path "deploy.zip") {
    Remove-Item "deploy.zip" -Force
}

# Create list of files to include
$IncludeList = "include-files.txt"
@"
backend\*
web.config
.deployment
deploy.cmd
package.json
package-lock.json
"@ | Out-File -FilePath $IncludeList -Encoding UTF8

# Create list of files to exclude
$ExcludeList = "exclude-files.txt"
@"
node_modules\*
.git\*
logs\*
*.log
uploads\*
temp-deploy\*
deploy.zip
backend\mjd_pricelist_extracted.csv
backend\*.csv
backend\uploads\*
backend\logs\*
"@ | Out-File -FilePath $ExcludeList -Encoding UTF8

# Check if 7-Zip is available
$sevenZip = "C:\Program Files\7-Zip\7z.exe"
if (Test-Path $sevenZip) {
    Write-Host "  Using 7-Zip to create archive..." -ForegroundColor Yellow
    
    # First attempt - try to include everything
    & $sevenZip a -tzip deploy.zip "@$IncludeList" "-xr@$ExcludeList"
    
    # If there were warnings about locked files, create archive without them
    if ($LASTEXITCODE -eq 1) {
        Write-Host "  Some files were locked, creating archive without them..." -ForegroundColor Yellow
        Remove-Item "deploy.zip" -Force -ErrorAction SilentlyContinue
        & $sevenZip a -tzip deploy.zip "@$IncludeList" "-xr@$ExcludeList" -ssw
    }
} else {
    Write-Host "  Using PowerShell compression..." -ForegroundColor Yellow
    
    # Create temp directory
    $tempDir = "temp-deploy"
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    
    # Copy backend folder excluding problematic files
    Write-Host "  Copying backend files..." -ForegroundColor Gray
    $backendDest = "$tempDir\backend"
    New-Item -ItemType Directory -Path $backendDest -Force | Out-Null
    
    # Copy backend subdirectories
    $backendItems = @("dist", "src", "scripts", "config")
    foreach ($item in $backendItems) {
        $sourcePath = "backend\$item"
        if (Test-Path $sourcePath) {
            robocopy $sourcePath "$backendDest\$item" /E /XD node_modules /XF *.csv *.log /NFL /NDL /NJH /NJS /nc /ns /np
        }
    }
    
    # Copy backend root files (excluding CSVs)
    Get-ChildItem "backend" -File | Where-Object { $_.Extension -ne ".csv" } | ForEach-Object {
        Copy-Item $_.FullName -Destination $backendDest -Force -ErrorAction SilentlyContinue
    }
    
    # Copy other essential files
    $essentialFiles = @("web.config", ".deployment", "deploy.cmd", "package.json", "package-lock.json")
    foreach ($file in $essentialFiles) {
        if (Test-Path $file) {
            Copy-Item $file -Destination $tempDir -Force
        }
    }
    
    # Create ZIP
    Compress-Archive -Path "$tempDir\*" -DestinationPath deploy.zip -Force -CompressionLevel Optimal
    Remove-Item $tempDir -Recurse -Force
}

# Clean up temp files
Remove-Item $IncludeList -Force -ErrorAction SilentlyContinue
Remove-Item $ExcludeList -Force -ErrorAction SilentlyContinue

$zipSize = (Get-Item deploy.zip).Length / 1MB
Write-Host "  Deployment package created: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Green

# Step 4: Deploy
Write-Host "`nStep 4: Deploying to Azure (this may take a few minutes)..." -ForegroundColor Green
az webapp deploy `
    --resource-group $RESOURCE_GROUP `
    --name $APP_NAME `
    --src-path deploy.zip `
    --type zip `
    --async false

# Step 5: Set up environment variables
Write-Host "`nStep 5: Setting environment variables..." -ForegroundColor Green
Write-Host "NOTE: You need to add your actual values for these:" -ForegroundColor Yellow

# Example - uncomment and add your actual values:
# az webapp config appsettings set `
#     --name $APP_NAME `
#     --resource-group $RESOURCE_GROUP `
#     --settings `
#     CONVEX_URL="your-convex-url" `
#     JWT_SECRET="your-jwt-secret" `
#     JWT_REFRESH_SECRET="your-jwt-refresh-secret" `
#     COHERE_API_KEY="your-cohere-key" `
#     OPENAI_API_KEY="your-openai-key"

# Step 6: Restart the app
Write-Host "`nStep 6: Restarting the app..." -ForegroundColor Green
az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP

Write-Host "`nDeployment completed!" -ForegroundColor Green
Write-Host "App URL: https://$APP_NAME.azurewebsites.net" -ForegroundColor Cyan

Write-Host "`nChecking deployment status..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
az webapp log deployment show -n $APP_NAME -g $RESOURCE_GROUP --deployment-id latest

Write-Host "`nUseful commands:" -ForegroundColor Yellow
Write-Host "View logs: az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP" -ForegroundColor Gray
Write-Host "Stream logs: az webapp log stream --name $APP_NAME --resource-group $RESOURCE_GROUP" -ForegroundColor Gray
Write-Host "Check deployment: az webapp log deployment list --name $APP_NAME --resource-group $RESOURCE_GROUP" -ForegroundColor Gray
Write-Host "Open in browser: start https://$APP_NAME.azurewebsites.net" -ForegroundColor Gray