#!/bin/bash

# AWS Credentials Setup Script

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================${NC}"
echo -e "${CYAN}   AWS Credentials Setup${NC}"
echo -e "${CYAN}================================${NC}"
echo

echo -e "${YELLOW}This script will help you configure AWS credentials.${NC}"
echo

# Check if AWS CLI is installed
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version)
    echo -e "${GREEN}AWS CLI is installed: $AWS_VERSION${NC}"
else
    echo -e "${RED}AWS CLI is not installed!${NC}"
    echo -e "${YELLOW}Please install it from: https://aws.amazon.com/cli/${NC}"
    exit 1
fi

echo
echo -e "${YELLOW}To get your AWS credentials:${NC}"
echo "1. Log in to AWS Console: https://console.aws.amazon.com/"
echo "2. Click your username (top right) -> Security credentials"
echo "3. Under 'Access keys', click 'Create access key'"
echo "4. Choose 'Command Line Interface (CLI)'"
echo "5. Download or copy the credentials"
echo

# Get credentials from user
read -p "Enter your AWS Access Key ID: " AWS_ACCESS_KEY_ID
read -s -p "Enter your AWS Secret Access Key: " AWS_SECRET_ACCESS_KEY
echo
read -p "Enter your preferred AWS Region [us-east-1]: " AWS_REGION

# Set default region if empty
AWS_REGION=${AWS_REGION:-us-east-1}

echo
echo -e "${YELLOW}Configuring AWS credentials...${NC}"

# Configure using AWS CLI
aws configure set aws_access_key_id "$AWS_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$AWS_SECRET_ACCESS_KEY"
aws configure set default.region "$AWS_REGION"

# Also create credentials file manually as backup
mkdir -p ~/.aws

# Create credentials file
cat > ~/.aws/credentials << EOF
[default]
aws_access_key_id = $AWS_ACCESS_KEY_ID
aws_secret_access_key = $AWS_SECRET_ACCESS_KEY
EOF

# Create config file
cat > ~/.aws/config << EOF
[default]
region = $AWS_REGION
output = json
EOF

# Set proper permissions
chmod 600 ~/.aws/credentials
chmod 600 ~/.aws/config

echo -e "${GREEN}Credentials saved to: ~/.aws${NC}"

# Test credentials
echo
echo -e "${YELLOW}Testing AWS credentials...${NC}"
if AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text 2>&1); then
    echo -e "${GREEN}SUCCESS! Connected to AWS Account: $AWS_ACCOUNT${NC}"
    echo
    
    # Check for key pairs
    echo -e "${YELLOW}Checking for EC2 key pairs...${NC}"
    KEY_PAIRS=$(aws ec2 describe-key-pairs --region $AWS_REGION --query 'KeyPairs[].KeyName' --output text 2>/dev/null)
    
    if [ -z "$KEY_PAIRS" ]; then
        echo -e "${YELLOW}No key pairs found. Would you like to create one? (y/n)${NC}"
        read -p "> " CREATE_KEY
        
        if [ "$CREATE_KEY" = "y" ] || [ "$CREATE_KEY" = "Y" ]; then
            read -p "Enter key pair name [mjd-backend-key]: " KEY_NAME
            KEY_NAME=${KEY_NAME:-mjd-backend-key}
            
            echo -e "${YELLOW}Creating key pair: $KEY_NAME${NC}"
            mkdir -p ~/.ssh
            
            # Create key pair
            aws ec2 create-key-pair --key-name "$KEY_NAME" --query 'KeyMaterial' --output text --region $AWS_REGION > ~/.ssh/${KEY_NAME}.pem
            
            # Set proper permissions
            chmod 400 ~/.ssh/${KEY_NAME}.pem
            
            echo -e "${GREEN}Key pair created and saved to: ~/.ssh/${KEY_NAME}.pem${NC}"
            echo -e "${YELLOW}IMPORTANT: Keep this file safe! You'll need it to SSH into your EC2 instances.${NC}"
        fi
    else
        echo -e "${GREEN}Existing key pairs found:${NC}"
        echo "$KEY_PAIRS" | tr '\t' '\n' | while read key; do
            echo "  - $key"
        done
    fi
    
    echo
    echo -e "${GREEN}AWS setup complete! You can now run the deployment script.${NC}"
    echo
    echo -e "${YELLOW}Next step:${NC}"
    echo "  ./deploy-backend-aws.sh"
    
else
    echo -e "${RED}ERROR: Failed to connect to AWS${NC}"
    echo -e "${RED}Error: $AWS_ACCOUNT${NC}"
    echo
    echo -e "${YELLOW}Please check:${NC}"
    echo "1. Your Access Key ID and Secret Access Key are correct"
    echo "2. Your AWS account has the necessary permissions"
    echo "3. You're not behind a proxy that blocks AWS access"
fi