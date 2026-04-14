# 用户映射关系

## 核心链路

员工通过 IM 平台（飞书/Telegram/Discord）DM 企业统一 Bot，消息经以下链路路由：

1. **H2 Proxy 提取 userId** — 从消息中解析发送者的 IM 平台 ID（如飞书 `ou_xxx`、Telegram 数字 ID），非 Bot 名称
2. **userId → Employee** — 查询 DynamoDB `MAPPING#{channel}__{userId}` 获取 `employeeId`（员工自助扫码配对时写入）
3. **Employee → Position** — 查询 `EMP#{emp_id}` 获取 `positionId`（如 `pos-fa` 财务、`pos-exec` 高管）
4. **Position → Runtime** — 查询 `CONFIG#routing` 将职位映射到 AgentCore Runtime（Standard / Executive），决定镜像、模型、IAM 权限
5. **生成 SessionId** — 格式 `emp__{emp_id}__{hash}`，所有 IM 渠道共享同一 session，保留跨渠道上下文

## 手动添加渠道用户映射（跳过扫码配对）

在 Admin Console 创建员工后，默认需要员工在 IM 渠道中扫码完成自助配对。如果希望跳过扫码步骤，可以直接在 DynamoDB 中写入映射记录。

### 前置条件

- 已在 Admin Console 中创建员工，获得 `employeeId`（如 `emp-001`）
- 已获取员工在目标 IM 平台的用户 ID

### 各平台用户 ID 获取方式

| 平台 | userId 格式 | 获取方式 |
|------|------------|---------|
| 飞书 (Feishu) | `ou_xxxxxxxxxxxxxxxx` | 飞书管理后台 → 通讯录 → 成员详情 → Open ID |
| Discord | 数字 ID（如 `123456789012345678`） | 开启开发者模式后右键用户 → 复制用户 ID |
| Telegram | 数字 ID（如 `987654321`） | 通过 @userinfobot 等机器人获取 |
| Slack | `U` 开头（如 `U04ABCDEF12`） | Slack 管理后台 → 用户详情，或点击用户头像 → 复制 Member ID |
| WeChat / 企业微信 | `wxid_xxx` 或 `userid` | 企业微信管理后台 → 通讯录 → 成员详情 |

### 写入 DynamoDB 映射

映射记录的 Key 格式为 `MAPPING#{channel}__{userId}`，其中 `channel` 为渠道标识（如 `feishu`、`discord`、`telegram`、`slack`、`wechat`）。

使用 AWS CLI 写入示例：

```bash
# 飞书用户映射
aws dynamodb put-item \
  --table-name <YourTableName> \
  --item '{
    "PK": {"S": "MAPPING#feishu__ou_xxxxxxxxxxxx"},
    "employeeId": {"S": "emp-001"}
  }'

# Discord 用户映射
aws dynamodb put-item \
  --table-name <YourTableName> \
  --item '{
    "PK": {"S": "MAPPING#discord__123456789012345678"},
    "employeeId": {"S": "emp-001"}
  }'

# Telegram 用户映射
aws dynamodb put-item \
  --table-name <YourTableName> \
  --item '{
    "PK": {"S": "MAPPING#telegram__987654321"},
    "employeeId": {"S": "emp-001"}
  }'

# Slack 用户映射
aws dynamodb put-item \
  --table-name <YourTableName> \
  --item '{
    "PK": {"S": "MAPPING#slack__U04ABCDEF12"},
    "employeeId": {"S": "emp-001"}
  }'
```

> **注意：** 将 `<YourTableName>` 替换为实际的 DynamoDB 表名，`employeeId` 替换为 Admin Console 中创建的真实员工 ID。同一个员工可以绑定多个渠道，所有渠道共享同一 session 上下文。

### 验证映射

```bash
# 查询某个渠道用户的映射是否生效
aws dynamodb get-item \
  --table-name <YourTableName> \
  --key '{"PK": {"S": "MAPPING#feishu__ou_xxxxxxxxxxxx"}}'
```

确认返回的 `employeeId` 正确后，该用户即可通过对应 IM 渠道直接与 Bot 对话，无需扫码配对。

## 配置员工的模型、Skills 与 Agent 行为

员工创建后，其 AI Agent 的能力由多个 DynamoDB 配置项共同决定，遵循**职位（Position）→ 员工（Employee）**的覆盖层级。以下介绍如何通过 DDB 直接配置。

> **约定：** 以下示例中 `<Table>` 代表实际 DynamoDB 表名（与 `STACK_NAME` 相同），所有记录的 `PK` 均为 `ORG#acme`。

### 1. 模型配置（CONFIG#model）

模型配置存储在 `SK = CONFIG#model`，支持三个层级：默认模型、职位覆盖、员工覆盖。

**查看当前模型配置：**

```bash
aws dynamodb get-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#model"}}'
```

**为某职位配置模型覆盖：**

在 `positionOverrides` 中添加对应职位的配置。例如为 `pos-fa`（财务分析师）设置 Nova Pro：

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#model"}}' \
  --update-expression "SET positionOverrides.#pid = :val" \
  --expression-attribute-names '{"#pid": "pos-fa"}' \
  --expression-attribute-values '{":val": {"M": {
    "modelId": {"S": "us.amazon.nova-pro-v1:0"},
    "modelName": {"S": "Amazon Nova Pro"},
    "inputRate": {"S": "0.80"},
    "outputRate": {"S": "3.20"},
    "reason": {"S": "Balanced capability for financial analysis"}
  }}}'
