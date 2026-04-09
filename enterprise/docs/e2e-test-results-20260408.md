# E2E Deployment Audit & Test Results — 2026-04-08

## Test Environments

| Environment | Region | Instance | Stack | Status |
|-------------|--------|----------|-------|--------|
| **Production** | us-east-1 | i-0aa07bd9a04fa2255 | openclaw-multitenancy | Healthy |
| **Verify** | us-west-2 | i-00f2ee133c77d30a8 | openclaw-verify-e2e | Tested |

---

## Phase 1: Script Audit — Bugs Found & Fixed

### Bug 1 (Critical): ECS Task Hardcoded DynamoDB Values
- **File:** `enterprise/clawdbot-bedrock-agentcore-multitenancy.yaml`
- **Before:** `DYNAMODB_TABLE=openclaw-enterprise`, `DYNAMODB_REGION=us-east-2` hardcoded in AlwaysOnTaskDefinition
- **Impact:** Any stack with name != `openclaw-enterprise` → always-on ECS agents fail
- **Fix:** Changed to `!Ref AWS::StackName` and `!Ref AWS::Region`; S3_BUCKET now respects `WorkspaceBucketName` parameter
- **Verified:** `aws cloudformation validate-template` passes

### Bug 2 (Critical): deploy.sh Missing SOUL Template Upload
- **File:** `enterprise/deploy.sh` Step 5
- **Before:** Only uploaded `agent-container/templates/default.md` to S3. Global `AGENTS.md`, `TOOLS.md`, and all position SOUL templates were never uploaded.
- **Impact:** Fresh deploys → "Missing workspace template: AGENTS.md" error. This is the bug colleague reported.
- **Fix:** Added `aws s3 sync` for `soul-templates/global/` and `soul-templates/positions/` directories
- **Verified:** Dry-run on production S3 shows 3 global + 12 position files would upload. Applied to verify S3 — confirmed AGENTS.md, TOOLS.md, SOUL.md + 11 positions now present.

### Bug 3 (Medium): .env.verify Mismatched DYNAMODB_TABLE
- **File:** `enterprise/.env.verify`
- **Before:** `DYNAMODB_TABLE=openclaw-verify-db` but `STACK_NAME=openclaw-verify-e2e`
- **Impact:** IAM policy scopes DynamoDB to `table/${StackName}` → AccessDeniedException
- **Fix:** Set `DYNAMODB_TABLE=` (empty, defaults to STACK_NAME)

### Bug 4 (Low): .env.verify JWT_SECRET Command Substitution
- **File:** `enterprise/.env.verify`
- **Before:** `JWT_SECRET=verify-jwt-secret-$(openssl rand -hex 16)` — literal, not expanded
- **Fix:** Set `JWT_SECRET=` (empty, deploy.sh auto-generates)

### Gap 1 (Medium): Bedrock Model Validation
- **File:** `enterprise/deploy.sh` after prerequisites check
- **Before:** No check if Bedrock model is enabled in the account
- **Fix:** Added non-blocking warning with `aws bedrock get-foundation-model`. Strips `global.`/`us.` prefix for cross-region inference model IDs.
- **Verified:** `global.amazon.nova-2-lite-v1:0` → strips to `amazon.nova-lite-v1:0` → returns model details

---

## Phase 3: E2E Verification Results

### Verify Environment (us-west-2)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Admin service active | PASS | PID 552, port 8099 |
| 2 | DynamoDB accessible | PASS | 20 employees returned |
| 3 | Login API | PASS | Returns JWT with correct password |
| 4 | S3 global SOUL templates | PASS | AGENTS.md + TOOLS.md + SOUL.md present (after fix) |
| 5 | S3 position templates | PASS | 11 positions uploaded |
| 6 | CFN template validates | PASS | No syntax errors |
| 7 | Model validation logic | PASS | Strips prefix, resolves correctly |

### Production Environment (us-east-1)

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Admin service active | PASS | HTTP 200 |
| 2 | Employee count | PASS | 26 employees |
| 3 | Gateway running | PASS | Port 18789, PID 92129 |
| 4 | IM bots configured | PASS | Telegram, Discord, Feishu, WhatsApp — tokens valid |
| 5 | Today's UI changes deployed | PASS | SOUL-centric Positions, Skill assignment, IM Channels |

### Services Not Running on Verify

| Service | Status | Reason |
|---------|--------|--------|
| tenant-router | inactive | Minimal test env, no AgentCore traffic |
| bedrock-proxy-h2 | inactive | Same as above |
| openclaw-gateway | inactive | Gateway not initialized (no IM bots configured) |

These are expected for a verify-only environment that tests admin console + DynamoDB but not full agent pipeline.

---

## Deliverables

| # | File | Status |
|---|------|--------|
| 1 | `enterprise/clawdbot-bedrock-agentcore-multitenancy.yaml` | Fixed ECS env hardcodes |
| 2 | `enterprise/deploy.sh` | Fixed SOUL upload + added model validation |
| 3 | `enterprise/.env.verify` | Fixed DYNAMODB_TABLE + JWT_SECRET |
| 4 | `enterprise/docs/ENTERPRISE-OPERATIONS-GUIDE.md` | **NEW** — Complete deployment + operations guide |
| 5 | `enterprise/docs/e2e-test-results-20260408.md` | **NEW** — This document |

---

## Root Cause: Colleague's "Missing workspace template: AGENTS.md"

**Confirmed root cause:** `deploy.sh` Step 5 never uploaded `AGENTS.md` to S3 `_shared/soul/global/`. The OpenClaw agent container's `workspace_assembler.py` tries to download `_shared/soul/global/AGENTS.md` at session start. When it doesn't exist, it falls back to the local filesystem `$HOME/docs/reference/templates/AGENTS.md`, which also doesn't exist on a fresh enterprise deploy (only on single-instance CFN which runs `openclaw gateway install`).

**Fix applied:** deploy.sh now syncs the full `soul-templates/` directory (SOUL.md + AGENTS.md + TOOLS.md + 11 position templates) to S3 during Step 5.

---

## Recommendations for Next Steps

1. **Ask colleague to re-run:** `bash deploy.sh --skip-build --skip-seed` on their environment (or just `--skip-build` to re-seed with latest templates)
2. **Test openclaw tui:** After fix, the AgentCore path should work. If `openclaw tui` on EC2 still fails, that's a separate local CLI issue (not enterprise path)
3. **Gateway initialization:** If colleague wants IM channels, they need to run the Gateway UI setup as documented in Section 4.5 of the Operations Guide
