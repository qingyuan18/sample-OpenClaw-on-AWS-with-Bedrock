# OpenClaw Enterprise 升级指南

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
| Gateway Proxy 路由 | `ec2-setup.sh` | Gateway 的 Bedrock 请求重定向到 H2 Proxy |

### 架构流程

```
IM 消息流（飞书/Discord/Telegram 等内置插件）：
  用户 → Gateway 内置插件 (18789)
       → AWS SDK Bedrock API 调用
       → H2 Proxy (8091) 拦截，提取 channel + user_id
       → Tenant Router (8090) 查 DDB 映射
       → AgentCore microVM 执行

IM 消息流（钉钉 — 独立 bridge）：
  用户 → DingTalk Stream WebSocket
       → dingtalk_stream_bridge.py
       → H2 Proxy (8092, HTTP/1.1)
       → Tenant Router → AgentCore

Cron 定时任务通知：
  Croner 定时触发 → openclaw agent CLI 执行任务
    → agent 按 SOUL.md 指令调 curl localhost:8080/cron-notify
      → server.py 发消息到 SQS
        → EC2 tenant_router.py 后台线程收 SQS
          → 查 DynamoDB MAPPING# 找到员工 IM channel
            → 调钉钉/飞书 oTo API 发送通知
```

---

## 环境变量

```bash
export STACK_NAME="openclaw-enterprise"
export ACCOUNT_ID="687912291502"
export AWS_REGION="us-east-1"
export ECR_REPO="${STACK_NAME}-multitenancy-agent"
export ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
export S3_BUCKET="openclaw-tenants-${ACCOUNT_ID}"
```

---

## 升级方式选择

### 方式 A: 使用 deploy.sh（推荐）

如果 EC2 未被重建，可以直接使用 deploy.sh 增量更新：

```bash
# 仅更新 EC2 上的服务（admin console + gateway + tenant_router），不重建 Docker 镜像
bash enterprise/deploy.sh --skip-build --skip-seed

# 仅更新 Docker 镜像，不动 EC2 服务
bash enterprise/deploy.sh --skip-services --skip-seed

# 全量更新（Docker 镜像 + EC2 服务），不重刷 DDB 种子数据
bash enterprise/deploy.sh --skip-seed
```

deploy.sh 会自动：
1. 更新 CloudFormation 栈（如有变更）
2. 在 EC2 上构建并推送 Docker 镜像到 ECR
3. 更新/创建 AgentCore Runtime
4. 上传 SOUL 模板到 S3
5. 写入 `/etc/openclaw/env`
6. 运行 `ec2-setup.sh`（构建 admin console、安装 gateway 文件、重启所有服务）

### 方式 B: 手动分步升级

适用于只需更新个别组件、或 deploy.sh 不适用的场景。

---

## 手动升级步骤

### Step 1: 更新 CloudFormation 栈

> **⚠️ 警告：不要修改 UserData 内容！**  
> CloudFormation 的 `AWS::EC2::Instance` 中 UserData 是 replacement 属性。  
> 任何对 UserData 的修改都会导致 EC2 实例被**替换**（旧实例 terminate + 新实例 launch），  
> 丢失所有 EC2 上的服务配置、IM channel 配置、dingtalk bridge 等。  
> 如需添加新的动态值（如 SQS Queue URL），使用 SSM Parameter Store 在运行时读取，不要写入 UserData。

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

### Step 2: 上传修改文件到 S3 中转

从本地上传到 S3 `_deploy/` 前缀：

```bash
aws s3 cp enterprise/agent-container/server.py \
  s3://${S3_BUCKET}/_deploy/agent-container/server.py

aws s3 cp enterprise/gateway/tenant_router.py \
  s3://${S3_BUCKET}/_deploy/gateway/tenant_router.py

aws s3 cp enterprise/admin-console/server/db.py \
  s3://${S3_BUCKET}/_deploy/admin-console/server/db.py
```

---

### Step 3: EC2 上拉取文件

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

# 更新已部署的文件
sudo cp enterprise/admin-console/server/db.py /opt/admin-console/server/db.py
cp enterprise/gateway/tenant_router.py /home/ubuntu/tenant_router.py
```

---

### Step 4: 重建 Docker 镜像并推送 ECR

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
```

> **注意**: 构建约需 5-10 分钟

---

