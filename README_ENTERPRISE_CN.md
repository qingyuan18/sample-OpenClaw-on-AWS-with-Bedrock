# OpenClaw 企业版基于 AgentCore

将 [OpenClaw](https://github.com/openclaw/openclaw) 从个人 AI 助手升级为企业级数字化员工平台 — 无需修改任何 OpenClaw 源代码。

---

## 按需付费的无服务器架构

大多数企业 AI 部署要么按席位收费，要么为每个员工运行专用计算资源。AgentCore Firecracker microVM 彻底改变了成本模型 — **您无需预分配 CPU 或内存，无需选择实例规格。AgentCore 按调用精确配置所需资源，按秒计费。**

**AgentCore 定价（us-west-2）：**
- CPU：$0.0895 / vCPU-小时 — **空闲时 $0**（调用之间无 CPU 费用）
- 内存：$0.00945 / GB-小时 — 唯一的空闲成本，非常低

**50 名员工，每天 8 小时会话（us-west-2）：**

| | 每员工专用 EC2 | ChatGPT Team | **OpenClaw on AgentCore** |
|---|---|---|---|
| 50 名员工 | 50 × $52 = **$2,600/月** | 50 × $25 = **$1,250/月** | **~$100-150/月** |
| 您支付的内容 | 全天候运行，无论是否有人聊天 | 按席位，固定费用 | 仅调用时的 CPU + 空闲会话内存 |
| 每员工空闲成本 | $52/月（完整 EC2 运行） | $25/月（订阅） | **~$0.08/天**（1 GB 内存 × 8 小时） |

**计算方式：** 50 员工 × 22 工作日 × $0.08 空闲/天 = ~$88/月（内存）。加上实际对话期间的 CPU（~$20-50/月）= **总 AgentCore 成本 $100-150/月。** 加上网关基础设施成本（见下方[成本估算](#成本估算)）即为完整费用。

---

## 两种部署模式：无服务器 + 常驻

每个 Agent 使用相同的 Docker 镜像。管理员根据用例选择每个 Agent 的部署模式 — 无需更改代码，无需单独构建。

### 无服务器（AgentCore）— 默认模式

| | 行为 |
|-|---------|
| **冷启动** | 首次消息约 6 秒 — Firecracker microVM + SOUL 组装 + Bedrock |
| **会话恢复** | 约 2-3 秒 — Session Storage 恢复工作区，跳过 S3 下载 |
| **热会话** | 近乎即时 — microVM 在对话期间保持活动 |
| **空闲成本** | 仅内存（$0.00945/GB-小时）。CPU 空闲时 = $0 |
| **Session Storage** | 工作区文件在 microVM 停止/恢复之间持久化（每会话 1 GB）。Agent 端持久化无需 S3 同步 |
| **最适合** | 个人员工 Agent — 弹性缩容至零，按使用付费 |

### 常驻（ECS Fargate）— 管理员切换

| | 行为 |
|-|---------|
| **冷启动** | 无 — 容器始终运行 |
| **定时任务** | HEARTBEAT 按计划触发（每 3 分钟检查邮件，每日报告） |
| **直连 IM** | 容器直接连接 Telegram/Discord（专用 bot token） |
| **持久化** | EFS 备份工作区 — 容器重启后持久 |
| **最适合** | 客服机器人、高频 cron 任务的高管助理、高流量数字孪生 |

管理员在 **Agent Factory** 创建 Agent 时选择部署模式。任何 Agent 都可以是常驻的 — 无论服务一个员工还是多个员工。常驻 Agent 获得专用的 ECS Fargate 容器并自动重启。

---

## 安全：每一层的硬件级隔离

每次 Agent 调用都在隔离的 Firecracker microVM 中运行 — 与 AWS Lambda 使用相同的 hypervisor 技术。任何 prompt 工程都无法突破 L3 或 L4。

| 层级 | 机制 | 能被 prompt 注入绕过吗？ |
|-------|-----------|-------------------------------|
| L1 — Prompt | SOUL.md 规则（"财务部门从不使用 shell"） | ⚠️ 理论上可能 |
| L2 — 应用 | Skills manifest `allowedRoles`/`blockedRoles` | ⚠️ 代码 bug 风险 |
| **L3 — IAM** | **Runtime 角色对目标资源没有权限** | **不可能** |
| **L4 — 计算** | **每次调用独立的 Firecracker microVM，hypervisor 级别隔离** | **不可能** |
| **L5 — 护栏** | **Bedrock Guardrail 检查每个输入 + 输出：主题拒绝、PII 过滤、合规策略** | **不可能 — AWS 托管的语义 AI 层** |

每个 Runtime 层级都有自己的 Docker 镜像、自己的 IAM 角色、自己的 Firecracker 边界以及可选的 Bedrock Guardrail。实习生的 Agent IAM 角色字面上无法读取高管的 S3 存储桶 — 即使 LLM 尝试也不行。即使可以，Guardrail 也会在输出到达用户之前拦截。

额外控制：无公共端口（仅 SSM）· 全程使用 IAM 角色，无硬编码凭证 · gateway token 在 SSM SecureString 中，从不存储在磁盘 · Runtime 之间的 VPC 隔离。

---

## 从第一天起就可审计和治理

| 控制 | IT 获得什么 |
|---------|-------------|
| **SOUL 编辑器** | IT 锁定的全局规则。财务部门无法使用 shell。工程部门无法泄漏 PII。员工无法覆盖全局层。 |
| **Skill 治理** | 26 个技能，带 `allowedRoles`/`blockedRoles`。员工无法安装未批准的技能。 |
| **审计中心** | 每次调用、工具调用、权限拒绝、SOUL 更改、IM 配对 → DynamoDB |
| **使用和成本** | 按员工、按部门细分。包含模型定价的每日/每周/每月趋势 |
| **IM 管理** | 每个员工连接的 IM 账户对管理员可见。一键撤销。 |
| **安全中心** | 实时 ECR 镜像、IAM 角色、VPC 安全组，带 AWS Console 深度链接 |
| **RBAC** | 管理员（全组织）· 经理（部门范围）· 员工（仅门户） |

---

## 核心特性

| 特性 | 功能说明 |
|---------|-------------|
| **数字孪生** | 员工打开公共链接。任何人都可以通过 URL 与他们的 AI Agent 聊天（当本人不在时） — Agent 使用他们的 SOUL、记忆和专业知识响应。孪生会话与员工主会话隔离 |
| **常驻 Agent** | 管理员将任何 Agent 切换到持久 ECS Fargate 模式。启用定时任务（每 3 分钟检查邮件）、直连 IM bot、即时响应。相同镜像、相同 SOUL — 只是部署模式切换 |
| **Session Storage** | AgentCore 在 microVM 停止/恢复周期之间持久化工作区文件。会话恢复时无需重新下载 S3。结合 `StopRuntimeSession` API 用于管理员触发的配置刷新 |
| **三层 SOUL** | 全局（IT）→ 职位（部门管理员）→ 个人（员工）。3 个利益相关者，3 层，一个合并身份。相同的 LLM — 财务分析师 vs SDE 具有完全不同的个性和权限 |
| **权限控制** | SOUL.md 定义每个角色允许/阻止的工具。Plan A（执行前）+ Plan E（执行后审计）。高管配置文件完全绕过 Plan A |
| **多 Runtime** | 标准（Nova 2 Lite，受限 IAM）和高管（Sonnet 4.6，完整 IAM）Runtime。从安全中心 UI 将职位分配给 Runtime |
| **自助 IM 配对** | 扫描二维码 + `/start TOKEN` → 立即写入 SSM 映射。支持 Telegram、Feishu、Discord |
| **组织目录 KB** | 通过 `seed_knowledge_docs.py` 从组织数据播种。注入每个 Agent 的工作区。Agent 知道该联系谁 |
| **每员工配置** | 在职位或员工级别覆盖模型、`recentTurnsPreserve`、`maxTokens`、响应语言。零重新部署 |
| **记忆持久化** | 无服务器：Session Storage 在 microVM 周期之间持久化工作区 + S3 回写供管理员查看。常驻：EFS + Gateway 压缩。跨渠道共享记忆（IM + 门户 = 相同会话） |

---

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│  管理控制台（React + FastAPI）                                    │
│  ├── 25+ 页面：仪表板、Agent Factory、安全中心、                   │
│  │   IM 渠道、监控、审计、使用和成本、设置                          │
│  ├── 员工门户：聊天、个人资料、技能、请求、连接 IM、数字孪生切换     │
│  ├── 3 角色 RBAC（管理员/经理/员工）                              │
│  └── IT 管理员助手（Claude API，10 个白名单工具）                 │
├─────────────────────────────────────────────────────────────────┤
│  网关架构：一个 Bot，所有员工                                     │
│                                                                  │
│  部署 1 个 Bot，所有员工共享，每个人得到自己的 Agent：             │
│                                                                  │
│  Discord  → 创建 1 个 Bot "ACME Agent" → 连接到 Gateway          │
│  Telegram → 创建 1 个 Bot @acme_bot    → 连接到 Gateway          │
│  Feishu   → 创建 1 个企业 Bot           → 连接到 Gateway          │
│                                                                  │
│  所有员工使用相同的 Bot，但每个人得到自己的 Agent：                 │
│                                                                  │
│  Carol DM @ACME Agent → H2 Proxy 提取 user_id → Tenant Router   │
│    → pos-fa → Standard Runtime → 财务分析师 SOUL → Bedrock       │
│                                                                  │
│  WJD DM @ACME Agent → H2 Proxy 提取 user_id → Tenant Router     │
│    → pos-exec → Executive Runtime → Sonnet 4.6 → 完整工具        │
├─────────────────────────────────────────────────────────────────┤
│  AWS 服务                                                         │
│  ├── Bedrock AgentCore：Firecracker microVM 按需执行             │
│  ├── ECS Fargate：常驻 Agent 容器（可选）                        │
│  ├── DynamoDB：组织数据、审计日志、使用统计                       │
│  ├── S3：工作区文件、知识库、技能目录                             │
│  ├── SSM：凭证、IM 映射、Runtime 路由规则                        │
│  └── CloudWatch：日志、指标、告警                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 员工自助 IM 接入

```
步骤 1：员工打开门户 → 连接 IM
步骤 2：选择渠道（Telegram / Feishu / Discord）
步骤 3：用手机扫描二维码 → bot 自动打开
步骤 4：Bot 发送 /start TOKEN → 立即配对，无需管理员批准
步骤 5：员工直接在 IM 应用中与 AI Agent 聊天
```

零 IT 摩擦。员工 30 秒内自助完成。管理员在 IM 渠道页面看到所有连接并可撤销任何连接。

---

## 快速开始

> **TL;DR** — 三条命令完成部署：
> ```bash
> cd enterprise
> cp .env.example .env        # 编辑：STACK_NAME, REGION, ADMIN_PASSWORD
> bash deploy.sh              # ~15 分钟 — 基础设施 + Docker 构建 + 数据播种
> ```
> 然后按照下面的 **步骤 4-6** 在 EC2 上部署管理控制台和网关服务。

### 前置要求

| 要求 | 版本 | 说明 |
|-------------|---------|-------|
| AWS CLI | v2.27+ | `bedrock-agentcore-control` 需要 2.27+ |
| Node.js | 18+ | 用于管理控制台前端构建 |
| Python | 3.10+ | 用于数据播种脚本和后端 |
| SSM Plugin | 最新 | [安装指南](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) |

> **无需本地 Docker** — Agent 容器镜像在网关 EC2（ARM64 Graviton）上通过 SSM 构建。

**AWS 要求：**
- Bedrock 模型访问：Nova 2 Lite（默认）+ Anthropic Claude（高管层 + 管理员助手）
- Bedrock AgentCore 可用区域：`us-east-1`、`us-west-2`
- IAM 权限：`cloudformation:*`、`ec2:*`、`iam:*`、`ecr:*`、`s3:*`、`ssm:*`、`bedrock:*`、`dynamodb:*`

### 步骤 1：配置和部署

```bash
cd enterprise           # 从仓库根目录
cp .env.example .env    # 复制配置模板
```

打开 `.env` 并填写必需值：

```bash
STACK_NAME=openclaw-enterprise   # 您的堆栈名称
REGION=us-east-1                 # us-east-1 或 us-west-2（AgentCore 区域）
ADMIN_PASSWORD=your-password     # 管理控制台登录密码

# 可选：使用现有 VPC 而不是创建新的
# EXISTING_VPC_ID=vpc-0abc123
# EXISTING_SUBNET_ID=subnet-0abc123

# 可选：自定义 S3 存储桶名称 — 在同一账户中部署多个堆栈时需要
# （例如在同一 AWS 账户中部署 staging + production）
# WORKSPACE_BUCKET_NAME=openclaw-tenants-123456789-staging
```

然后运行部署脚本 — 它处理所有事情，**包括在网关 EC2 上构建 Docker（无需本地 Docker）**：

```bash
bash deploy.sh
# 总共约 15 分钟：CloudFormation → EC2 Docker 构建 → AgentCore Runtime → DynamoDB 数据播种
```

重新部署代码更改而不重建 Docker 镜像或重新播种数据：

```bash
bash deploy.sh --skip-build   # 仅更新基础设施，跳过 Docker 构建
bash deploy.sh --skip-seed    # 更新基础设施 + 镜像，跳过 DynamoDB
```

**`deploy.sh` 自动完成的操作（端到端）：**
1. 部署 CloudFormation（EC2、ECR、S3、IAM — 创建或更新）
2. 打包源代码 → 上传到 S3 → **通过 SSM 在网关 EC2 上触发 Docker 构建**（ARM64 Graviton，无需本地 Docker）
3. 创建或更新 AgentCore Runtime
4. 如果不存在则创建 DynamoDB 表
5. 播种组织数据（员工、职位、部门、SOUL 模板、知识文档）
6. 在 SSM SecureString 中存储 `ADMIN_PASSWORD` 和 `JWT_SECRET`
7. 构建管理控制台前端 → 打包 → 通过 SSM 部署到 EC2
8. 将网关服务（Tenant Router、Bedrock H2 Proxy）部署到 EC2
9. 用所有必需变量写入 `/etc/openclaw/env`（`STACK_NAME`、`DYNAMODB_TABLE`、`DYNAMODB_REGION`、ECS 配置等）
10. 配置 systemd 服务并启动所有组件
11. 添加 ECS→SSM VPC 端点安全组规则（如果存在 VPC 端点）

部署后，获取实例 ID 和 S3 存储桶：

```bash
STACK_NAME="openclaw-enterprise"   # 匹配您的 .env
REGION="us-east-1"

INSTANCE_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' --output text)
S3_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`TenantWorkspaceBucketName`].OutputValue' --output text)
echo "EC2: $INSTANCE_ID  |  S3: $S3_BUCKET"
```

### 步骤 1.5：构建并推送高管 Agent 镜像（高管层）

高管 Runtime 使用单独的 Docker 镜像（`exec-agent/`），预装所有技能和 Claude Sonnet 4.6。`deploy.sh` 自动构建标准镜像；高管镜像必须单独推送：

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_EXEC="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${STACK_NAME}-exec-agent"

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

docker build --platform linux/arm64 \
  -f enterprise/exec-agent/Dockerfile \
  -t "${ECR_EXEC}:latest" .

docker push "${ECR_EXEC}:latest"
```

然后更新高管 Runtime 以使用新镜像：

```bash
EXEC_RUNTIME_ID=$(aws ssm get-parameter \
  --name "/openclaw/${STACK_NAME}/exec-runtime-id" \
  --query Parameter.Value --output text --region $REGION 2>/dev/null)

EXEC_ROLE=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`AgentContainerExecutionRoleArn`].OutputValue' --output text)

aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id "$EXEC_RUNTIME_ID" \
  --agent-runtime-artifact "{\"containerConfiguration\":{\"containerUri\":\"${ECR_EXEC}:latest\"}}" \
  --role-arn "$EXEC_ROLE" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --environment-variables "{\"AWS_REGION\":\"${REGION}\",\"BEDROCK_MODEL_ID\":\"global.anthropic.claude-sonnet-4-6\",\"S3_BUCKET\":\"${S3_BUCKET}\",\"STACK_NAME\":\"${STACK_NAME}\",\"DYNAMODB_TABLE\":\"${STACK_NAME}\",\"DYNAMODB_REGION\":\"${DYNAMODB_REGION}\",\"SYNC_INTERVAL\":\"120\"}" \
  --region $REGION
```

> 标准 Agent 镜像（`openclaw-multitenancy-multitenancy-agent`）由 `deploy.sh` 自动构建。您只需为高管层执行此步骤。

### 步骤 2：访问管理控制台

> **`deploy.sh` 自动处理此步骤。** 部署后，使用 SSM 端口转发访问：

```bash
# 在本地机器上启动 SSM 端口转发
aws ssm start-session \
  --target $INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters "portNumber=8099,localPortNumber=8099" \
  --region $REGION
```

在浏览器中打开：`http://localhost:8099`

**登录凭证：**
- 用户名：`admin`
- 密码：`.env` 文件中设置的 `ADMIN_PASSWORD`

### 步骤 3：验证部署

登录管理控制台后，导航到：

**1. 安全中心 → Runtimes**
- 验证标准和高管 Runtime 的状态为 `READY`
- 检查 IAM 角色和 ECR 镜像链接

**2. Agents → 测试 Playground**
- 选择员工：Carol Zhang（财务）
- 输入：`run git status`
- 预期：**被拒绝**（财务无 shell 访问）

- 选择员工：Ryan Park（SDE）
- 输入：`run git status`
- 预期：**执行成功**（SDE 有 shell 访问）

**3. IM 渠道**
- 如果配置了 Feishu/Telegram/Discord，验证渠道状态为 `已连接`

**4. 审计中心**
- 检查是否记录了 Playground 测试
- 验证权限拒绝事件（Carol 的 shell 尝试）

### 步骤 4：配置 IM 渠道（可选）

#### Telegram

```bash
# 1. 创建 bot：与 @BotFather 聊天
# 2. 发送 /newbot，按照提示操作
# 3. 复制 bot token

# 通过 SSM 配置
aws ssm start-session --target $INSTANCE_ID --region $REGION

# 在 EC2 上：
export NVM_DIR=/home/ubuntu/.nvm && source $NVM_DIR/nvm.sh
openclaw config set channels.telegram.botToken YOUR_BOT_TOKEN
openclaw plugins enable telegram

# 重启 gateway
sudo systemctl restart openclaw-gateway
```

#### Feishu（飞书）

```bash
# 1. 在 Feishu 管理控制台创建企业应用
# 2. 获取 App ID 和 App Secret

# 通过 SSM 配置
aws ssm start-session --target $INSTANCE_ID --region $REGION

# 在 EC2 上：
export NVM_DIR=/home/ubuntu/.nvm && source $NVM_DIR/nvm.sh
openclaw config set channels.feishu.appId YOUR_APP_ID
openclaw config set channels.feishu.appSecret YOUR_APP_SECRET
openclaw plugins enable feishu

# 重启 gateway
sudo systemctl restart openclaw-gateway
```

#### Discord

```bash
# 1. 在 Discord 开发者门户创建应用
# 2. 添加 bot，获取 token

# 通过 SSM 配置
aws ssm start-session --target $INSTANCE_ID --region $REGION

# 在 EC2 上：
export NVM_DIR=/home/ubuntu/.nvm && source $NVM_DIR/nvm.sh
openclaw config set channels.discord.botToken YOUR_BOT_TOKEN
openclaw plugins enable discord

# 重启 gateway
sudo systemctl restart openclaw-gateway
```

### 步骤 5：员工接入流程

**员工自助 IM 配对（30 秒）：**

1. 员工登录门户（`http://localhost:8099/portal`）
   - 用户名：`emp-{employee_id}`（例如 `emp-jiade`）
   - 密码：默认为 `openclaw123`（首次登录后更改）

2. 点击 **Connect IM** → 选择渠道（Telegram/Feishu/Discord）

3. 扫描二维码 → bot 自动打开 → 发送配对码

4. 完成！员工现在可以在 IM 应用中与 AI Agent 聊天

**管理员视角：**
- **IM 渠道** 页面显示所有连接
- 每个员工：配对日期、会话数、最后活跃时间
- 一键撤销连接

---

## 故障排查

### Docker 构建失败：`auth-agent/__init__.py not found`

**症状：** `deploy.sh` Docker 构建步骤失败：
```
COPY auth-agent/__init__.py /app/auth-agent/__init__.py
ERROR: failed to compute cache key: "/auth-agent/__init__.py": not found
```

**原因：** `deploy.sh` 中的两个 bug：
1. tar 打包步骤不包含 `enterprise/auth-agent` — 仅打包 `enterprise/agent-container` 和 `enterprise/exec-agent`
2. `docker build` 上下文指向 `.`（tar 根目录）而不是 `enterprise/` — 但 Dockerfile 的 `COPY` 路径假设上下文是 `enterprise/`

**修复：** 对 `deploy.sh` 应用两项更改：

```bash
# 1. 将 enterprise/auth-agent 添加到 tar 打包（约第 207 行）
COPYFILE_DISABLE=1 tar czf "$TARBALL" \
  -C "$SCRIPT_DIR/.." \
  enterprise/agent-container \
  enterprise/exec-agent \
  enterprise/auth-agent        # ← 添加这行

# 2. 将 docker build 上下文从 "." 改为 "enterprise/"（约第 237 行）
docker build -f enterprise/agent-container/Dockerfile -t ${ECR_URI}:latest enterprise/
#                                                                          ^^^^^^^^^^^
#                                                              原来是 "." — 必须是 "enterprise/"
```

### 管理控制台登录返回 "Employee not found"

**症状：** 管理控制台在 8099 端口运行，但用 `emp-jiade` 登录返回 "Employee not found"。

**原因：** 两个可能的问题：

**问题 A — DynamoDB 未播种：** `deploy.sh` 可能在播种步骤完成前被中断。检查：
```bash
aws dynamodb scan --table-name $STACK_NAME --region us-east-2 \
  --select COUNT --query 'Count'
# 应该返回 ~77+ 项。如果为 0，重新运行播种脚本。
```

**问题 B — `/etc/openclaw/env` 中的 `AWS_REGION` 错误：** 管理控制台的 `db.py` 使用 `AWS_REGION` 连接 DynamoDB（默认：`us-east-2`）。如果 `/etc/openclaw/env` 设置 `AWS_REGION=us-east-1`（EC2/AgentCore 区域），控制台将在错误区域查找 DynamoDB 表。

**修复：** 确保 `/etc/openclaw/env` 将 `AWS_REGION` 设置为 DynamoDB 区域：
```bash
# /etc/openclaw/env — AWS_REGION 必须指向 DynamoDB 区域，不是 EC2 区域
STACK_NAME=openclaw-enterprise
AWS_REGION=us-east-2              # ← DynamoDB 区域，不是 us-east-1
GATEWAY_REGION=us-east-1          # ← EC2/AgentCore/SSM 区域
SSM_REGION=us-east-1
DYNAMODB_TABLE=openclaw-enterprise
DYNAMODB_REGION=us-east-2
GATEWAY_INSTANCE_ID=i-xxxxxxxxx
```
然后重启：`systemctl restart openclaw-admin`

> **根本原因：** `deploy.sh` 步骤 7 不创建 `/etc/openclaw/env`。当此文件缺失时，`start.sh` 脚本默认 `STACK_NAME` 为 `openclaw-multitenancy`，导致 SSM 参数查找静默失败。

### 管理控制台端口 8099 未监听（SSM 端口转发失败）

**症状：** SSM 端口转发到 8099 时 `Connection to destination port failed`。

**原因：** `deploy.sh` 仅部署基础设施（CloudFormation + Docker + AgentCore + DynamoDB 播种）。管理控制台、网关服务和 `/etc/openclaw/env` 必须通过本文档中的步骤 4-7 单独部署。

**修复：** 在 `deploy.sh` 完成后按照步骤 4-7 操作。最少需要：
1. 创建带正确变量的 `/etc/openclaw/env`
2. 部署管理控制台（步骤 4）
3. 在 SSM 中存储密钥（admin-password、jwt-secret）
4. 部署网关服务（步骤 5）

### Feishu/Lark 渠道在网关 UI 中不可见

**症状：** 网关 UI 显示 Telegram、WhatsApp、Discord 但没有 Feishu 选项。

**原因：** 内置的 Feishu 插件（`@openclaw/feishu`）默认 **禁用**。必须显式启用。

**修复：**
```bash
# 通过 SSM SSH 进入 EC2，然后作为 ubuntu 用户：
export NVM_DIR=/home/ubuntu/.nvm && source $NVM_DIR/nvm.sh

# 启用内置 feishu 插件
openclaw plugins enable feishu

# 配置凭证（使用渠道 ID "feishu"，不是 "openclaw-feishu"）
openclaw config set channels.feishu.appId <YOUR_APP_ID>
openclaw config set channels.feishu.appSecret <YOUR_APP_SECRET>

# 重启 gateway
kill $(pgrep -f openclaw-gatewa)
cd /home/ubuntu && nohup openclaw gateway start > /tmp/gateway.log 2>&1 &

# 验证
openclaw status
# 应该显示：Feishu │ ON │ OK │ configured
```

> **注意：** 社区 npm 包 `openclaw-feishu` 是一个单独的插件，与 `openclaw-agentcore` 的插件系统 **不兼容**。使用内置的 `feishu` 扩展。配置的渠道 ID 是 `feishu`（不是 `openclaw-feishu`）。

> **注意：** 在 EC2 gateway 实例上，`npm` 和 `node` 通过 NVM 安装在 `ubuntu` 用户下。以 root 身份运行的命令（包括 SSM RunShellScript）必须先 source NVM：`export NVM_DIR=/home/ubuntu/.nvm && source $NVM_DIR/nvm.sh`

### AgentCore 返回 500 错误

**症状：** Playground 或 IM 聊天返回 500 Internal Server Error。

**检查 CloudWatch 日志：**
```bash
# 获取 Runtime ID
RUNTIME_ID=$(aws ssm get-parameter \
  --name "/openclaw/${STACK_NAME}/runtime-id" \
  --query Parameter.Value --output text --region $REGION)

# 查看日志
aws logs tail "/aws/bedrock-agentcore/runtimes/${RUNTIME_ID}-DEFAULT" \
  --follow --region $REGION
```

**如果看到 `openclaw returned empty output`：**
- **原因：** Docker 镜像中的 OpenClaw 版本错误
- **修复：** 必须使用 `openclaw@2026.3.24`。较新版本更改了 Gateway 响应传递机制并破坏 IM 渠道集成。

重建镜像：
```bash
# 确保 Dockerfile 中有：
RUN npm install -g openclaw@2026.3.24

# 重新构建并推送镜像，然后更新 Runtime（见步骤 1.5）
```

### Runtime 状态卡在 `UPDATING`

**症状：** `update-agent-runtime` 后，Runtime 状态保持 `UPDATING` 超过 5 分钟。

**修复：** 等待最多 15 分钟。轮询状态：
```bash
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id $RUNTIME_ID \
  --region $REGION \
  --query 'agentRuntime.status' --output text
```

如果 15 分钟后仍是 `UPDATING`，检查 CloudWatch 日志是否有错误。

---

## 成本估算

**月度成本明细（50 名员工，us-west-2）：**

| 组件 | 规格 | 月成本 |
|------|------|--------|
| **EC2 网关** | c7g.large（2 vCPU, 4 GB），按需 | ~$52 |
| **EFS（always-on workspace）** | 标准，5 GB | ~$1.50 |
| **S3** | 标准，100 GB | ~$2.30 |
| **DynamoDB** | 按需，~1000 读/写请求/月 | ~$1.25 |
| **VPC Endpoints**（可选）| Bedrock Runtime + SSM × 3 | ~$29/月 |
| **AgentCore（50 员工）** | 8 hr/天会话，轻度使用 | ~$100-150 |
| **Bedrock API** | Nova 2 Lite，~1M tokens/月 | ~$10-30 |
| **CloudWatch 日志** | 10 GB/月 | ~$5 |

**总计：~$200-270/月**（50 员工，含 VPC 端点）

**不含 VPC 端点：~$170-240/月**

**相比：**
- ChatGPT Team：50 × $25 = **$1,250/月**
- 每员工专用 EC2：50 × $52 = **$2,600/月**

**节省：~85-90%**

---

## 示例组织

`deploy.sh` 播种一个示例组织以进行测试：

**部门：**
- Finance（财务）
- Engineering（工程）
- Legal（法务）
- Executive（高管）

**职位：**
- `pos-fa`：财务分析师（Standard Runtime，Nova 2 Lite）
- `pos-sde`：软件工程师（Standard Runtime，shell 访问）
- `pos-legal`：法务顾问（Standard Runtime，带 Guardrail）
- `pos-exec`：高管（Executive Runtime，Claude Sonnet 4.6，完整权限）

**示例员工：**
- `emp-carol`：Carol Zhang（财务分析师）
- `emp-ryan`：Ryan Park（SDE）
- `emp-rachel`：Rachel Li（法务）
- `emp-jiade`：WJD（高管）

**默认密码：** `openclaw123`（首次登录后更改）

---

## 环境变量

`/etc/openclaw/env` 包含所有运行时配置（由 `deploy.sh` 创建）：

```bash
STACK_NAME=openclaw-enterprise
AWS_REGION=us-east-2              # DynamoDB 区域
GATEWAY_REGION=us-east-1          # EC2/AgentCore 区域
SSM_REGION=us-east-1
DYNAMODB_TABLE=openclaw-enterprise
DYNAMODB_REGION=us-east-2
GATEWAY_INSTANCE_ID=i-xxxxxxxxx
GATEWAY_ACCOUNT_ID=123456789012
S3_BUCKET=openclaw-tenants-123456789012
MODEL=global.amazon.nova-2-lite-v1:0
```

**关键区别：**
- `AWS_REGION`：管理控制台 `db.py` 使用此连接 DynamoDB（**必须是 DynamoDB 区域**）
- `GATEWAY_REGION`：网关服务使用此连接 AgentCore/SSM（**必须是 EC2 区域**）

---

## 项目结构

```
enterprise/
├── deploy.sh                           # 端到端部署脚本（推荐）
├── ec2-setup.sh                        # EC2 UserData 脚本（由 CloudFormation 调用）
├── .env.example                        # 配置模板
├── clawdbot-bedrock-agentcore-multitenancy.yaml  # CloudFormation 模板
│
├── agent-container/                    # 标准 Agent Docker 镜像
│   ├── Dockerfile                      # openclaw@2026.3.24（锁定）
│   ├── server.py                       # Tenant Router + H2 Proxy
│   └── openclaw.json                   # OpenClaw 配置
│
├── exec-agent/                         # 高管 Agent Docker 镜像
│   ├── Dockerfile                      # 所有技能 + Sonnet 4.6
│   └── openclaw.json                   # 高管配置
│
├── auth-agent/                         # 工作区组装器
│   ├── __init__.py
│   └── workspace_assembler.py          # SOUL + KB 注入
│
└── admin-console/                      # 管理控制台（React + FastAPI）
    ├── src/                            # React 前端（25+ 页面）
    ├── server/                         # FastAPI 后端
    │   ├── routers/                    # API 路由
    │   ├── db.py                       # DynamoDB 客户端
    │   ├── seed_*.py                   # 数据播种脚本
    │   └── start.sh                    # 启动脚本
    └── package.json
```

---

## 操作说明

### 添加新员工

```bash
# 1. 在管理控制台 → Organization → Employees → Add Employee
# 2. 分配到部门和职位
# 3. 员工使用 emp-{id} + 默认密码登录
# 4. 在门户中连接 IM
```

### 更新 SOUL 模板

```bash
# 1. 管理控制台 → Agents → SOUL Editor
# 2. 编辑全局/职位/个人层
# 3. 保存 → 立即对新会话生效
# 4. 对活动会话：安全中心 → 停止运行时会话以强制刷新
```

### 将职位分配给 Runtime

```bash
# 1. 安全中心 → Runtimes
# 2. 标准 Runtime → 分配职位：pos-fa, pos-sde, pos-legal
# 3. 高管 Runtime → 分配职位：pos-exec
# 4. 保存 → 立即生效
```

### 启用常驻 Agent

```bash
# 1. Agent Factory → 选择 Agent
# 2. 配置 → 部署模式 → Always-on（ECS Fargate）
# 3. 保存 → ECS 任务启动（~2 分钟）
# 4. 验证：安全中心 → Always-on Agents → 检查任务状态
```

### 查看审计日志

```bash
# 1. 审计中心 → 事件日志
# 2. 筛选：员工、时间范围、事件类型
# 3. 导出：CSV 下载
```

### 监控使用情况

```bash
# 1. 仪表板 → 使用和成本
# 2. 按员工/部门/模型细分
# 3. 每日/每周/每月趋势
# 4. 预计月度成本
```

---

## 与其他方案的对比

| | OpenClaw Enterprise | ChatGPT Team | Claude for Work | Dedicated EC2 per User |
|---|---|---|---|---|
| **部署模式** | 无服务器 AgentCore + 可选 always-on | SaaS | SaaS | IaaS |
| **按员工隔离** | ✅ Firecracker microVM | ❌ 共享 | ❌ 共享 | ✅ 专用实例 |
| **自定义 SOUL** | ✅ 3 层（全局/职位/个人） | ❌ | ⚠️ 有限 | ✅ |
| **IAM 权限控制** | ✅ 按 Runtime | ❌ | ❌ | ✅ |
| **审计日志** | ✅ 完整 DynamoDB | ⚠️ 企业版 | ⚠️ 企业版 | ⚠️ 自建 |
| **成本（50 员工）** | **$170-270/月** | $1,250/月 | $1,250/月 | $2,600/月 |
| **数字孪生** | ✅ | ❌ | ❌ | ⚠️ 自建 |
| **Always-on Agents** | ✅ ECS Fargate | ❌ | ❌ | ✅ |
| **数据驻留** | ✅ 您的 AWS 账户 | ❌ OpenAI | ❌ Anthropic | ✅ |

---

## 最佳实践

### 安全

1. **最小权限 IAM**：仅授予 Runtime 所需的权限
2. **VPC 端点**：使用 VPC 端点保持 Bedrock 流量在 AWS 私网
3. **SSM 访问**：使用 SSM Session Manager 而不是 SSH
4. **凭证轮换**：定期轮换 `ADMIN_PASSWORD` 和 `JWT_SECRET`
5. **审计审查**：定期检查审计中心的异常活动

### 成本优化

1. **标准 Runtime 优先**：默认使用 Nova 2 Lite，仅高管使用 Claude
2. **无服务器优先**：仅在需要时使用 always-on（cron 任务、客服 bot）
3. **VPC 端点**：如果流量 < 500 GB/月，跳过 VPC 端点节省 $29/月
4. **DynamoDB 按需**：低流量时比预配置便宜
5. **S3 生命周期**：旧审计日志自动归档到 S3 Glacier

### 运维

1. **监控 CloudWatch 日志**：为 AgentCore 错误设置告警
2. **Runtime 健康检查**：定期在 Playground 测试每个职位
3. **备份 DynamoDB**：启用 DynamoDB 时间点恢复
4. **版本锁定**：不要升级 `openclaw@2026.3.24` — 更新版本破坏 IM
5. **文档更改**：记录自定义 SOUL 规则和路由更改

---

## 了解更多

- **OpenClaw 官方文档**：https://github.com/openclaw/openclaw
- **AWS Bedrock AgentCore**：https://docs.aws.amazon.com/bedrock/latest/userguide/agentcore.html
- **问题和反馈**：https://github.com/qingyuan18/sample-OpenClaw-on-AWS-with-Bedrock/issues

---

由 [wjiad@aws](mailto:wjiad@amazon.com) 构建 · [GitHub](https://github.com/qingyuan18/sample-OpenClaw-on-AWS-with-Bedrock) · 欢迎贡献
