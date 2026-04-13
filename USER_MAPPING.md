# 用户映射关系

## 核心链路

员工通过 IM 平台（飞书/Telegram/Discord）DM 企业统一 Bot，消息经以下链路路由：

1. **H2 Proxy 提取 userId** — 从消息中解析发送者的 IM 平台 ID（如飞书 `ou_xxx`、Telegram 数字 ID），非 Bot 名称
2. **userId → Employee** — 查询 DynamoDB `MAPPING#{channel}__{userId}` 获取 `employeeId`（员工自助扫码配对时写入）
3. **Employee → Position** — 查询 `EMP#{emp_id}` 获取 `positionId`（如 `pos-fa` 财务、`pos-exec` 高管）
4. **Position → Runtime** — 查询 `CONFIG#routing` 将职位映射到 AgentCore Runtime（Standard / Executive），决定镜像、模型、IAM 权限
5. **生成 SessionId** — 格式 `emp__{emp_id}__{hash}`，所有 IM 渠道共享同一 session，保留跨渠道上下文

## Runtime 与 Session

一个 Runtime 是资源池（镜像 + IAM + 模型），对应多个 Session。AgentCore 为每个 Session 启动独立 Firecracker microVM，实现计算和工作区隔离。
