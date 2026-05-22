# Skills 上传指南：Claude Skills → OpenClaw Enterprise

## 概述

OpenClaw Enterprise 的 Skill 系统基于 S3 热加载，与业界标准的 Claude Skills（SKILL.md 格式）不同。本文档说明如何将标准 Claude Skill 转换为 OpenClaw Enterprise 格式并上传。

## 格式对比

| 项目 | Claude Skills（标准） | OpenClaw Enterprise |
|------|----------------------|---------------------|
| 入口文件 | `SKILL.md`（Markdown frontmatter） | `skill.json`（JSON） |
| 权限控制 | 无（全员可用） | `allowedRoles` / `blockedRoles` |
| 存储位置 | 本地 `~/.claude/skills/` | S3 `_shared/skills/{name}/` |
| 加载时机 | Claude Code 启动时 | microVM 冷启动时由 `skill_loader.py` 拉取 |
| API 密钥 | 环境变量或 `.env` | SSM Parameter Store 自动注入 |

## 转换步骤

### 1. 创建 skill.json

标准 Claude Skill 的 `SKILL.md` frontmatter：

```markdown
---
name: my-skill
description: Do something useful
metadata:
  { "openclaw": { "requires": { "node": ">=18.0.0" } } }
---
```

转为 `skill.json`：

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Do something useful",
  "author": "Your Name",
  "layer": 2,
  "category": "productivity",
  "scope": "department",
  "requires": {
    "env": [],
    "tools": []
  },
  "permissions": {
    "allowedRoles": ["*"],
    "blockedRoles": []
  }
}
```

### 2. 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Skill 标识符，kebab-case |
| `version` | 是 | 语义化版本号 |
| `description` | 是 | 一句话描述 |
| `author` | 否 | 作者 |
| `layer` | 是 | `1` = Docker 内置，`2` = S3 热加载脚本，`3` = S3 tar.gz 预编译包 |
| `category` | 否 | 分类：`information`、`productivity`、`development`、`communication`、`data`、`creative`、`security` |
| `scope` | 否 | `global` = 全员，`department` = 按角色过滤 |
| `requires.env` | 否 | 所需环境变量列表，由 SSM 自动注入 |
| `requires.tools` | 否 | 依赖的 OpenClaw 内置工具（如 `shell`、`file_write`、`web_fetch`） |
| `permissions.allowedRoles` | 是 | 允许使用的角色列表，`["*"]` 表示全员可用 |
| `permissions.blockedRoles` | 是 | 禁止使用的角色列表 |
| `approvalRequired` | 否 | `true` 表示每次调用需员工确认（适用于发邮件、打电话等） |

### 3. 角色列表参考

| 角色标识 | 对应职位 |
|----------|---------|
| `engineering` | SA、SDE |
| `devops` | DevOps |
| `qa` | QA |
| `sales` | AE |
| `product` | PM |
| `finance` | FA |
| `hr` | HR |
| `csm` | CSM |
| `legal` | Legal |
| `management` | 各部门 Manager |
| `intern` | 实习生（通常用于 blockedRoles） |

### 4. 整理 Skill 文件目录

```
my-skill/
├── skill.json          # 必须，权限和元数据
├── SKILL.md            # 可选，保留原始 Claude Skill 说明（OpenClaw 会读取作为 Agent 指令）
├── main.js / main.py   # 实际执行脚本
├── package.json        # 如有 Node.js 依赖
└── ...
```

## 上传到 S3

所有 Skill 统一上传到 `_shared/skills/` 目录，权限通过 `skill.json` 中的 `allowedRoles`/`blockedRoles` 控制分发给哪些角色。

```bash
BUCKET="openclaw-tenants-687912291502"
SKILL_NAME="my-skill"

aws s3 sync ./${SKILL_NAME}/ s3://${BUCKET}/_shared/skills/${SKILL_NAME}/ --region us-east-1

# 验证
aws s3 ls s3://${BUCKET}/_shared/skills/${SKILL_NAME}/ --region us-east-1
```

## 配置 API 密钥（如 Skill 需要）

如果 `skill.json` 的 `requires.env` 声明了环境变量，需要在 SSM 中存储对应密钥：

```bash
STACK_NAME="openclaw-enterprise"

# 单个 Skill 的密钥
aws ssm put-parameter \
  --name "/openclaw/${STACK_NAME}/skill-keys/${SKILL_NAME}/API_KEY" \
  --value "sk-xxx" \
  --type SecureString \
  --region us-east-1

# 全局密钥（所有 Skill 共享）
aws ssm put-parameter \
  --name "/openclaw/${STACK_NAME}/skill-keys/_global/GITHUB_TOKEN" \
  --value "ghp_xxx" \
  --type SecureString \
  --region us-east-1
```

## 注册到 Skill 目录（DynamoDB）

上传到 S3 后，还需要在 Admin Console 的 Skill 目录中注册，这样前端才能展示：

```bash
aws dynamodb put-item \
  --table-name openclaw-enterprise \
  --region us-east-2 \
  --item '{
    "PK": {"S": "ORG#acme"},
    "SK": {"S": "SKILL#my-skill"},
    "GSI1PK": {"S": "TYPE#skill"},
    "GSI1SK": {"S": "SKILL#my-skill"},
    "id": {"S": "my-skill"},
    "name": {"S": "my-skill"},
    "description": {"S": "Do something useful"},
    "version": {"S": "1.0.0"},
    "author": {"S": "Your Name"},
    "layer": {"N": "2"},
    "category": {"S": "productivity"},
    "scope": {"S": "department"},
    "permissions": {"M": {
      "allowedRoles": {"L": [{"S": "engineering"}, {"S": "sales"}]},
      "blockedRoles": {"L": [{"S": "intern"}]}
    }}
  }'
```

## 完整示例：转换 Claude "web-scraper" Skill

**原始 Claude Skill（SKILL.md）：**

```markdown
---
name: web-scraper
description: Scrape web pages and extract structured data
---
# Web Scraper
Use `node scrape.js <url>` to extract content from any URL.
```

**转换后目录结构：**

```
web-scraper/
├── skill.json
├── SKILL.md          # 保留原文，Agent 会读取作为使用说明
└── scrape.js
```

**skill.json：**

```json
{
  "name": "web-scraper",
  "version": "1.0.0",
  "description": "Scrape web pages and extract structured data",
  "author": "Community",
  "layer": 2,
  "category": "information",
  "scope": "department",
  "requires": {
    "env": [],
    "tools": ["web_fetch"]
  },
  "permissions": {
    "allowedRoles": ["engineering", "product", "devops"],
    "blockedRoles": ["intern"]
  }
}
```

**上传：**

```bash
aws s3 sync ./web-scraper/ s3://openclaw-tenants-687912291502/_shared/skills/web-scraper/ --region us-east-1
```

## 生效时机

- Skill 上传到 S3 后，**下次 microVM 冷启动时**自动加载
- 如需立即生效，可通过 `StopRuntimeSession` API 强制重建 session
- API 密钥修改后同样需要新 session 才能生效（`skill_loader.py` 在启动时从 SSM 读取）

## 快速脚本：批量转换 + 上传

仓库已提供独立脚本 [scripts/convert-and-upload.sh](scripts/convert-and-upload.sh)，会自动生成 `skill.json`（如果缺失）并同步到 S3。

```bash
./scripts/convert-and-upload.sh ./my-skill "engineering,sales"
./scripts/convert-and-upload.sh ./another-skill "*"   # 全员可用

# 自定义 bucket / region
BUCKET=my-bucket REGION=us-west-2 ./scripts/convert-and-upload.sh ./my-skill "*"
```