```

**为某员工配置模型覆盖（优先级最高）：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#model"}}' \
  --update-expression "SET employeeOverrides.#eid = :val" \
  --expression-attribute-names '{"#eid": "emp-001"}' \
  --expression-attribute-values '{":val": {"M": {
    "modelId": {"S": "global.anthropic.claude-sonnet-4-6"},
    "modelName": {"S": "Claude Sonnet 4.6"}
  }}}'
```

**模型生效优先级：** 员工覆盖 > 职位覆盖 > 默认模型

### 2. Skills 与工具权限（POS#{pos_id}）

Skills 和工具白名单定义在职位记录中（`SK = POS#{pos_id}`）。员工继承其所属职位的 skills 和 tools。

**查看职位当前配置：**

```bash
aws dynamodb get-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "POS#pos-fa"}}'
```

**更新职位的 Skills 列表：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "POS#pos-fa"}}' \
  --update-expression "SET defaultSkills = :skills" \
  --expression-attribute-values '{":skills": {"L": [
    {"S": "jina-reader"},
    {"S": "sap-connector"},
    {"S": "excel-gen"},
    {"S": "deep-research"}
  ]}}'
```

**更新职位的工具白名单：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "POS#pos-fa"}}' \
  --update-expression "SET toolAllowlist = :tools" \
  --expression-attribute-values '{":tools": {"L": [
    {"S": "web_search"},
    {"S": "file"},
    {"S": "browser"}
  ]}}'
```

> **Skills vs Tools 的区别：**
> - `defaultSkills` — 从 S3 加载的技能包（如 `jina-reader`、`excel-gen`），由 `skill_loader.py` 在 microVM 启动时注入
> - `toolAllowlist` — OpenClaw 内置工具的白名单（如 `shell`、`file`、`code_execution`），控制 Agent 可调用的底层能力

### 3. Agent 行为配置（CONFIG#agent-config）

Agent 行为参数（记忆压缩、上下文窗口、响应语言）存储在 `SK = CONFIG#agent-config`，支持职位级别和员工级别覆盖。

**查看当前配置：**

```bash
aws dynamodb get-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#agent-config"}}'
```

**设置职位级别的 Agent 配置：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#agent-config"}}' \
  --update-expression "SET positionConfig.#pid = :val" \
  --expression-attribute-names '{"#pid": "pos-exec"}' \
  --expression-attribute-values '{":val": {"M": {
    "recentTurnsPreserve": {"N": "20"},
    "compactionMode": {"S": "summary"},
    "maxTokens": {"N": "8192"},
    "language": {"S": "中文"}
  }}}'
```

**设置员工级别的 Agent 配置（覆盖职位配置）：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#agent-config"}}' \
  --update-expression "SET employeeConfig.#eid = :val" \
  --expression-attribute-names '{"#eid": "emp-001"}' \
  --expression-attribute-values '{":val": {"M": {
    "recentTurnsPreserve": {"N": "30"},
    "language": {"S": "English"}
  }}}'
```

**可配置参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `recentTurnsPreserve` | Number | 记忆压缩时保留的最近对话轮数 |
| `compactionMode` | String | 压缩模式（如 `summary`） |
| `maxTokens` | Number | 模型最大输出 token 数 |
| `language` | String | 响应语言偏好（如 `中文`、`English`、`日本語`） |

### 4. 知识库分配（CONFIG#kb-assignments）

控制每个职位注入哪些知识库文档，存储在 `SK = CONFIG#kb-assignments`。

**为职位添加知识库：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#kb-assignments"}}' \
  --update-expression "SET positionKBs.#pid = :kbs" \
  --expression-attribute-names '{"#pid": "pos-fa"}' \
  --expression-attribute-values '{":kbs": {"L": [
    {"S": "kb-policies"},
    {"S": "kb-onboarding"},
    {"S": "kb-org-directory"},
    {"S": "kb-finance"},
    {"S": "kb-legal"}
  ]}}'
```

### 5. Runtime 路由（CONFIG#routing）

控制职位路由到哪个 AgentCore Runtime（Standard / Executive），存储在 `SK = CONFIG#routing`。

**设置职位的 Runtime 路由：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#routing"}}' \
  --update-expression "SET position_runtime.#pid = :rid" \
  --expression-attribute-names '{"#pid": "pos-exec"}' \
  --expression-attribute-values '{":rid": {"S": "<executive-runtime-id>"}}'
```

**设置员工的 Runtime 覆盖（跳过职位路由）：**

```bash
aws dynamodb update-item \
  --table-name <Table> \
  --key '{"PK": {"S": "ORG#acme"}, "SK": {"S": "CONFIG#routing"}}' \
  --update-expression "SET employee_override.#eid = :rid" \
  --expression-attribute-names '{"#eid": "emp-001"}' \
  --expression-attribute-values '{":rid": {"S": "<executive-runtime-id>"}}'
```

### 配置生效时机

- **模型和 Agent 配置：** microVM 冷启动时从 DDB 读取并应用。已运行的 session 不会立即生效，需要通过 `StopRuntimeSession` API 强制刷新，或等待 session 自然过期后重建。
- **Skills 和工具白名单：** 在 `workspace_assembler` 组装工作区时生效，即 microVM 启动阶段。
- **知识库：** 同 Skills，在 session 冷启动时注入。
- **Runtime 路由：** 下一次消息路由时立即生效（Tenant Router 每次请求实时查询 DDB）。

## Runtime 与 Session

一个 Runtime 是资源池（镜像 + IAM + 模型），对应多个 Session。AgentCore 为每个 Session 启动独立 Firecracker microVM，实现计算和工作区隔离。
