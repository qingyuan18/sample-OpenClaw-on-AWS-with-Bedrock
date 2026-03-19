# OpenClaw Enterprise Console — PRD v3

日期: 2026-03-20
版本: v3.0

---

## 产品定位

把"个人 AI 助手"变成"组织级数字员工平台"。

Admin Console 不是运维工具，是企业 AI 数字员工的中枢神经系统——
管理组织架构、制造 Agent、编排协作、连接渠道、注入知识、治理合规、运营增长。

---

## 十层架构

```
┌─────────────────────────────────────────────────────────┐
│ 10. 生态层   多租户 · 合作伙伴 · 白标 · ISV 市场       │
├─────────────────────────────────────────────────────────┤
│  9. 增长层   采纳度看板 · ROI 计算器 · 引导向导 · Champion│
├─────────────────────────────────────────────────────────┤
│  8. 运营层   用量计费 · 成本归因 · 预算管理             │
├─────────────────────────────────────────────────────────┤
│  7. 运维层   健康监控 · Agent KPI · 变更管理 · 灰度发布 │
├─────────────────────────────────────────────────────────┤
│  6. 治理层   审计中心 · 合规报告 · PII 检测 · 数据主权  │
├─────────────────────────────────────────────────────────┤
│  5. 智能层   知识库管理 · 多模型路由 · RAG 管理         │
├─────────────────────────────────────────────────────────┤
│  4. 连接层   渠道管理 · 连接器市场 · 凭证保险箱 · 数据流│
├─────────────────────────────────────────────────────────┤
│  3. 协作层   员工-Agent 绑定 · 人机工作流 · 审批 · 接管 │
├─────────────────────────────────────────────────────────┤
│  2. Agent 层 Agent 工厂 · Workspace 模板 · Skill 市场   │
├─────────────────────────────────────────────────────────┤
│  1. 组织层   组织架构 · 岗位管理 · 权限引擎             │
└─────────────────────────────────────────────────────────┘
```

---

## 导航结构 (功能模块)

```
🦞 OpenClaw Enterprise
│
├── 📊 Dashboard                         ← 组织级总览 (跨层聚合)
│
├── 🏢 组织管理                           ← 第 1 层: 组织层
│   ├── 部门树
│   ├── 岗位管理
│   ├── 员工管理
│   └── 飞书/钉钉同步
│
├── 🤖 Agent 工厂                         ← 第 2 层: Agent 层
│   ├── Agent 创建/配置
│   ├── SOUL 编辑器 (带实时预览)
│   └── 模板市场
│
├── 📂 Workspace 管理                     ← 第 2 层: Agent 层
│   ├── 三层文件管理器 (全局/岗位/个人)
│   ├── 继承关系可视化
│   └── Diff 对比
│
├── 🧩 Skill 市场                         ← 第 2 层: Agent 层
│   ├── 内置 / 自建 / 社区 Skill
│   ├── 按岗位推荐
│   └── 审批上架
│
├── 🔗 绑定 & 路由                        ← 第 3+4 层: 协作+连接
│   ├── 员工 ↔ Agent 绑定
│   ├── 渠道路由规则
│   └── 可视化拓扑图
│
├── 📚 知识库                             ← 第 5 层: 智能层
│   ├── 文档管理
│   ├── 索引状态
│   ├── 权限映射
│   └── 检索测试
│
├── 📈 监控中心                           ← 第 7 层: 运维层
│   ├── Agent 健康仪表盘
│   ├── 实时 Session 监控
│   └── 异常告警
│
├── 🔐 审计中心                           ← 第 6 层: 治理层
│   ├── 对话审计
│   ├── 敏感操作日志
│   └── 合规报告导出
│
├── 💰 用量 & 计费                        ← 第 8 层: 运营层
│   ├── 按组织/部门/员工/Agent 的 Token 用量
│   ├── 成本分析
│   └── 预算管理
│
└── ⚙️ 系统设置
    ├── LLM Provider 配置
    ├── 全局安全策略
    └── SSO / IdP 集成
```

---

## 模块详细设计

### 1. 组织管理 (第 1 层: 组织层)

#### 1.1 部门树

可视化的组织架构树，支持拖拽调整层级。

