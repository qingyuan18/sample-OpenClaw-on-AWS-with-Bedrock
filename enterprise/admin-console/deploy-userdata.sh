#!/bin/bash
set -ex

# =============================================================================
# OpenClaw Enterprise Admin Console — User-Data Bootstrap
#
# NOTE: This script is for reference / manual deployment on the EC2 instance.
# deploy.sh does NOT run this automatically — you must execute Steps 4-5
# from the README after deploy.sh completes.
#
# For Ubuntu 24.04 (default AMI in CFN template):
#   - Uses python3 (3.12 pre-installed)
#   - Requires python3.12-venv (not installed by default)
#   - boto3/botocore must be upgraded for bedrock-agentcore API support
#
# For Amazon Linux 2023:
#   - Replace apt-get with yum
#   - python3.12-venv is not needed (venv works out of the box)
# =============================================================================

# Install dependencies (Ubuntu 24.04)
apt-get update -qq
apt-get install -y python3.12-venv
pip3 install --break-system-packages --upgrade boto3 botocore

# Clone repo
cd /home/ubuntu
git clone https://github.com/aws-samples/sample-OpenClaw-on-AWS-with-Bedrock.git app
cd app/enterprise/admin-console

# Build frontend
npm install
npx vite build

# Seed data — IMPORTANT: set DYNAMODB_REGION to match where your table lives.
# deploy.sh creates the table in DYNAMODB_REGION from .env (default: us-east-2).
# If you created it in us-east-1 (same region as the stack), change these accordingly.
cd server
DYNAMODB_REGION="${DYNAMODB_REGION:-us-east-1}"
AWS_REGION="$DYNAMODB_REGION" python3 seed_dynamodb.py --region "$DYNAMODB_REGION"
AWS_REGION="$DYNAMODB_REGION" python3 seed_roles.py --region "$DYNAMODB_REGION"
AWS_REGION="$DYNAMODB_REGION" python3 seed_audit_approvals.py --region "$DYNAMODB_REGION"
AWS_REGION="$DYNAMODB_REGION" python3 seed_settings.py --region "$DYNAMODB_REGION"
AWS_REGION="$DYNAMODB_REGION" python3 seed_knowledge.py --region "$DYNAMODB_REGION"
AWS_REGION="$DYNAMODB_REGION" python3 seed_ssm_tenants.py --region "${SSM_REGION:-us-east-1}" --stack "${STACK_NAME:-openclaw-enterprise}"

# Start the server
cat > /etc/systemd/system/openclaw-admin.service << 'SVCEOF'
[Unit]
Description=OpenClaw Admin Console
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/app/enterprise/admin-console/server
EnvironmentFile=-/etc/openclaw/env
Environment=CONSOLE_PORT=8099
ExecStart=/opt/admin-venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

chown -R ubuntu:ubuntu /home/ubuntu/app
systemctl daemon-reload
systemctl enable openclaw-admin
systemctl start openclaw-admin
