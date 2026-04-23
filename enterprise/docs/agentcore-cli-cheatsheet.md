# AgentCore CLI Cheatsheet

Quick reference for managing AgentCore Runtimes and microVM sessions via AWS CLI.

## Prerequisites

```bash
REGION=us-east-1
RUNTIME_ID="openclaw_enterprise_runtime-qpf34NCdk1"
RUNTIME_ARN="arn:aws:bedrock-agentcore:${REGION}:$(aws sts get-caller-identity --query Account --output text):runtime/${RUNTIME_ID}"
```

## Runtime Management (Control Plane)

### List runtimes

```bash
aws bedrock-agentcore-control list-agent-runtimes --region $REGION
```

### Get runtime details

```bash
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID --region $REGION
```

Key fields: `status`, `agentRuntimeVersion`, `lifecycleConfiguration` (idle timeout, max lifetime), `environmentVariables`, `agentRuntimeArtifact` (container URI).

### Update runtime (triggers all microVMs to refresh)

```bash
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<ECR_URI>:latest"}}' \
  --role-arn "<EXECUTION_ROLE_ARN>" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --region $REGION
```

**Warning:** This forces ALL microVMs to eventually rebuild with the new config. Use `stop-runtime-session` to target a single session instead.

### Update environment variables

```bash
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<ECR_URI>:latest"}}' \
  --role-arn "<EXECUTION_ROLE_ARN>" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --environment-variables '{"KEY":"value"}' \
  --region $REGION
```

## Session Management (Data Plane)

### Stop a single microVM session

```bash
aws bedrock-agentcore stop-runtime-session \
  --runtime-session-id "<SESSION_ID>" \
  --agent-runtime-arn $RUNTIME_ARN \
  --region $REGION
```

Session ID format: `<channel>__<employee_id>__<hash>` (e.g. `emp__emp-peter__061545a9be1287e7223`). Find it in CloudWatch logs — look for `tenant_id=` in invocation logs.

### Invoke runtime (for testing)

```bash
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn $RUNTIME_ARN \
  --runtime-session-id "test__manual__$(openssl rand -hex 8)" \
  --payload '{"prompt":"hello"}' \
  --region $REGION
```

## CloudWatch Logs

### Log group naming pattern

```
/aws/bedrock-agentcore/runtimes/<RUNTIME_ID>-DEFAULT
```

### Tail recent logs

```bash
LOG_GROUP="/aws/bedrock-agentcore/runtimes/${RUNTIME_ID}-DEFAULT"

aws logs filter-log-events \
  --log-group-name $LOG_GROUP \
  --start-time $(($(date +%s) - 300))000 \
  --region $REGION --limit 50
```

### Filter errors

```bash
aws logs filter-log-events \
  --log-group-name $LOG_GROUP \
  --filter-pattern "ERROR" \
  --start-time $(($(date +%s) - 3600))000 \
  --region $REGION --limit 20
```

### Filter by keyword

```bash
aws logs filter-log-events \
  --log-group-name $LOG_GROUP \
  --filter-pattern "?stderr ?Gateway ?fallback" \
  --start-time $(($(date +%s) - 3600))000 \
  --region $REGION --limit 20
```

## Container Image (ECR)

### Build and push

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/openclaw-enterprise-multitenancy-agent"

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

docker build -f enterprise/agent-container/Dockerfile -t ${ECR_URI}:latest enterprise/
docker push ${ECR_URI}:latest
```

### Verify image contents

```bash
docker run --rm --entrypoint cat ${ECR_URI}:latest /app/openclaw.json
```

### Check ECR push time

```bash
aws ecr describe-images \
  --repository-name openclaw-enterprise-multitenancy-agent \
  --image-ids imageTag=latest --region $REGION \
  --query 'imageDetails[0].imagePushedAt'
```

## Common Scenarios

| Scenario | Command |
|----------|---------|
| One user's agent broken | `stop-runtime-session` for that session |
| Pushed new image, need refresh | `stop-runtime-session` per affected session, or wait for idle timeout |
| Config change for all users | `update-agent-runtime` (forces version bump) |
| Debug agent 500 error | Check CloudWatch logs with `filter-pattern "ERROR"` |
| Check if microVM is using new image | Look for `[entrypoint] START` in recent logs |