```
ACME Corp
├── Engineering (15 人)
│   ├── Platform Team (5)
│   ├── Backend Team (6)
│   └── Frontend Team (4)
├── Sales (8 人)
│   ├── Enterprise (3)
│   └── SMB (5)
├── Finance (5 人)
└── HR (3 人)
```

操作: 新增/编辑/删除部门、拖拽调整层级、批量导入
数据源: SSM `/openclaw/{stack}/org/departments/*`

#### 1.2 岗位管理

每个岗位是一个 Agent 配置模板的锚点。

| 字段 | 说明 |
|------|------|
| 岗位名称 | SA, SDE, PM, AE, Recruiter... |
| 所属部门 | 关联部门树 |
| 默认 SOUL 模板 | 岗位级 SOUL.md |
| 默认 Skills | 岗位级 skill 集合 |
| 默认 Knowledge | 岗位级知识库绑定 |
| 工具权限 | 岗位级 tool allowlist |
| 成员数 | 当前绑定的员工数 |

操作: CRUD、从模板市场导入、复制岗位

#### 1.3 员工管理

| 字段 | 说明 |
|------|------|
| 姓名 | 真实姓名 |
| 工号 | 企业内部 ID |
| 岗位 | 关联岗位 (继承 Agent 配置) |
| 渠道 | WhatsApp / Telegram / Slack / 飞书 |
| Agent 状态 | Active / Idle / Archived |
| 个人偏好 | USER.md 摘要 |

操作: 新增、编辑、停用、归档、批量导入

#### 1.4 飞书/钉钉同步

```
┌─────────────────────────────────────────────────────────┐
│  Organization Sync                                       │
│                                                         │
│  Source: [飞书 ▼]  Status: ✅ Connected                  │
│  Last sync: 2 hours ago · Next: in 4 hours              │
│                                                         │
│  Sync Preview:                                          │
│  + 2 new employees (张三, 李四)                          │
│  ~ 1 department renamed (Tech → Engineering)            │
│  - 1 employee left (王五 → archive Agent)               │
│                                                         │
│  [Sync Now]  [Configure]  [View History]                │
└─────────────────────────────────────────────────────────┘
```

---

### 2. Agent 工厂 (第 2 层: Agent 层)

#### 2.1 Agent 创建/配置

Wizard 流程:

```
Step 1: 选择模式
  ○ 从岗位模板创建 (推荐)
  ○ 从模板市场选择
  ○ 空白创建

Step 2: 基础配置
  名称: [SA Agent - 张三]
  绑定员工: [张三 ▼]
  岗位: [Solutions Architect ▼] (自动继承模板)
  渠道: [☑ Telegram] [☑ Slack] [☐ WhatsApp]

Step 3: SOUL 编辑 (三层预览)
  [全局层 🔒] + [岗位层 ✏️] + [个人层 ✏️]
  → 实时预览合并后的完整 SOUL.md

Step 4: Skills 配置
  继承: ✅ jina-reader, ✅ deep-research (全局)
  岗位:  ✅ 架构图生成, ✅ 成本计算器 (SA 岗位)
  个人:  [+ 添加个人 skill]

Step 5: 知识库绑定
  继承: ✅ Company Policies (全局)
  岗位:  ✅ Architecture Standards (Engineering)
  个人:  [+ 挂载项目知识库]

Step 6: 测试 & 发布
  [发送测试消息]  [灰度发布 10%]  [全量发布]
```

#### 2.2 SOUL 编辑器

核心交互: 三栏编辑器 + 实时预览。

```
┌──────────────────────────────────────────────────────────┐
│  SOUL Editor: SA Agent                                    │
├──────────┬──────────┬──────────┬─────────────────────────┤
│ 🔒 全局  │ ✏️ 岗位  │ ✏️ 个人  │  👁 Preview (merged)    │
│          │          │          │                         │
│ You are  │ You are  │ I prefer │ [完整合并后的 SOUL.md   │
│ an AI    │ a Solut- │ concise  │  实时渲染，高亮显示     │
│ assistant│ ions     │ answers  │  每段来自哪一层]        │
│ for ACME │ Architect│ and code │                         │
│ Corp.    │ special- │ examples │  🔒 "You are an AI..."  │
│          │ izing in │ over     │  📋 "You are a SA..."   │
│ You MUST │ AWS...   │ long     │  👤 "I prefer concise"  │
│ follow   │          │ explan-  │                         │
│ company  │ When     │ ations.  │                         │
│ data     │ reviewing│          │                         │
│ policies.│ archit-  │          │                         │
│          │ ectures, │          │                         │
│ [只读]   │ always   │          │                         │
│          │ check... │          │                         │
├──────────┴──────────┴──────────┴─────────────────────────┤
│ Version: v3 · Last edit: 2h ago · [Diff with v2] [Save] │
└──────────────────────────────────────────────────────────┘
```