### Step 5: 重启 EC2 上的服务

```bash
# 重启 tenant router（加载 SQS consumer 线程）
sudo systemctl restart tenant-router

# 重启 admin console（加载 db.py 修复）
sudo systemctl restart openclaw-admin

# 重启 Gateway（加载新配置）
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart openclaw-gateway

# 验证服务状态
sudo systemctl status tenant-router --no-pager
sudo systemctl status openclaw-admin --no-pager
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user status openclaw-gateway --no-pager
sudo systemctl status bedrock-proxy-h2 --no-pager

# 确认 SQS consumer 启动
journalctl -u tenant-router -n 30 --no-pager | grep -i cron
```

> DingTalk Stream Bridge (`dingtalk-stream-bridge.service`) 不需要重启 — cron 通知由 tenant_router 直接调钉钉 API 投递。

---

### Step 6: Kill 旧 microVM session

AgentCore Runtime 更新镜像后，**已运行的 microVM 不会自动更新**，只有新启动的 microVM 使用新镜像。

```bash
RUNTIME_ID=$(aws ssm get-parameter \
  --name "/openclaw/$STACK_NAME/runtime-id" \
  --query Parameter.Value --output text --region $AWS_REGION)

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

---

### Step 7: 端到端验证

#### 7.1 SQS 队列

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/687912291502/${STACK_NAME}-cron-notify \
  --attribute-names ApproximateNumberOfMessages --region $AWS_REGION
```

#### 7.2 Cron 通知 E2E 测试

在钉钉或飞书上对 agent 说：

```
帮我设置一个 1 分钟后执行的定时任务，内容是：检查今天的天气并汇报
```

1 分钟后检查：
- IM 是否收到 `[定时任务] ...` 通知
- SQS 消息是否被消费（`ApproximateNumberOfMessages` 应为 0）
- tenant_router 日志: `journalctl -u tenant-router -f | grep cron`

#### 7.3 Model Override 修复验证

在 Admin Console 里设置一个 position 的 model override 为 Opus 4.6，保存应返回 200（不再 500）。

---

## EC2 被重建后的恢复步骤

> 如果 CloudFormation update 意外替换了 EC2 实例（例如修改了 UserData），需要重新配置所有服务。
> DynamoDB 数据不受影响（独立于 EC2），SSM Parameter Store 数据也保留。

### 快速恢复（推荐）

使用 deploy.sh 自动恢复所有服务：

```bash
# 从本地开发机执行
bash enterprise/deploy.sh --skip-build --skip-seed
```

这会自动：写入 `/etc/openclaw/env` → 运行 `ec2-setup.sh`（构建 admin console、安装 gateway、启动所有 systemd 服务）。

如果 Docker 镜像也需要重建（ECR 镜像还在，通常不需要）：

```bash
bash enterprise/deploy.sh --skip-seed
```

### 手动恢复

如果 deploy.sh 不可用，或需要恢复额外的手动配置：

#### 1. 等待 EC2 就绪

新 EC2 由 CloudFormation UserData 自动安装 Node.js、OpenClaw、Docker 等基础组件。
等待 CloudFormation WaitCondition 完成（约 10-15 分钟），或通过 SSM 检查：

```bash
INSTANCE_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME --region $AWS_REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)

# 等待 SSM 可达
aws ssm start-session --target $INSTANCE_ID --region $AWS_REGION
```

#### 2. 写入 /etc/openclaw/env

ec2-setup.sh 依赖此文件。查看 deploy.sh Step 7 了解完整内容：

```bash
sudo mkdir -p /etc/openclaw

# 从 SSM 获取 runtime-id
RUNTIME_ID=$(aws ssm get-parameter \
  --name "/openclaw/$STACK_NAME/runtime-id" \
  --query Parameter.Value --output text --region us-east-1)

sudo cat > /etc/openclaw/env << EOF
STACK_NAME=openclaw-enterprise
AWS_REGION=us-east-1
SSM_REGION=us-east-1
GATEWAY_REGION=us-east-1
S3_BUCKET=openclaw-tenants-687912291502
DYNAMODB_TABLE=openclaw-enterprise
DYNAMODB_REGION=us-east-2
AGENTCORE_RUNTIME_ID=$RUNTIME_ID
BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0
EOF
```

#### 3. 运行 ec2-setup.sh

