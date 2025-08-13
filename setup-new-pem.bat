@echo off
echo ===================================
echo Setting up new PEM file for deployment
echo ===================================
echo.

set PEM_NAME=mjd-backend-key.pem
set DOWNLOADS=%USERPROFILE%\Downloads
set PROJECT_DIR=%CD%

echo Step 1: Create a new key pair in AWS Console
echo ----------------------------------------
echo 1. Go to: https://console.aws.amazon.com/ec2
echo 2. Navigate to: Key Pairs (under Network & Security)
echo 3. Click "Create key pair"
echo 4. Name: mjd-backend-key
echo 5. Type: RSA
echo 6. Format: .pem
echo 7. Click "Create key pair" to download
echo.
pause

echo.
echo Step 2: Copy PEM file to project
echo ----------------------------------------
if exist "%DOWNLOADS%\%PEM_NAME%" (
    echo Found %PEM_NAME% in Downloads folder
    copy "%DOWNLOADS%\%PEM_NAME%" "%PROJECT_DIR%\%PEM_NAME%"
    echo PEM file copied to project directory
    
    echo.
    echo Setting correct permissions...
    icacls "%PROJECT_DIR%\%PEM_NAME%" /inheritance:r
    icacls "%PROJECT_DIR%\%PEM_NAME%" /grant:r "%USERNAME%":"(R)"
    echo Permissions set successfully
) else (
    echo ERROR: %PEM_NAME% not found in Downloads folder
    echo Please download it from AWS Console first
)

echo.
echo Step 3: Test the connection
echo ----------------------------------------
echo To test your new PEM file, run:
echo ssh -i %PEM_NAME% ec2-user@13.218.146.247
echo.
pause