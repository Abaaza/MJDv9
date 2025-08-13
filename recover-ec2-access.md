# How to Recover EC2 Access

## Option 1: Find Your Existing PEM Key
Look for files named:
- `boq-key-202507161911.pem`
- `mjd-backend-key.pem`
- Any `.pem` file in your Downloads or Documents

## Option 2: Create New Access (if PEM is lost)

### Method A: Create a new instance from AMI
1. Create an AMI from current instance
2. Launch new instance with new key pair
3. Download and save the new PEM key

### Method B: Use EC2 Instance Connect (if available)
```bash
aws ec2-instance-connect send-ssh-public-key \
    --instance-id i-08aaff0571cba4906 \
    --instance-os-user ec2-user \
    --ssh-public-key file://~/.ssh/id_rsa.pub \
    --region us-east-1
```

### Method C: Use Systems Manager Session Manager
```bash
aws ssm start-session --target i-08aaff0571cba4906 --region us-east-1
```

## Once You Have Your PEM Key

### 1. Set correct permissions (required)
```bash
# Windows (PowerShell as Administrator)
icacls "path\to\your-key.pem" /inheritance:r /grant:r "%username%:R"

# Mac/Linux
chmod 400 /path/to/your-key.pem
```

### 2. Connect to EC2
```bash
ssh -i "path/to/your-key.pem" ec2-user@100.24.46.199
```

### Full SSH Command Example
```bash
# Windows PowerShell
ssh -i "C:\Users\YourName\Downloads\your-key.pem" ec2-user@100.24.46.199

# Mac/Linux
ssh -i ~/Downloads/your-key.pem ec2-user@100.24.46.199

# With additional options for stability
ssh -i "your-key.pem" -o ServerAliveInterval=60 -o ServerAliveCountMax=3 ec2-user@100.24.46.199
```

## Common SSH Issues

### "Permission denied (publickey)"
- Wrong PEM file
- Incorrect file permissions
- Using wrong username (should be `ec2-user`)

### "Connection refused"
- Security group not allowing your IP
- Instance not running
- Wrong IP address

### "Operation timed out"
- Security group blocking port 22
- Network connectivity issue
- Instance in different VPC/subnet

## Test Your Connection
Once connected, test the backend:
```bash
pm2 status
curl http://localhost:5000/api/health
```

## Important Security Notes
1. NEVER share your PEM key file
2. NEVER commit PEM files to Git
3. Store PEM files securely on your local machine
4. Consider using AWS Systems Manager for keyless access