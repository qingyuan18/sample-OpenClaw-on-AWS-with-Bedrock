# OpenClaw Enterprise 升级指南 — Cron 通知 + DynamoDB Float 修复

> 适用版本: 2026-04-24  
> 涉及组件: CloudFormation (SQS)、Agent Container (server.py)、EC2 Gateway (tenant_router.py)、Admin Console (db.py)

---

## 变更概要

| 变更项 | 文件 | 说明 |
|--------|------|------|
| SQS 队列 + IAM | `clawdbot-bedrock-agentcore-multitenancy.yaml` | 新增 `CronNotifyQueue`，microVM 发、EC2 收 |
| Cron 通知生产者 | `agent-container/server.py` | 新增 `/cron-notify` 端点 + SOUL.md 注入定时任务通知指令 |
| Cron 通知消费者 | `gateway/tenant_router.py` | 后台线程轮询 SQS，投递到钉钉/飞书等 IM |
| DynamoDB Float 修复 | `admin-console/server/db.py` | `_to_decimal()` 递归转换，修复 model override 保存 500 |

### 架构流程

```
Croner 定时触发 → openclaw agent CLI 执行任务
  → agent 按 SOUL.md 指令调 curl localhost:8080/cron-notify
    → server.py 发消息到 SQS
      → EC2 tenant_router.py 后台线程收 SQS
        → 查 DynamoDB MAPPING# 找到员工 IM channel
          → 调钉钉/飞书 oTo API 发送通知
```

---

## 环境变量

本文档使用以下变量，请替换为实际值：

```bash
export STACK_NAME="openclaw-enterprise"
export ACCOUNT_ID="687912291502"
export AWS_REGION="us-east-1"
export ECR_REPO="${STACK_NAME}-multitenancy-agent"
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
export S3_BUCKET="openclaw-tenants-${ACCOUNT_ID}"
```

---

## Step 1: 更新 CloudFormation 栈

新增 SQS 队列 `${STACK_NAME}-cron-notify` 和 IAM 权限。

`--capabilities CAPABILITY_NAMED_IAM` 是 CloudFormation 对含自定义名称 IAM 资源的强制确认。

```bash
aws cloudformation update-stack \
  --stack-name $STACK_NAME \
  --template-body file://enterprise/clawdbot-bedrock-agentcore-multitenancy.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION

# 等待完成（约 2-3 分钟）
aws cloudformation wait stack-update-complete \
  --stack-name $STACK_NAME --region $AWS_REGION

# 验证 SQS 队列
aws sqs get-queue-url \
  --queue-name ${STACK_NAME}-cron-notify --region $AWS_REGION
```

> **回滚**: 如果更新失败，CloudFormation 自动回滚。手动回滚: `aws cloudformation cancel-update-stack`

---

## Step 2: 上传修改文件到 S3 中转

从本地（或 git clone 目录）上传到 S3 `_deploy/` 前缀：

```bash
aws s3 cp enterprise/agent-container/server.py \
  s3://${S3_BUCKET}/_deploy/agent-container/server.py

aws s3 cp enterprise/gateway/tenant_router.py \
  s3://${S3_BUCKET}/_deploy/gateway/tenant_router.py

aws s3 cp enterprise/admin-console/server/db.py \
  s3://${S3_BUCKET}/_deploy/admin-console/server/db.py
```

---

## Step 3: EC2 上拉取文件

通过 SSM Session Manager 连接 EC2:

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME --region $AWS_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)

aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
```

在 EC2 上执行：

```bash
cd ~/sample-OpenClaw-on-AWS-with-Bedrock

# 拉取所有修改文件
aws s3 sync s3://openclaw-tenants-687912291502/_deploy/agent-container/ \
  enterprise/agent-container/ --region us-east-1

aws s3 sync s3://openclaw-tenants-687912291502/_deploy/gateway/ \
  enterprise/gateway/ --region us-east-1

aws s3 sync s3://openclaw-tenants-687912291502/_deploy/admin-console/ \
  enterprise/admin-console/ --region us-east-1

# 更新已部署的 admin console 和 gateway
sudo cp enterprise/admin-console/server/db.py /opt/admin-console/server/db.py
sudo cp enterprise/gateway/tenant_router.py /opt/gateway/tenant_router.py
```

---

## Step 4: 重建 Docker 镜像并推送 ECR

在 EC2 上执行：

```bash
cd ~/sample-OpenClaw-on-AWS-with-Bedrock/enterprise

ECR_URI="687912291502.dkr.ecr.us-east-1.amazonaws.com/openclaw-enterprise-multitenancy-agent"

# ECR 登录
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin $ECR_URI

