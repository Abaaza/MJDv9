#!/bin/bash

# Update all files with new IP address
OLD_IP="13.218.146.247"
NEW_IP="54.82.88.31"

echo "Updating all files from old IP ($OLD_IP) to new IP ($NEW_IP)..."

# Find all files containing the old IP and update them
find . -type f \( -name "*.sh" -o -name "*.ps1" -o -name "*.md" -o -name "*.yml" -o -name "*.txt" -o -name "*.bat" -o -name "*.js" \) -exec grep -l "$OLD_IP" {} \; | while read file; do
    echo "Updating: $file"
    sed -i "s/$OLD_IP/$NEW_IP/g" "$file"
done

echo "All files updated!"
echo "Don't forget to also update:"
echo "1. CloudFront distribution origins"
echo "2. Route53 DNS records"
echo "3. Any hardcoded IPs in the backend code"