```bash
cd /tmp && rm -rf openclaw-services && mkdir openclaw-services && cd openclaw-services

# 从 S3 拉取最新的服务包（deploy.sh Step 8 上传的）
aws s3 cp s3://openclaw-tenants-687912291502/_deploy/services.tar.gz . --region us-east-1
tar xzf services.tar.gz
sudo bash enterprise/ec2-setup.sh
```

ec2-setup.sh 会自动完成：
- 构建 admin console 前端
- 安装 Python venv
- 复制 admin console → `/opt/admin-console/`
- 复制 gateway 文件 → `/home/ubuntu/`
- 安装并启动 systemd 服务：`openclaw-admin`, `tenant-router`, `bedrock-proxy-h2`
- 重启 `openclaw-gateway`

#### 4. 配置 Gateway Proxy 路由

ec2-setup.sh 会自动修改 `openclaw.json` 的 `baseUrl`，但关键的环境变量需要手动配置：

```bash
# 创建 Gateway systemd drop-in，重定向 Bedrock 请求到 H2 Proxy
mkdir -p /home/ubuntu/.config/systemd/user/openclaw-gateway.service.d
cat > /home/ubuntu/.config/systemd/user/openclaw-gateway.service.d/proxy.conf << 'EOF'
[Service]
Environment=AWS_ENDPOINT_URL_BEDROCK_RUNTIME=http://127.0.0.1:8091
EOF

chown -R ubuntu:ubuntu /home/ubuntu/.config/systemd/user/openclaw-gateway.service.d

sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user daemon-reload
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart openclaw-gateway
```

> **重要**：仅修改 `openclaw.json` 的 `baseUrl` 不够！AWS SDK 不读取该配置。  
> 必须设置 `AWS_ENDPOINT_URL_BEDROCK_RUNTIME` 环境变量才能让飞书、Discord 等  
> 内置 IM 插件的 Bedrock 请求走 H2 Proxy → Tenant Router → AgentCore 管线。

#### 5. 恢复钉钉 Stream Bridge

```bash
# 创建 service 文件
sudo cat > /etc/systemd/system/dingtalk-stream-bridge.service << 'EOF'
[Unit]
Description=DingTalk Stream Bridge for OpenClaw Enterprise
After=network.target bedrock-proxy-h2.service
Wants=bedrock-proxy-h2.service

[Service]
Type=simple
User=ubuntu
Environment=DINGTALK_APP_KEY=dingnkmsdricbc9f98ed
Environment=DINGTALK_APP_SECRET=oSK2B2qCDPw9au09yo45BCGWfC0yLOQc1wmZKnBy3g0B-V5E0jnJp6ulM5g5ZG0B
Environment=H2_PROXY_URL=http://127.0.0.1:8092
ExecStart=/usr/bin/python3 /home/ubuntu/dingtalk_stream_bridge.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 复制 bridge 脚本
cp enterprise/gateway/dingtalk_stream_bridge.py /home/ubuntu/dingtalk_stream_bridge.py
chown ubuntu:ubuntu /home/ubuntu/dingtalk_stream_bridge.py

# 安装依赖
pip3 install --break-system-packages websocket-client

# 启动
sudo systemctl daemon-reload
sudo systemctl enable dingtalk-stream-bridge
sudo systemctl start dingtalk-stream-bridge
```

#### 6. 恢复 tenant-router 钉钉投递能力

tenant-router 的 cron 通知投递需要钉钉凭证：

```bash
sudo cat > /etc/openclaw/tenant-router-env << 'EOF'
DINGTALK_APP_KEY=dingnkmsdricbc9f98ed
DINGTALK_APP_SECRET=oSK2B2qCDPw9au09yo45BCGWfC0yLOQc1wmZKnBy3g0B-V5E0jnJp6ulM5g5ZG0B
EOF

sudo systemctl restart tenant-router
```

#### 7. 恢复飞书 Channel 配置

```bash
python3 << 'PYEOF'
import json
p = "/home/ubuntu/.openclaw/openclaw.json"
c = json.load(open(p))
feishu = c.setdefault("channels", {}).setdefault("feishu", {})
feishu["appId"] = "cli_a95e1e1535f89bd6"
feishu["appSecret"] = "HkEMwG3vjbwNLdVwrxHrG2kdDuOxaxUj"
feishu["dmPolicy"] = "open"
feishu["groupPolicy"] = "open"
json.dump(c, open(p, "w"), indent=2)
print("Feishu config restored")
PYEOF

sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart openclaw-gateway
```