#### 2.3 模板市场

```
┌─────────────────────────────────────────────────────────┐
│  Template Market                                         │
│  [Search: ________]  [Filter: All ▼]                     │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 🏗️ SA    │ │ 💻 SDE   │ │ 📊 PM    │ │ 💼 Sales │   │
│  │ Template │ │ Template │ │ Template │ │ Template │   │
│  │          │ │          │ │          │ │          │   │
│  │ 7 skills │ │ 12 skills│ │ 5 skills │ │ 8 skills │   │
│  │ 3 KB     │ │ 2 KB     │ │ 4 KB     │ │ 3 KB     │   │
│  │ ⭐ 4.8   │ │ ⭐ 4.6   │ │ ⭐ 4.5   │ │ ⭐ 4.3   │   │
│  │ 128 uses │ │ 256 uses │ │ 89 uses  │ │ 67 uses  │   │
│  │          │ │          │ │          │ │          │   │
│  │ [Use]    │ │ [Use]    │ │ [Use]    │ │ [Use]    │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ 👥 HR    │ │ 📞 CS    │ │ 🔧 DevOps│                │
│  │ Template │ │ Template │ │ Template │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  [+ Create Custom Template]  [Import from GitHub]       │
└─────────────────────────────────────────────────────────┘
```

---

### 3. Workspace 管理 (第 2 层: Agent 层)

#### 3.1 三层文件管理器

核心交互: 左侧三层树 + 右侧文件编辑器 + 底部继承关系。

```
┌──────────────────────┬──────────────────────────────────┐
│  Workspace Explorer  │  File: SOUL.md                    │
│                      │                                  │
│  📁 Global (全局)    │  # SA Agent - 张三                │
│  ├── SOUL.md    🔒   │                                  │
│  ├── AGENTS.md  🔒   │  ## Global (inherited, locked)    │
│  ├── TOOLS.md   🔒   │  You are an AI assistant for     │
│  └── skills/         │  ACME Corp...                    │
│      ├── web-search  │                                  │
│      └── s3-files    │  ## Position: SA (editable)       │
│                      │  You specialize in AWS cloud     │
│  📁 Position: SA     │  architecture...                 │
│  ├── SOUL.md    ✏️   │                                  │
│  ├── AGENTS.md  ✏️   │  ## Personal (editable)           │
│  ├── skills/         │  I prefer concise answers...     │
│  │   ├── arch-gen    │                                  │
│  │   └── cost-calc   │                                  │
│  └── knowledge/      │                                  │
│      └── sa-docs     │                                  │
│                      │                                  │
│  📁 Personal: 张三   │                                  │
│  ├── USER.md    ✏️   │                                  │
│  ├── MEMORY.md  🔒👤 │                                  │
│  └── memory/         │                                  │
│      ├── 03-20.md    │                                  │
│      └── 03-19.md    │                                  │
├──────────────────────┴──────────────────────────────────┤
│  Inheritance: Global ──▶ SA Position ──▶ 张三 Personal   │
│  Effective files: 14 (6 global + 5 position + 3 personal)│
└─────────────────────────────────────────────────────────┘
```

#### 3.2 继承关系可视化

```
Global SOUL.md ──────┐
                     ├──▶ Merged SOUL.md (张三 sees this)
SA Position SOUL.md ─┤
                     │
张三 Personal ───────┘

Legend: 🔒 = locked (cannot override)  ✏️ = editable  📎 = append-only
```

#### 3.3 Diff 对比

选择两个版本 → 并排 diff 显示变更。
用于: 版本回滚前确认、A/B 测试对比、审计变更。

