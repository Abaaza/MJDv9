# Test all 6 matching methods with correct credentials
$testFile = "C:\Users\abaza\Downloads\TESTFILE.xlsx"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Testing All 6 BOQ Matching Methods" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Login with correct credentials
Write-Host "Logging in..." -ForegroundColor Yellow

$loginBody = @{
    email = "abaza@mjd.com"
    password = "abaza1234"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
    -Method POST `
    -Body $loginBody `
    -ContentType "application/json"

$token = $response.token
Write-Host "✓ Login successful as: $($response.user.name)" -ForegroundColor Green
Write-Host ""

# Test all methods
$methods = @("LOCAL", "COHERE", "COHERE_RERANK", "QWEN", "QWEN_RERANK", "OPENAI")

Write-Host "File: TESTFILE.xlsx" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

foreach ($method in $methods) {
    Write-Host "Testing $method method..." -ForegroundColor Yellow
    
    # Read file bytes
    $fileBytes = [System.IO.File]::ReadAllBytes($testFile)
    
    # Create multipart form
    Add-Type -AssemblyName System.Net.Http
    $client = New-Object System.Net.Http.HttpClient
    $client.DefaultRequestHeaders.Add("Authorization", "Bearer $token")
    $client.Timeout = [TimeSpan]::FromMinutes(5)
    
    $content = New-Object System.Net.Http.MultipartFormDataContent
    
    $fileContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList @(,$fileBytes)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    $content.Add($fileContent, "file", "TESTFILE.xlsx")
    
    $methodContent = New-Object System.Net.Http.StringContent -ArgumentList $method
    $content.Add($methodContent, "matchingMethod")
    
    $projectContent = New-Object System.Net.Http.StringContent -ArgumentList "Test $method - $(Get-Date -Format 'HH:mm:ss')"
    $content.Add($projectContent, "projectName")
    
    try {
        $startTime = Get-Date
        $response = $client.PostAsync("http://localhost:5000/api/price-matching/upload", $content).Result
        $responseContent = $response.Content.ReadAsStringAsync().Result
        $result = $responseContent | ConvertFrom-Json
        
        if ($result.jobId) {
            Write-Host "  ✓ Job created: $($result.jobId)" -ForegroundColor Green
            Write-Host "  Items to process: $($result.itemCount)" -ForegroundColor Gray
            
            # Monitor job status
            $maxWait = 120 # 2 minutes max
            $waited = 0
            $lastProgress = -1
            
            while ($waited -lt $maxWait) {
                Start-Sleep -Seconds 2
                $waited += 2
                
                $statusUrl = "http://localhost:5000/api/price-matching/status/$($result.jobId)"
                $statusResponse = Invoke-RestMethod -Uri $statusUrl `
                    -Method GET `
                    -Headers @{ Authorization = "Bearer $token" }
                
                if ($statusResponse.progress -ne $lastProgress) {
                    Write-Host "  Progress: $($statusResponse.progress)% - Status: $($statusResponse.status)" -ForegroundColor Gray
                    $lastProgress = $statusResponse.progress
                }
                
                if ($statusResponse.status -in @('completed', 'failed', 'error')) {
                    $duration = ((Get-Date) - $startTime).TotalSeconds
                    
                    if ($statusResponse.status -eq 'completed') {
                        Write-Host "  ✓ COMPLETED in $([math]::Round($duration, 1))s" -ForegroundColor Green
                        if ($statusResponse.matchedCount -ne $null) {
                            Write-Host "  Matched: $($statusResponse.matchedCount)/$($statusResponse.totalItems) items" -ForegroundColor Green
                        }
                        if ($statusResponse.unmatchedCount -gt 0) {
                            Write-Host "  Unmatched: $($statusResponse.unmatchedCount) items" -ForegroundColor Yellow
                        }
                    } else {
                        Write-Host "  ✗ FAILED: $($statusResponse.error)" -ForegroundColor Red
                    }
                    break
                }
            }
            
            if ($waited -ge $maxWait) {
                Write-Host "  ⚠ Timeout after 2 minutes" -ForegroundColor Yellow
            }
            
        } else {
            Write-Host "  ✗ Failed to create job" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ✗ Error: $_" -ForegroundColor Red
    } finally {
        $client.Dispose()
    }
    
    Write-Host ""
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check backend logs for detailed information about:" -ForegroundColor Yellow
Write-Host "  - API key usage" -ForegroundColor Gray
Write-Host "  - Fallback to LOCAL method (if API keys missing)" -ForegroundColor Gray
Write-Host "  - Matching service details" -ForegroundColor Gray
Write-Host '  - Batch processing information' -ForegroundColor Gray