#### 8. 恢复 Discord Channel 配置

Discord bot token 通过 Gateway Web UI 配置：

```bash
# 获取 Gateway token
TOKEN=$(aws ssm get-parameter \
  --name "/openclaw/$STACK_NAME/gateway-token" \
  --with-decryption --query Parameter.Value --output text --region us-east-1)

# 端口转发（在本地机器执行）
aws ssm start-session --target $INSTANCE_ID --region us-east-1 \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["18789"],"localPortNumber":["18789"]}'

# 浏览器打开 http://localhost:18789/?token=$TOKEN
# → Channels → Discord → 配置 Bot Token
```

或直接写入配置文件：

```bash
python3 << 'PYEOF'
import json
p = "/home/ubuntu/.openclaw/openclaw.json"
c = json.load(open(p))
discord = c.setdefault("channels", {}).setdefault("discord", {})
discord["token"] = "<YOUR_DISCORD_BOT_TOKEN>"
discord["groupPolicy"] = "open"
json.dump(c, open(p, "w"), indent=2)
print("Discord config restored")
PYEOF

sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user restart openclaw-gateway
```

> **注意**: Discord 插件的字段是 `token`（不是 `botToken` 或 `appId`），不支持 `dmPolicy` 字段。  
> 无效字段会导致 Gateway 启动失败。如果出错，运行 `openclaw doctor --fix` 清理。

#### 9. 验证所有服务

```bash
# 系统服务
sudo systemctl status openclaw-admin --no-pager
sudo systemctl status tenant-router --no-pager
sudo systemctl status bedrock-proxy-h2 --no-pager
sudo systemctl status dingtalk-stream-bridge --no-pager

# 用户服务（Gateway）
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user status openclaw-gateway --no-pager

# 确认 H2 Proxy 环境变量
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user show openclaw-gateway | grep Environment

# 确认 SQS consumer
journalctl -u tenant-router -n 10 --no-pager | grep -i cron

# 确认各 channel 连接
sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 journalctl --user -u openclaw-gateway -n 20 --no-pager | grep -E "discord|feishu|logged in"
```

---

## 回滚

| 组件 | 回滚方式 |
|------|----------|
| CloudFormation | `aws cloudformation update-stack` 用原模板，或 Console 回滚 |
| Docker 镜像 | `docker tag $ECR_URI:previous $ECR_URI:latest && docker push` |
| EC2 文件 | 从 git 或 S3 恢复旧版本文件，重启服务 |
| microVM | stop session，下次请求自动拉新镜像 |

---

## 服务清单

| 服务 | 类型 | 端口 | 说明 |
|------|------|------|------|
| `openclaw-gateway` | user (ubuntu) | 18789 | OpenClaw 主进程，内置飞书/Discord 等 IM 插件 |
| `bedrock-proxy-h2` | system | 8091 (H2) / 8092 (H1) | 拦截 Bedrock API，路由到 Tenant Router |
| `tenant-router` | system | 8090 | 查 DDB 映射，路由到 AgentCore Runtime |
| `openclaw-admin` | system | 8099 | Admin Console（前端 + API） |
| `dingtalk-stream-bridge` | system | — | 钉钉 WebSocket 长连接，转发到 H2 Proxy |

---

## 已知限制

1. **CloudFormation UserData 修改会替换 EC2** — 不要在 UserData 中引用新资源。新增动态值应写入 SSM Parameter Store，在运行时读取。
2. **Cron 通知依赖 agent 遵守 SOUL.md 指令** — Claude Sonnet/Opus 模型可靠性高，但非 100%。
3. **`AWS_ENDPOINT_URL_BEDROCK_RUNTIME` 是必需的** — 仅修改 `openclaw.json` 的 `baseUrl` 不会生效，必须通过 systemd drop-in 设置此环境变量。
4. **Discord 配置字段** — 只有 `token` 和 `groupPolicy`，不支持 `botToken`、`appId`、`dmPolicy` 等字段，无效字段会导致 Gateway 崩溃。
5. **SQS 消息保留 24 小时** — 如果 EC2 tenant_router 长时间宕机，超过 24 小时的通知会丢失。