---

### 4. Skill 市场 (第 2 层: Agent 层)

#### 4.1 三类 Skill

| 类型 | 来源 | 管理方式 |
|------|------|---------|
| 内置 (Layer 1) | Docker 镜像预装 | IT rebuild 镜像升级 |
| 自建 (Layer 2) | 企业内部开发，S3 上传 | IT 审核 + 上架 |
| 社区 (Layer 3) | ClawHub 市场，预构建 bundle | IT 审批 + CodeBuild 构建 |

#### 4.2 按岗位推荐

```
┌─────────────────────────────────────────────────────────┐
│  Skill Market                                            │
│                                                         │
│  Recommended for: [SA ▼]                                 │
│                                                         │
│  ⭐ Recommended for SA:                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ 🏗️ Arch  │ │ 💰 Cost  │ │ 📐 Well- │                │
│  │ Diagram  │ │ Calc     │ │ Arch     │                │
│  │ Gen      │ │          │ │ Review   │                │
│  │ ✅ Inst. │ │ ✅ Inst. │ │ Available│                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                         │
│  All Skills:                                            │
│  [内置 (3)] [自建 (4)] [社区 (12)] [待审批 (2)]         │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

#### 4.3 审批上架

自建/社区 skill 上架流程:
```
开发者提交 → 自动安全扫描 → IT 人工审核 → 测试沙箱 → 审批上架
                                                    ↓
                                              按岗位分发
```

---

### 5. 绑定 & 路由 (第 3+4 层: 协作+连接)

#### 5.1 员工 ↔ Agent 绑定

```
┌─────────────────────────────────────────────────────────┐
│  Binding Manager                                         │
│                                                         │
│  ┌─ 1:1 Private ────────────────────────────────────┐   │
│  │ 张三 ↔ SA Agent (张三)     Telegram  Active       │   │
│  │ 李四 ↔ SA Agent (李四)     WhatsApp  Active       │   │
│  │ Carol ↔ Finance Agent      Slack     Active       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ N:1 Shared ─────────────────────────────────────┐   │
│  │ IT Help Desk Agent ← 全员 (31人)  Discord         │   │
│  │ 前台接待 Agent ← Sales (8人)      飞书            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ 1:N Multi-Agent ────────────────────────────────┐   │
│  │ 张三 → SA Agent + Code Review Agent + 写作 Agent  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Create Binding]  [Bulk Assign by Position]          │
└─────────────────────────────────────────────────────────┘
```

#### 5.2 渠道路由规则

```
Rule Engine:
  IF channel=telegram AND user.dept=Engineering
    → route to user's 1:1 SA Agent
  IF channel=discord AND message.startsWith("/helpdesk")
    → route to IT Help Desk Agent (shared)
  IF channel=slack AND user.role=Finance
    → route to Finance Agent
  DEFAULT → route to user's default 1:1 Agent
