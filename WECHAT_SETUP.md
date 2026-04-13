# 微信 Channel 接入指南（个人版 OpenClaw + AgentCore 企业版并存）

## 背景

`openclaw-agentcore` 企业版的 plugin SDK 与微信插件 `@tencent-weixin/openclaw-weixin` 不兼容。解决方案：用 NVM 隔离两个 Node 版本，分别运行企业版和个人版 Gateway。

## 架构

```
EC2 Gateway
├── openclaw-agentcore (Node 22.22.2, 端口 18789)
│   └── 飞书 / Telegram / Discord → AgentCore Runtime（多租户）
│
└── openclaw 个人版 (Node 22.21.0, 端口 18790)
│   └── 微信 → 直接调 Bedrock（单用户）
```

## 安装步骤

### 1. 安装新 Node 版本 + 个人版 OpenClaw

```bash
nvm install 22.21.0
nvm use 22.21.0
npm install -g openclaw@2026.4.11
```

### 2. 创建独立配置目录

```bash
mkdir -p /home/ubuntu/.openclaw-wechat
export OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat
```

### 3. 配置 Gateway 和 Bedrock 模型

```bash
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw config set gateway.port 18790
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw config set gateway.bind loopback
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw config set gateway.mode local
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw plugins enable amazon-bedrock
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw config set agents.defaults.model.primary "amazon-bedrock/global.anthropic.claude-opus-4-6-v1"
```

### 4. 安装微信插件并扫码绑定

```bash
nvm use 22.21.0
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat npx -y @tencent-weixin/openclaw-weixin-cli@latest install
# 终端弹出二维码 → 手机微信扫码确认
```

### 5. 启动微信 Gateway

```bash
nvm use 22.21.0
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
  nohup openclaw gateway run > /tmp/openclaw-wechat.log 2>&1 &
```

### 6. 验证

```bash
ss -tlnp | grep -E "18789|18790"
# 18789 = agentcore 企业版
# 18790 = 个人版微信
```

## 日常操作

### 重启微信 Gateway

```bash
kill -9 $(pgrep -f "openclaw-wechat")
sleep 2
nvm use 22.21.0
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat \
AWS_REGION=us-east-1 \
AWS_DEFAULT_REGION=us-east-1 \
  nohup openclaw gateway run > /tmp/openclaw-wechat.log 2>&1 &
```

### 更换微信账号

```bash
nvm use 22.21.0
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw channels logout --channel openclaw-weixin
OPENCLAW_HOME=/home/ubuntu/.openclaw-wechat openclaw channels login --channel openclaw-weixin
# 扫码绑定新账号
```

### 查看日志

```bash
tail -50 /tmp/openclaw-wechat.log
```

## 注意事项

- **不要用 `openclaw gateway stop`**，会误停 agentcore 的 systemd 服务，用 `kill -9` 管理个人版进程
- 两个 Gateway 共享同一台 EC2 的 IAM 角色访问 Bedrock
- 微信为单用户模式：扫码的微信号即为 Bot，无多租户隔离
- 微信插件限制：仅支持手机端，不支持 PC 端和群聊