# 构建 standard agent container
docker build --platform linux/arm64 \
  -f agent-container/Dockerfile \
  -t $ECR_URI:latest .

docker push $ECR_URI:latest

# （可选）如果使用 exec-agent，也需要构建
docker build --platform linux/arm64 \
  -f exec-agent/Dockerfile \
  -t $ECR_URI:exec-latest .

docker push $ECR_URI:exec-latest
```

> **注意**: 构建约需 5-10 分钟（取决于实例类型和缓存状态）

---

## Step 5: 重启 EC2 上的 Gateway 服务

```bash
# 重启 tenant router（加载 SQS consumer 线程）
sudo systemctl restart openclaw-tenant-router

# 重启 admin console（加载 db.py 修复）
sudo systemctl restart openclaw-admin

# 验证服务状态
sudo systemctl status openclaw-tenant-router --no-pager
sudo systemctl status openclaw-admin --no-pager

# 确认 SQS consumer 启动
journalctl -u openclaw-tenant-router -n 30 --no-pager | grep -i cron
```

> DingTalk Stream Bridge 不需要重启 — cron 通知由 tenant_router 直接调钉钉 API 投递。

---

## Step 6: Kill 旧 microVM session

AgentCore Runtime 更新镜像后，**已运行的 microVM 不会自动更新**，只有新启动的 microVM 使用新镜像。
需手动 stop 旧 session：

```bash
# 查询 Runtime ARN（替换为实际 runtime ID）
RUNTIME_ID=$(aws ssm get-parameter \
  --name "/openclaw/${STACK_NAME}/runtime-id" \
  --query Parameter.Value --output text --region $AWS_REGION 2>/dev/null)

RUNTIME_ARN="arn:aws:bedrock-agentcore:${AWS_REGION}:${ACCOUNT_ID}:runtime/${RUNTIME_ID}"

# 列出所有活跃 session
aws bedrock-agentcore list-runtime-sessions \
  --agent-runtime-arn $RUNTIME_ARN --region $AWS_REGION

# 逐个 stop（替换 SESSION_ID）
aws bedrock-agentcore stop-runtime-session \
  --agent-runtime-arn $RUNTIME_ARN \
  --runtime-session-id <SESSION_ID> \
  --region $AWS_REGION
```

如果有 exec runtime（高管专用），同样操作：

```bash
EXEC_RUNTIME_ID="<exec-runtime-id>"
EXEC_ARN="arn:aws:bedrock-agentcore:${AWS_REGION}:${ACCOUNT_ID}:runtime/${EXEC_RUNTIME_ID}"

aws bedrock-agentcore list-runtime-sessions \
  --agent-runtime-arn $EXEC_ARN --region $AWS_REGION

aws bedrock-agentcore stop-runtime-session \
  --agent-runtime-arn $EXEC_ARN \
  --runtime-session-id <SESSION_ID> \
  --region $AWS_REGION
```

---

## Step 7: 端到端验证

### 7.1 SQS 队列

```bash
# 确认队列存在且有权限
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/687912291502/${STACK_NAME}-cron-notify \
  --attribute-names ApproximateNumberOfMessages --region $AWS_REGION
```

### 7.2 Cron 通知 E2E 测试

在钉钉或 Portal 对 agent 说：

```
帮我设置一个 1 分钟后执行的定时任务，内容是：检查今天的天气并汇报
```

1 分钟后检查：
- 钉钉是否收到 `[定时任务] ...` 通知
- SQS 消息是否被消费（`ApproximateNumberOfMessages` 应为 0）
- tenant_router 日志: `journalctl -u openclaw-tenant-router -f | grep cron`

### 7.3 Model Override 修复验证

在 Admin Console 里设置一个 position 的 model override 为 Opus 4.6，保存应返回 200（不再 500）。

---

## 回滚

| 组件 | 回滚方式 |
|------|----------|
| CloudFormation | `aws cloudformation update-stack` 用原模板，或 Console 回滚 |
| Docker 镜像 | `docker tag $ECR_URI:previous $ECR_URI:latest && docker push` |
| EC2 文件 | 从 git 或 S3 恢复旧版本文件，重启服务 |
| microVM | stop session，下次请求自动拉新镜像 |

---

## 已知限制

1. **Cron 通知依赖 agent 遵守 SOUL.md 指令** — Claude Sonnet/Opus 模型可靠性高，但非100%。如需保证，需 fork OpenClaw 加 post-response hook。
2. **目前仅实现钉钉 IM 投递** — 飞书/Discord/Telegram 在 `tenant_router.py` `_deliver_im_message()` 中预留了分支，待后续实现。
3. **SQS 消息保留 24 小时** — 如果 EC2 tenant_router 长时间宕机，超过 24 小时的通知会丢失。
