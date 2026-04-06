# OpenClaw Enterprise on AWS — Deployment Fixes & Addendum

> Companion document for [OpenClaw-on-AWS-with-Bedrock](https://github.com/Vivek0712/OpenClaw-on-AWS-with-Bedrock).
> Covers issues encountered during real-world deployment and the fixes required to get a fully working stack.
> Audience: DevOps engineers deploying this stack on AWS.

---

## TL;DR — What `deploy.sh` Does NOT Do

The `deploy.sh` script handles CloudFormation, Docker build, AgentCore runtime, and DynamoDB seeding. But **these components are NOT deployed automatically**:

| Component | Status after `deploy.sh` | Manual step required |
|-----------|------------------------|---------------------|
| Admin Console (port 8099) | ❌ Not installed | Step 4 in README |
| Gateway services (tenant-router, H2 proxy) | ❌ Not installed | Step 5 in README |
| `/etc/openclaw/env` config file | ❌ Not created | Step 7 in README |
| DynamoDB IAM permissions | ❌ Missing from CFN | Fix #1 below |
| boto3 version for AgentCore API | ❌ Too old on Ubuntu 24.04 | Fix #2 below |

**You must complete Steps 4, 5, 6, and 7 from the README manually after `deploy.sh` finishes.**

---

## Fix #1: DynamoDB IAM Permissions (CRITICAL)

### Problem
The CloudFormation template does NOT grant the EC2 instance role permission to access DynamoDB. The admin console and tenant router fail silently — employees appear empty, login returns "Employee not found."

### Symptoms
```
[db] DynamoDB query error: AccessDeniedException: User: arn:aws:sts::ACCOUNT:assumed-role/
openclaw-enterprise-OpenClawInstanceRole-XXXXX/i-XXXXX is not authorized to perform: 
dynamodb:Query on resource: arn:aws:dynamodb:REGION:ACCOUNT:table/openclaw-enterprise
```

### Fix
Add an inline policy to the EC2 instance role:

```bash
ROLE_NAME=$(aws cloudformation describe-stack-resources \
  --stack-name openclaw-enterprise --region us-east-1 \
  --query 'StackResources[?LogicalResourceId==`OpenClawInstanceRole`].PhysicalResourceId' \
  --output text)

aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name DynamoDBAccessPolicy \
  --policy-document '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:BatchGetItem", "dynamodb:BatchWriteItem"
    ],
    "Resource": [
      "arn:aws:dynamodb:YOUR_REGION:YOUR_ACCOUNT:table/openclaw-enterprise",
      "arn:aws:dynamodb:YOUR_REGION:YOUR_ACCOUNT:table/openclaw-enterprise/index/*"
    ]
  }]
}'
```

Replace `YOUR_REGION` and `YOUR_ACCOUNT` accordingly.

---

## Fix #2: boto3/botocore Version (CRITICAL)

### Problem
Ubuntu 24.04 ships with botocore 1.34.x. The `bedrock-agentcore` service was added in botocore ~1.38+. The tenant router crashes with:

```
botocore.exceptions.UnknownServiceError: Unknown service: 'bedrock-agentcore'
```

### Symptoms
Portal chat returns: *"I'm currently running in offline mode (AgentCore unavailable)."*

### Fix
```bash
# On the enterprise EC2 (via SSM):
pip3 install --break-system-packages --upgrade boto3 botocore
systemctl restart tenant-router
```

Verify:
```bash
python3 -c "import botocore; print(botocore.__version__)"
# Should be >= 1.38.0
```

---

## Fix #3: DynamoDB Region Mismatch

### Problem
The repo defaults to `DYNAMODB_REGION=us-east-2` in the `.env` template. If you created the DynamoDB table in `us-east-1` (same region as the stack), the admin console silently returns empty results — no error, just zero employees.

### Symptoms
- Login returns "Employee not found"
- `/api/v1/org/employees` returns `[]`
- No errors in logs (boto3 just queries an empty/nonexistent table in the wrong region)

### Fix
Ensure `/etc/openclaw/env` has the correct region:

```bash
# Check where your table actually lives:
aws dynamodb describe-table --table-name openclaw-enterprise --region us-east-1
aws dynamodb describe-table --table-name openclaw-enterprise --region us-east-2

# Fix /etc/openclaw/env on the EC2:
sed -i 's/DYNAMODB_REGION=us-east-2/DYNAMODB_REGION=us-east-1/' /etc/openclaw/env
sed -i 's/AWS_REGION=us-east-2/AWS_REGION=us-east-1/' /etc/openclaw/env
systemctl restart openclaw-admin tenant-router
```

---

## Fix #4: H2 Proxy Node.js Path

### Problem
The `bedrock-proxy-h2.service` file in the repo hardcodes the Node.js path to:
```
/home/ubuntu/.nvm/versions/node/v22.22.1/bin/node
```
Your instance may have a different Node.js version installed via nvm (e.g., v22.22.2).

### Symptoms
```
bedrock-proxy-h2.service: Main process exited, code=exited, status=203/EXEC
```

### Fix
Find the actual node path and update the service file:

```bash
NODE_PATH=$(su - ubuntu -c "which node")
# e.g., /home/ubuntu/.nvm/versions/node/v22.22.2/bin/node

sed -i "s|ExecStart=.*node |ExecStart=$NODE_PATH |" \
  /etc/systemd/system/bedrock-proxy-h2.service
systemctl daemon-reload && systemctl restart bedrock-proxy-h2
```

---

## Fix #5: H2 Proxy Requires openclaw-gateway.service

### Problem
The repo's `bedrock-proxy-h2.service` has:
```ini
After=network.target openclaw-gateway.service
Requires=openclaw-gateway.service
```
But the OpenClaw gateway may not be managed by systemd (it runs as a standalone process). This causes the H2 proxy to fail to start.

### Fix
Remove the hard dependency:

```ini
[Unit]
Description=OpenClaw Bedrock H2 Proxy
After=network.target
# Remove: Requires=openclaw-gateway.service
```

Or create a wrapper service for the gateway process.

---

## Fix #6: python3-venv Not Installed (Ubuntu 24.04)

### Problem
The admin console deployment (README Step 4) creates a Python venv, but Ubuntu 24.04 doesn't include `python3-venv` by default.

### Symptoms
```
The virtual environment was not created successfully because ensurepip is not available.
```

### Fix
```bash
apt-get update && apt-get install -y python3.12-venv
```

Run this before creating the admin console venv.

---

## Recommended: Secure Public Access with CloudFront + Cognito

The admin console listens on HTTP (port 8099). For production, front it with CloudFront + Cognito instead of relying solely on SSM port forwarding.

### Architecture
```
Browser → CloudFront (HTTPS) → Lambda@Edge (Cognito auth) → EC2:8099 (HTTP)
```

### Steps
1. **Allocate an Elastic IP** for the enterprise EC2 (CloudFront needs a stable origin)
2. **Create a Cognito User Pool** with `AllowAdminCreateUserOnly: true` (no self-signup)
3. **Create a Cognito App Client** with OAuth2 code flow
4. **Create a Lambda@Edge function** (viewer-request) that:
   - Checks for an auth cookie (`HttpOnly`, `Secure`, `SameSite=Lax`)
   - Redirects to Cognito hosted UI if missing/expired
   - Handles `/callback` to exchange auth code for JWT
5. **Create CloudFront distribution** with:
   - Origin: EC2 public DNS, port 8099, HTTP-only
   - Cache policy: `CachingDisabled` (admin console is dynamic)
   - Origin request policy: `AllViewerExceptHostHeader`
   - Lambda@Edge association on viewer-request
6. **Restrict EC2 security group** to CloudFront managed prefix list only

### Security Group Rule
```bash
CF_PREFIX=$(aws ec2 describe-managed-prefix-lists --region us-east-1 \
  --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
  --query 'PrefixLists[0].PrefixListId' --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --ip-permissions "IpProtocol=tcp,FromPort=8099,ToPort=8099,PrefixListIds=[{PrefixListId=$CF_PREFIX}]"
```

---

## Complete `/etc/openclaw/env` Reference

After all fixes, your env file should look like this:

```bash
STACK_NAME=openclaw-enterprise
AWS_REGION=us-east-1          # Must match where DynamoDB table lives
GATEWAY_REGION=us-east-1
SSM_REGION=us-east-1
GATEWAY_INSTANCE_ID=i-XXXXXXXXXXXXX
DYNAMODB_TABLE=openclaw-enterprise
DYNAMODB_REGION=us-east-1     # Must match AWS_REGION if table is in same region
S3_BUCKET=openclaw-tenants-XXXXXXXXXXXX
CONSOLE_PORT=8099
ECS_CLUSTER_NAME=openclaw-enterprise-always-on
ECS_TASK_DEFINITION=arn:aws:ecs:us-east-1:ACCOUNT:task-definition/openclaw-enterprise-always-on-agent:1
ECS_SUBNET_ID=subnet-XXXXX
ECS_TASK_SG_ID=sg-XXXXX
AGENTCORE_RUNTIME_ID=your_runtime_id
JWT_SECRET=<from SSM /openclaw/openclaw-enterprise/jwt-secret>
ADMIN_PASSWORD=<from SSM /openclaw/openclaw-enterprise/admin-password>
```

---

## Post-Deploy Verification Checklist

```bash
# 1. All services running?
systemctl status openclaw-admin tenant-router bedrock-proxy-h2

# 2. All ports listening?
ss -tlnp | grep -E '8090|8091|8092|8099|18789'
# Expected: 8090 (tenant-router), 8091/8092 (H2 proxy), 8099 (admin), 18789 (gateway)

# 3. DynamoDB accessible?
curl -s http://localhost:8099/api/v1/org/employees | python3 -c "import json,sys; print(f'Employees: {len(json.load(sys.stdin))}')"
# Expected: Employees: 20+

# 4. AgentCore reachable?
python3 -c "import boto3; c=boto3.client('bedrock-agentcore',region_name='us-east-1'); print('OK')"
# Expected: OK (no UnknownServiceError)

# 5. Login works?
ADMIN_PW=$(aws ssm get-parameter --name "/openclaw/openclaw-enterprise/admin-password" \
  --region us-east-1 --with-decryption --query 'Parameter.Value' --output text)
curl -s -X POST http://localhost:8099/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"employeeId\":\"emp-jiade\",\"password\":\"$ADMIN_PW\"}" | python3 -m json.tool
# Expected: JSON with "token" field
```

---

*Last updated: 2026-04-03. Based on deployment to us-east-1 on Ubuntu 24.04 (c7g.large, ARM64).*

