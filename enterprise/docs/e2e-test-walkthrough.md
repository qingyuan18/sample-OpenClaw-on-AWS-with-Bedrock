# E2E Test Walkthrough — Ready to Run

> Stack: `openclaw-e2e-test` | Region: `us-west-2` | EC2: `i-036bfe702e14e2866`

---

## 1. Access Admin Console

```bash
# Terminal 1: Port forward (keep open)
aws ssm start-session --target i-036bfe702e14e2866 --region us-west-2 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8099"],"localPortNumber":["8099"]}'
```

Open browser: http://localhost:8099

Login:
- Employee ID: `emp-jiade`
- Password: `E2eTest2026!`

---

## 2. Set Up IM Bots

IM channel setup is the same as a standard OpenClaw EC2 deployment — SSM into the machine and use the Gateway Web UI.

```bash
# Terminal 2: Port forward to Gateway UI (keep open)
aws ssm start-session --target i-036bfe702e14e2866 --region us-west-2 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["18789"],"localPortNumber":["18789"]}'
```

Get gateway token:
```bash
aws ssm get-parameter \
  --name "/openclaw/openclaw-e2e-test/gateway-token" \
  --with-decryption --query Parameter.Value --output text --region us-west-2
```

Open browser: `http://localhost:18789/?token=<paste token here>`

→ **Channels** → select platform → follow the setup wizard

**Each platform has its own setup process** — refer to the official OpenClaw channel guides:
- Full documentation: https://docs.openclaw.ai/channels
- Telegram, Discord, Slack, WhatsApp, Feishu/Lark, Microsoft Teams, Google Chat are all supported
- The setup experience is the same as a standard single-instance OpenClaw deployment

**Quick verify after setup:**
```bash
# SSM into EC2
aws ssm start-session --target i-036bfe702e14e2866 --region us-west-2
sudo su - ubuntu
openclaw channels list
```

---

## 3. SSM Shell (Direct EC2 Access)

```bash
aws ssm start-session --target i-036bfe702e14e2866 --region us-west-2
```

Check services:
```bash
systemctl is-active openclaw-admin tenant-router bedrock-proxy-h2 openclaw-gateway
ss -tlnp | grep -E '8090|8091|8099|18789'
```

Check config:
```bash
cat /etc/openclaw/env
```

Check DynamoDB:
```bash
curl -s http://localhost:8099/api/v1/org/employees | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Employees: {len(d)}')"
```

Check S3 templates:
```bash
aws s3 ls s3://openclaw-e2e-test-263168716248/_shared/soul/global/ --region us-west-2
```

---

## 4. Admin Day-1 Checklist

| # | Task | Where |
|---|------|-------|
| 1 | Login as admin | http://localhost:8099 → emp-jiade / E2eTest2026! |
| 2 | Check Dashboard | Sidebar → Dashboard |
| 3 | Review org structure | Sidebar → Organization → Departments / Positions / Employees |
| 4 | Edit Global SOUL | Sidebar → Security Center → Policies tab → "Edit Global SOUL" |
| 5 | Edit Position SOUL | Organization → Positions → click any position → SOUL tab → Edit |
| 6 | Assign a skill | Sidebar → Skill Market → click a skill → Assign to Position |
| 7 | Test Playground | Sidebar → Playground → select employee → send message |
| 8 | Set up IM bot | Gateway UI (localhost:18789) → Channels → Add bot token |
| 9 | Check IM status | Admin Console → IM Channels → Refresh |

---

## 5. Employee Portal Test

```bash
# Same port forward as Admin Console (port 8099)
```

Open browser: http://localhost:8099/portal

Login as any employee:
- `emp-carol` / `E2eTest2026!` (Finance Analyst)
- `emp-ryan` / `E2eTest2026!` (Software Engineer)
- `emp-sarah` / `E2eTest2026!` (Solutions Architect)

Test:
- Portal → Chat → "who are you?"
- Portal → My Profile
- Portal → My Skills
- Portal → Connect IM (if IM bot configured)

---

## 6. Key Resources

| Resource | Value |
|----------|-------|
| Stack | `openclaw-e2e-test` |
| Region | `us-west-2` |
| EC2 Instance | `i-036bfe702e14e2866` |
| S3 Bucket | `openclaw-e2e-test-263168716248` |
| DynamoDB Table | `openclaw-e2e-test` (us-west-2) |
| AgentCore Runtime | `openclaw_e2e_test_runtime-u8Gvk2AWBV` |
| ECR | `263168716248.dkr.ecr.us-west-2.amazonaws.com/openclaw-e2e-test-agent-container` |
| Admin URL | http://localhost:8099 (via SSM port-forward) |
| Gateway URL | http://localhost:18789/?token=\<from SSM\> (via SSM port-forward) |
| Admin Login | emp-jiade / E2eTest2026! |

---

## 7. Cleanup (After Testing)

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name openclaw-e2e-test --region us-west-2

# Delete DynamoDB table
aws dynamodb delete-table --table-name openclaw-e2e-test --region us-west-2

# Delete SSM parameters
aws ssm delete-parameters --names \
  "/openclaw/openclaw-e2e-test/admin-password" \
  "/openclaw/openclaw-e2e-test/jwt-secret" \
  "/openclaw/openclaw-e2e-test/gateway-token" \
  "/openclaw/openclaw-e2e-test/runtime-id" \
  --region us-west-2

# Delete AgentCore Runtime (optional)
aws bedrock-agentcore-control delete-agent-runtime \
  --agent-runtime-id openclaw_e2e_test_runtime-u8Gvk2AWBV \
  --region us-west-2
```
