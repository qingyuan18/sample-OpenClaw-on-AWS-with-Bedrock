"""
Admin — IM Channels Management.

Endpoints:
  /api/v1/admin/im-channel-connections
  /api/v1/admin/im-channels
  /api/v1/internal/im-binding-check
  /api/v1/internal/fast-path-usage
  /api/v1/admin/im-channels/{channel}/test
"""

import os
import json

import boto3

from fastapi import APIRouter, HTTPException, Header

import db
from shared import require_role, ssm_client, GATEWAY_REGION, STACK_NAME, get_openclaw_bin, get_openclaw_env_path

router = APIRouter(tags=["admin-im"])


# Import mapping helpers from main at call time to avoid circular imports
def _mapping_prefix():
    stack = os.environ.get("STACK_NAME", "openclaw-multitenancy")
    return f"/openclaw/{stack}/user-mapping/"


def _run_openclaw_channels() -> list:
    """Get live channel status from openclaw channels list CLI."""
    import subprocess as _sp
    try:
        result = _sp.run(
            ["sudo", "-u", "ubuntu", "env", f"PATH={get_openclaw_env_path()}", "HOME=/home/ubuntu",
             get_openclaw_bin(), "channels", "list", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.stdout:
            raw = json.loads(result.stdout)
            channels = []
            for ch_type, accounts in raw.get("chat", {}).items():
                for account in accounts:
                    channels.append({"channel": ch_type, "account": account, "type": "chat"})
            return channels
    except Exception:
        pass
    # Fallback: parse openclaw channels list text output
    try:
        result = _sp.run(
            ["sudo", "-u", "ubuntu", "env", f"PATH={env_path}", "HOME=/home/ubuntu",
             openclaw_bin, "channels", "list"],
            capture_output=True, text=True, timeout=10,
        )
        channels = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.startswith("- ") and "default" in line:
                parts = line[2:].split()
                ch_type = parts[0].lower() if parts else "unknown"
                configured = "configured" in line
                linked = "not linked" not in line
                channels.append({
                    "channel": ch_type,
                    "account": "default",
                    "configured": configured,
                    "linked": linked,
                    "raw": line,
                })
        return channels
    except Exception:
        return []


def _list_user_mappings() -> list:
    """List all user mappings — DynamoDB primary, SSM fallback."""
    ddb = db.get_user_mappings()
    if ddb:
        return ddb
    # SSM fallback for fresh deploys before migration runs
    prefix = _mapping_prefix()
    try:
        ssm = ssm_client()
        mappings = []
        params = {"Path": prefix, "Recursive": True, "MaxResults": 10}
        while True:
            resp = ssm.get_parameters_by_path(**params)
            for p in resp.get("Parameters", []):
                name = p["Name"].replace(prefix, "")
                parts = name.split("__", 1)
                if len(parts) == 2:
                    mappings.append({
                        "channel": parts[0],
                        "channelUserId": parts[1],
                        "employeeId": p["Value"],
                        "lastModified": str(p.get("LastModifiedDate", "")),
                    })
            token = resp.get("NextToken")
            if not token:
                break
            params["NextToken"] = token
        return mappings
    except Exception:
        return []


@router.get("/api/v1/admin/im-channel-connections")
def get_im_channel_connections(authorization: str = Header(default="")):
    """Per-channel employee connection table for admin management."""
    require_role(authorization, roles=["admin"])
    try:
        # 1. Get all SSM user-mapping params
        raw_mappings = _list_user_mappings()
        print(f"[im-connections] _list_user_mappings returned {len(raw_mappings)} entries")

        # 2. Employee lookup
        emps = db.get_employees()
        emp_map = {e["id"]: e for e in emps}
        print(f"[im-connections] {len(emps)} employees loaded")

        # 3. Session counts from audit log (lightweight: limit 500)
        session_counts: dict = {}
        last_active: dict = {}
        try:
            audit = db.get_audit_entries(limit=500)
            for a in audit:
                eid = a.get("actorId", "")
                if eid and a.get("eventType") == "agent_invocation":
                    session_counts[eid] = session_counts.get(eid, 0) + 1
                    ts = a.get("timestamp", "")
                    if ts > last_active.get(eid, ""):
                        last_active[eid] = ts
        except Exception as ae:
            print(f"[im-connections] audit fetch failed (non-fatal): {ae}")

        # 4. Group by channel — skip unknown/unkn prefixes
        by_channel: dict = {}
        for m in raw_mappings:
            channel = m.get("channel", "")
            if channel in ("unknown", "unkn") or not channel:
                continue
            emp_id = m.get("employeeId", "")
            emp = emp_map.get(emp_id)
            if not emp:
                continue
            channel_user_id = m.get("channelUserId", "")
            by_channel.setdefault(channel, []).append({
                "empId": emp_id,
                "empName": emp.get("name", emp_id),
                "positionName": emp.get("positionName", ""),
                "departmentName": emp.get("departmentName", ""),
                "channelUserId": channel_user_id,
                "connectedAt": m.get("lastModified", ""),
                "sessionCount": session_counts.get(emp_id, 0),
                "lastActive": last_active.get(emp_id, ""),
            })

        print(f"[im-connections] result channels: {list(by_channel.keys())}, total: {sum(len(v) for v in by_channel.values())}")
        return {"connections": by_channel}

    except Exception as e:
        print(f"[im-connections] ERROR: {e}")
        import traceback
        traceback.print_exc()
        return {"connections": {}, "error": str(e)}


@router.get("/api/v1/admin/im-channels")
def get_im_channels(authorization: str = Header(default="")):
    """Get live IM channel status from Gateway + SSM mappings count per channel."""
    require_role(authorization, roles=["admin", "manager"])
    ssm = boto3.client("ssm", region_name=GATEWAY_REGION)

    # Get all user mappings to count per channel (DynamoDB primary, SSM fallback)
    channel_counts: dict = {}
    try:
        ddb_mappings = db.get_user_mappings()
        for m in ddb_mappings:
            ch = m.get("channel", "")
            if ch:
                channel_counts[ch] = channel_counts.get(ch, 0) + 1
    except Exception:
        pass
    if not channel_counts:
        try:
            prefix = _mapping_prefix()
            resp = ssm.get_parameters_by_path(Path=prefix, Recursive=True, MaxResults=10)
            for p in resp.get("Parameters", []):
                name = p["Name"].replace(prefix, "")
                for ch in ["telegram", "discord", "slack", "whatsapp", "feishu", "dingtalk", "teams", "googlechat"]:
                    if name.startswith(f"{ch}__"):
                        channel_counts[ch] = channel_counts.get(ch, 0) + 1
                        break
        except Exception:
            pass

    # Get live Gateway channel status
    gateway_channels = _run_openclaw_channels()

    # Build enriched channel list
    all_channels = [
        {"id": "telegram",   "label": "Telegram",          "enterprise": True},
        {"id": "discord",    "label": "Discord",            "enterprise": True},
        {"id": "slack",      "label": "Slack",              "enterprise": True},
        {"id": "teams",      "label": "Microsoft Teams",    "enterprise": True},
        {"id": "feishu",     "label": "Feishu / Lark",      "enterprise": True},
        {"id": "dingtalk",   "label": "DingTalk",           "enterprise": True},
        {"id": "googlechat", "label": "Google Chat",        "enterprise": True},
        {"id": "whatsapp",   "label": "WhatsApp",           "enterprise": True},
        {"id": "wechat",     "label": "WeChat",             "enterprise": False},
    ]

    gw_by_channel = {ch["channel"]: ch for ch in gateway_channels}
    result = []
    for ch in all_channels:
        gw = gw_by_channel.get(ch["id"], {})
        configured = bool(gw) and gw.get("configured", False)
        linked = bool(gw) and gw.get("linked", False)
        if gw and "raw" not in gw:
            configured = True
            linked = True
        # External bridges (dingtalk, wechat) are not OpenClaw built-in channels.
        # Treat them as connected if they have employee mappings in DynamoDB.
        has_mappings = channel_counts.get(ch["id"], 0) > 0
        status = "connected" if (configured and linked) or (ch["id"] in ("dingtalk", "wechat") and has_mappings) else \
                 "configured" if configured else "not_connected"
        result.append({
            **ch,
            "status": status,
            "connectedEmployees": channel_counts.get(ch["id"], 0),
            "gatewayInfo": gw.get("raw", "") if gw else "",
        })
    return result


@router.get("/api/v1/internal/im-binding-check")
def im_binding_check(channel: str, channelUserId: str):
    """Internal endpoint called by H2 Proxy before routing each IM message.
    Strict enforcement: only respond to IM accounts that have a valid employee binding.
    No auth required — only accessible from the same EC2 (internal network)."""
    # Primary: DynamoDB channel-specific lookup
    m = db.get_user_mapping(channel, channelUserId)
    if m and m.get("employeeId"):
        return {"bound": True, "employeeId": m["employeeId"]}
    # Fallback: scan MAPPING# for bare channelUserId (Feishu OU IDs, etc.)
    try:
        from boto3.dynamodb.conditions import Key as _KBC, Attr as _ABC
        ddb = boto3.resource("dynamodb", region_name=os.environ.get("DYNAMODB_REGION", "us-east-2"))
        table = ddb.Table(os.environ.get("DYNAMODB_TABLE", "openclaw-enterprise"))
        resp = table.query(
            KeyConditionExpression=_KBC("PK").eq("ORG#acme") & _KBC("SK").begins_with("MAPPING#"),
            FilterExpression=_ABC("channelUserId").eq(channelUserId),
        )
        if resp.get("Items"):
            return {"bound": True, "employeeId": resp["Items"][0]["employeeId"]}
    except Exception:
        pass
    return {"bound": False}


@router.post("/api/v1/admin/im-channels/{channel}/test")
def test_im_channel(channel: str, authorization: str = Header(default="")):
    """Test bot connection for a channel by asking OpenClaw if it has the channel configured.
    OpenClaw manages bot credentials — we don't store them separately.
    Returns {ok, botName, error}."""
    require_role(authorization, roles=["admin"])
    try:
        import subprocess as _sp
        result = _sp.run(
            ["sudo", "-u", "ubuntu", "env", f"PATH={get_openclaw_env_path()}", "HOME=/home/ubuntu",
             get_openclaw_bin(), "channels", "list", "--json"],
            capture_output=True, text=True, timeout=10,
        )
        if result.stdout:
            import json as _json
            # openclaw prints plugin registration logs (with ANSI codes) before the JSON blob.
            # Find the first '{' to skip the preamble, same pattern used in server.py.
            stdout = result.stdout
            json_start = stdout.find('{')
            if json_start == -1:
                return {"ok": False, "error": "Unexpected openclaw output — no JSON found."}
            raw = _json.loads(stdout[json_start:])
            configured = raw.get("chat", {})
            # channel name in openclaw may differ: "feishu" -> "feishu", "discord" -> "discord"
            channel_key = channel.lower()
            if channel_key in configured and configured[channel_key]:
                accounts = configured[channel_key]
                return {"ok": True, "botName": f"{channel} ({', '.join(accounts)})"}
            return {
                "ok": False,
                "error": f"{channel.capitalize()} bot not configured in OpenClaw. Open Gateway UI (port 18789) → Channels → Add {channel.capitalize()}.",
            }
        return {"ok": False, "error": "Could not reach OpenClaw CLI. Ensure openclaw gateway is running."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.post("/api/v1/internal/fast-path-usage")
def fast_path_usage(body: dict):
    """Internal endpoint called by H2 Proxy after a fast-path Bedrock response.
    Writes a USAGE record to DynamoDB so cold-start requests appear in the
    Usage & Cost dashboard.  No auth — only reachable from localhost."""
    from datetime import datetime, timezone
    from decimal import Decimal

    channel = body.get("channel", "")
    user_id = body.get("userId", "")
    model = body.get("model", "unknown")
    input_tokens = int(body.get("inputTokens", 0))
    output_tokens = int(body.get("outputTokens", 0))

    # Resolve employee (agent) ID from IM binding
    mapping = db.get_user_mapping(channel, user_id)
    base_id = (mapping or {}).get("employeeId", f"{channel}__{user_id}")

    # Cost estimate (same formula as agent-container/server.py)
    _MODEL_PRICING = {
        "global.amazon.nova-2-lite-v1:0": (0.30, 2.50),
        "us.amazon.nova-pro-v1:0": (0.80, 3.20),
        "global.anthropic.claude-sonnet-4-5-20250929-v1:0": (3.00, 15.00),
        "global.anthropic.claude-opus-4-6-v1": (15.00, 75.00),
        "global.anthropic.claude-opus-4-5-20251101-v1:0": (15.00, 75.00),
        "global.anthropic.claude-haiku-4-5-20251001-v1:0": (0.80, 4.00),
        "global.anthropic.claude-sonnet-4-20250514-v1:0": (3.00, 15.00),
        "us.deepseek.r1-v1:0": (1.35, 5.40),
        "us.meta.llama3-3-70b-instruct-v1:0": (0.72, 0.72),
    }
    in_price, out_price = _MODEL_PRICING.get(model, (0.30, 2.50))
    cost = Decimal(str(round(
        input_tokens * in_price / 1_000_000 + output_tokens * out_price / 1_000_000, 6
    )))

    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    org_pk = "ORG#acme"

    try:
        ddb = boto3.resource("dynamodb", region_name=os.environ.get("DYNAMODB_REGION", "us-east-2"))
        table = ddb.Table(os.environ.get("DYNAMODB_TABLE", "openclaw-enterprise"))
        table.update_item(
            Key={"PK": org_pk, "SK": f"USAGE#{base_id}#{today}"},
            UpdateExpression=(
                "SET #d = :date, agentId = :aid, model = :model, "
                "GSI1PK = :gsi1pk, GSI1SK = :gsi1sk "
                "ADD inputTokens :inp, outputTokens :out, requests :one, cost :cost"
            ),
            ExpressionAttributeNames={"#d": "date"},
            ExpressionAttributeValues={
                ":date": today,
                ":aid": base_id,
                ":model": model,
                ":inp": input_tokens,
                ":out": output_tokens,
                ":one": 1,
                ":cost": cost,
                ":gsi1pk": "TYPE#usage",
                ":gsi1sk": f"USAGE#{today}#{base_id}",
            },
        )
        return {"ok": True, "agentId": base_id, "cost": str(cost)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
