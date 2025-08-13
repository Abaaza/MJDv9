@echo off
echo Connecting to EC2 using AWS Systems Manager...
echo.
echo This requires AWS CLI configured with proper credentials
echo.

aws ssm start-session --target i-08aaff0571cba4906 --region us-east-1

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Failed to connect. Trying EC2 Instance Connect...
    echo.
    
    REM Generate temporary SSH key
    ssh-keygen -t rsa -f temp-key -N "" -q
    
    REM Send public key to EC2
    aws ec2-instance-connect send-ssh-public-key ^
        --instance-id i-08aaff0571cba4906 ^
        --instance-os-user ec2-user ^
        --ssh-public-key file://temp-key.pub ^
        --region us-east-1
    
    if %ERRORLEVEL% EQ 0 (
        echo Public key sent. Connecting...
        ssh -i temp-key -o StrictHostKeyChecking=no ec2-user@100.24.46.199
    ) else (
        echo.
        echo Both methods failed. You need to:
        echo 1. Find your original PEM file, or
        echo 2. Create a new EC2 instance with a new key pair
    )
    
    REM Clean up temp keys
    del temp-key temp-key.pub 2>nul
)

pause