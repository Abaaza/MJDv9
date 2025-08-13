#!/usr/bin/env python3
import json
import subprocess
import sys

def run_command(cmd):
    """Run a command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout, result.returncode

print("Updating CloudFront distribution for api-mjd.braunwell.io...")

distribution_id = "E22KB3OMRSSLLE"
new_origin_ip = "100.24.46.199"

# Get current configuration
print("[1] Getting current configuration...")
output, returncode = run_command(f"aws cloudfront get-distribution-config --id {distribution_id} --output json")
if returncode != 0:
    print(f"Error getting distribution config: {output}")
    sys.exit(1)

config = json.loads(output)
etag = config["ETag"]
dist_config = config["DistributionConfig"]

print(f"[2] Current origin: {dist_config['Origins']['Items'][0]['DomainName']}")
print(f"    Updating to: {new_origin_ip}")

# Update the origin
dist_config["Origins"]["Items"][0]["DomainName"] = new_origin_ip
dist_config["Origins"]["Items"][0]["CustomOriginConfig"]["OriginProtocolPolicy"] = "https-only"

# Save to file without BOM
with open("cloudfront-update.json", "w", encoding="utf-8") as f:
    json.dump(dist_config, f, indent=2)

print("[3] Applying CloudFront update...")
output, returncode = run_command(f'aws cloudfront update-distribution --id {distribution_id} --distribution-config file://cloudfront-update.json --if-match {etag}')

if returncode == 0:
    print("✓ CloudFront distribution updated successfully!")
    print(f"  Domain: api-mjd.braunwell.io")
    print(f"  New Origin: {new_origin_ip}")
    print("  Note: Changes will propagate globally in 5-10 minutes")
else:
    print(f"Error updating distribution: {output}")
    sys.exit(1)

print("\n[4] Ensuring backend CORS configuration...")
print("    The EC2 backend must have proper CORS headers configured")
print("    Nginx should include the following headers:")
print("      - Access-Control-Allow-Origin: https://mjd.braunwell.io")
print("      - Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS")
print("      - Access-Control-Allow-Headers: *")
print("      - Access-Control-Allow-Credentials: true")