```

#### 5.3 可视化拓扑图

Canvas 渲染的交互式拓扑:
- 节点: 员工 (圆)、Agent (六边形)、渠道 (方)
- 边: 绑定关系 (实线)、委派关系 (虚线)
- 颜色: Active (绿)、Idle (灰)、Error (红)
- 交互: 点击节点查看详情、拖拽调整布局

---

### 6. 知识库 (第 5 层: 智能层)

#### 6.1 文档管理

```
┌─────────────────────────────────────────────────────────┐
│  Knowledge Base                                          │
│                                                         │
│  ┌─ Organization (全员) ────────────────────────────┐   │
│  │ 📋 Company Policies     12 docs  ✅ Indexed       │   │
│  │ 📖 Product Docs         45 docs  🔄 Indexing...   │   │
│  │ 🎓 Onboarding           6 docs   ✅ Indexed       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Department ─────────────────────────────────────┐   │
│  │ Engineering/                                      │   │
│  │   📐 Arch Standards    8 docs  ✅ Indexed         │   │
│  │   🔧 Runbooks         15 docs  ✅ Indexed         │   │
│  │ Sales/                                            │   │
│  │   📈 Case Studies     12 docs  ✅ Indexed         │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [+ Upload]  [Sync from Confluence]  [Sync from Notion] │
└─────────────────────────────────────────────────────────┘
```

#### 6.2 索引状态

每个知识库显示: 文档数、索引状态、最后更新、向量数、存储大小。

#### 6.3 权限映射

```
Knowledge Base          Accessible By
─────────────────────   ──────────────────────
Company Policies        All employees
Arch Standards          Engineering dept only
Case Studies            Sales + SA positions
HR Policies             HR dept only
Financial Reports       Finance + C-level
```

#### 6.4 检索测试

管理员输入查询 → 显示检索结果 + 来源文档 + 相关度分数。
用于验证知识库质量和权限是否正确。

---

### 7. 监控中心 (第 7 层: 运维层)

#### 7.1 Agent 健康仪表盘

四维度: 实例状态 / 性能 / 质量 / 成本 (详见 PRD v2 模块四)

#### 7.2 实时 Session 监控

```
┌─────────────────────────────────────────────────────────┐
│  Live Sessions (12 active)                               │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 张三 ↔ SA Agent     12min  Telegram  3 turns     │   │
│  │   └─ Current: "Review this architecture diagram" │   │
│  │ 李四 ↔ SA Agent      3min  WhatsApp  1 turn      │   │
│  │   └─ Current: "Calculate cost for 100 EC2..."    │   │
│  │ IT Desk ↔ 5 users    8min  Discord   15 turns    │   │
│  │   └─ Current: "VPN connection issue"             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [🔴 Take Over]  — 管理员可实时接管任何 Session          │
└─────────────────────────────────────────────────────────┘
```

#### 7.3 异常告警

| 告警类型 | 触发条件 | 动作 |
|---------|---------|------|
| Agent crash loop | 3 次重启 in 5min | 通知 IT + 自动降级 |
| Channel auth expired | WhatsApp/Telegram token 过期 | 通知管理员 |
| Memory 膨胀 | MEMORY.md > 50MB | 通知用户 + 建议压缩 |
| Context window 接近上限 | > 90% 利用率 | 自动 compaction |
| 预算超支 | 部门月预算 > 80% | 通知部门管理员 |
| 敏感信息泄露 | PII 检测触发 | 自动拦截 + 通知安全团队 |

---

### 8. 审计中心 (第 6 层: 治理层)

#### 8.1 对话审计

全量对话日志，加密存储，支持:
- 按员工/Agent/时间范围检索
- 关键词搜索
- 敏感信息高亮
- 导出 (加密 PDF/CSV)

#### 8.2 敏感操作日志

| 操作类型 | 记录内容 |
|---------|---------|
| Tool 执行 | shell 命令、文件读写、API 调用 |
| 权限变更 | 谁改了谁的权限、改前改后 |
| Agent 配置变更 | SOUL.md/AGENTS.md 每次编辑 |
| 知识库访问 | 谁查了什么文档 |
| 审批决策 | 谁批准/拒绝了什么请求 |

#### 8.3 合规报告导出

一键生成: SOC 2 / 等保 2.0 / GDPR 审计报告
包含: 数据流向图、访问控制矩阵、操作日志摘要、异常事件统计

---

### 9. 用量 & 计费 (第 8 层: 运营层)

#### 9.1 多维度用量

```
┌─────────────────────────────────────────────────────────┐
│  Usage Analytics                                         │
│                                                         │
│  Dimension: [组织 ▼] [部门 ▼] [员工 ▼] [Agent ▼]       │
│  Period:    [本月 ▼]                                     │
│                                                         │
│  ┌─ Token Usage ────────────────────────────────────┐   │
│  │ [Stacked area: input/output by department]       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─ Cost Breakdown ─────────────────────────────────┐   │
│  │ Engineering:  $12.50 (45%)  ████████████░░░░░░   │   │
│  │ Sales:        $ 8.20 (30%)  ████████░░░░░░░░░░   │   │
│  │ Finance:      $ 4.10 (15%)  ████░░░░░░░░░░░░░░   │   │
│  │ HR:           $ 2.80 (10%)  ███░░░░░░░░░░░░░░░   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  vs ChatGPT Plus: $620/mo → OpenClaw: $27.60/mo (96%↓) │
└─────────────────────────────────────────────────────────┘
```

#### 9.2 预算管理

| 维度 | 预算 | 已用 | 预测 | 状态 |
|------|------|------|------|------|
| Engineering | $50/mo | $12.50 | $38 | ✅ On track |
| Sales | $30/mo | $8.20 | $25 | ✅ On track |
| Finance | $20/mo | $4.10 | $12 | ✅ Under budget |
| 张三 (个人) | $5/mo | $3.80 | $5.20 | ⚠ Near limit |

超预算动作: 告警 → 降级模型 (Sonnet→Nova) → 限流 → 暂停

---

### 10. 系统设置

#### 10.1 LLM Provider 配置

```
┌─────────────────────────────────────────────────────────┐
│  Model Configuration                                     │
│                                                         │
│  Default Model: [Nova 2 Lite ▼]                          │
│  Fallback Model: [Nova Pro ▼]                            │
│                                                         │
│  Per-Position Override:                                  │
│  SA:      Claude Sonnet 4.5 (需要深度推理)               │
│  Sales:   Nova 2 Lite (成本优先)                         │
│  Finance: Nova Pro (平衡)                                │
│                                                         │
│  Available Models:                                      │
│  ✅ Nova 2 Lite    $0.30/$2.50   Enabled                │
│  ✅ Nova Pro       $0.80/$3.20   Enabled                │
│  ✅ Claude Sonnet  $3.00/$15.00  Enabled                │
│  ☐ Claude Opus    $15/$75       Disabled (cost)         │
│  ☐ DeepSeek R1    $0.55/$2.19   Disabled                │
└─────────────────────────────────────────────────────────┘
```

#### 10.2 全局安全策略

- Always-blocked tools: install_skill, load_extension, eval
- PII 检测: 开/关 + 检测模式 (block / redact / alert)
- 数据主权: 数据不出 Region 开关
- 对话保留策略: 90 天 / 180 天 / 365 天 / 永久

#### 10.3 SSO / IdP 集成

支持: SAML 2.0, OIDC, 飞书 SSO, 钉钉 SSO, AWS IAM Identity Center

---

## 增长层 & 生态层 (第 9-10 层)

### 增长层 (v1.1+)

| 功能 | 说明 |
|------|------|
| 采纳度看板 | DAU/WAU/MAU、按部门的使用率热力图、未激活员工列表 |
| ROI 计算器 | 输入: 员工数、平均工资、AI 节省时间 → 输出: 年化 ROI |
| 引导向导 | 新员工首次使用的 Onboarding Wizard |
| Champion 管理 | 识别高活跃用户，培养为部门推广大使 |

### 生态层 (v2.0+)

| 功能 | 说明 |
|------|------|
| 多租户 | 一套平台服务多个企业客户 (MSP 模式) |
| 合作伙伴管理 | ISV 接入、分润、联合解决方案 |
| 白标 | 去掉 OpenClaw 品牌，换成客户品牌 |
| ISV 市场 | 第三方 Skill/Template/Connector 市场 |

---

## 实施优先级

### v1.0 (4 周)

| 周 | 模块 | 交付物 |
|---|------|--------|
| W1 | 组织管理 + Agent 工厂 | 部门树、岗位管理、Agent 创建 Wizard、SOUL 编辑器 |
| W2 | Workspace + Skill 市场 | 三层文件管理器、继承可视化、Skill 目录 + 审批 |
| W3 | 绑定路由 + 知识库 + 监控 | 绑定管理、拓扑图、知识库 CRUD、健康仪表盘 |
| W4 | 审计 + 计费 + 设置 | 对话审计、合规报告、用量分析、LLM 配置 |

### v1.1 (4 周)

- 飞书/钉钉同步
- Agent→Agent 委派
- A/B 测试 + 灰度发布
- 增长层 (采纳度看板、ROI 计算器)
- SSO 集成

### v2.0

- 多租户 MSP 模式
- ISV 市场
- 白标
- Hallucination 检测
- 移动端

---

## 技术栈 (不变)

```
Frontend:  React 19 + TypeScript + Vite + Cloudscape Design System
Backend:   Python FastAPI + boto3
Storage:   SSM + S3 + CloudWatch + DynamoDB
Auth:      Gateway Token → Cognito (v1.1) → SSO (v1.1)
Deploy:    EC2 serve 或 S3 + CloudFront
```
