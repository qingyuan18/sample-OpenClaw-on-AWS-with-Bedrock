"""Seed DynamoDB with usage metrics, session history, and employee activity data.
Replaces all hardcoded mock data in the application."""
import argparse
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import boto3

ORG = "ORG#acme"


def seed(table_name: str, region: str):
    ddb = boto3.resource("dynamodb", region_name=region)
    table = ddb.Table(table_name)
    items = []
    now = datetime(2026, 3, 20, 10, 35, 0, tzinfo=timezone.utc)

    # =====================================================================
    # 1. Per-agent daily usage metrics (USAGE#agent-id#date)
    # =====================================================================
    agent_usage = {
        "agent-sa-jiade":    {"input": 48200, "output": 31500, "requests": 67, "cost": "0.24", "model": "claude-sonnet-4.5"},
        "agent-sa-marcus":   {"input": 42100, "output": 27800, "requests": 55, "cost": "0.21", "model": "claude-sonnet-4.5"},
        "agent-sa-daniel":   {"input": 28400, "output": 18200, "requests": 35, "cost": "0.14", "model": "claude-sonnet-4.5"},
        "agent-sde-ryan":    {"input": 42100, "output": 28300, "requests": 55, "cost": "0.21", "model": "claude-sonnet-4.5"},
        "agent-sde-sophie":  {"input": 31200, "output": 19800, "requests": 38, "cost": "0.15", "model": "nova-2-lite"},
        "agent-devops-chris":{"input": 52300, "output": 34200, "requests": 72, "cost": "0.26", "model": "nova-2-lite"},
        "agent-devops-lisa": {"input": 22400, "output": 14100, "requests": 28, "cost": "0.11", "model": "nova-2-lite"},
        "agent-qa-tony":     {"input": 18900, "output": 12300, "requests": 24, "cost": "0.09", "model": "nova-2-lite"},
        "agent-ae-mike":     {"input": 15200, "output":  9800, "requests": 18, "cost": "0.07", "model": "nova-2-lite"},
        "agent-ae-sarah":    {"input": 19800, "output": 12500, "requests": 22, "cost": "0.10", "model": "nova-2-lite"},
        "agent-pm-alex":     {"input": 35600, "output": 23400, "requests": 44, "cost": "0.18", "model": "nova-pro"},
        "agent-pm-priya":    {"input":  8200, "output":  5100, "requests": 10, "cost": "0.04", "model": "nova-2-lite"},
        "agent-fa-carol":    {"input": 22400, "output": 15600, "requests": 31, "cost": "0.11", "model": "nova-pro"},
        "agent-fa-david":    {"input": 16800, "output": 10200, "requests": 20, "cost": "0.08", "model": "nova-pro"},
        "agent-hr-jenny":    {"input": 12100, "output":  7800, "requests": 15, "cost": "0.06", "model": "nova-2-lite"},
        "agent-csm-emma":    {"input": 28900, "output": 18700, "requests": 36, "cost": "0.14", "model": "nova-2-lite"},
        "agent-legal-rachel":{"input": 14500, "output":  9200, "requests": 17, "cost": "0.07", "model": "nova-pro"},
        "agent-helpdesk":    {"input": 45600, "output": 28900, "requests": 62, "cost": "0.22", "model": "nova-2-lite"},
        "agent-onboarding":  {"input":  8900, "output":  5600, "requests": 12, "cost": "0.04", "model": "nova-2-lite"},
    }

    # Seed 7 days of usage data per agent (with slight daily variation)
    import random
    random.seed(42)
    for agent_id, base in agent_usage.items():
        for day_offset in range(7):
            date = (now - timedelta(days=6 - day_offset)).strftime("%Y-%m-%d")
            factor = 0.7 + random.random() * 0.6  # 0.7x to 1.3x variation
            items.append({
                "PK": ORG,
                "SK": f"USAGE#{agent_id}#{date}",
                "GSI1PK": "TYPE#usage",
                "GSI1SK": f"USAGE#{date}#{agent_id}",
                "agentId": agent_id,
                "date": date,
                "inputTokens": int(base["input"] * factor),
                "outputTokens": int(base["output"] * factor),
                "requests": int(base["requests"] * factor),
                "cost": str(round(float(base["cost"]) * factor, 4)),
                "model": base["model"],
            })

    # =====================================================================
    # 2. Sessions (SESSION#id)
    # =====================================================================
    sessions = [
        {"id": "sess-001", "agentId": "agent-sa-jiade",    "agentName": "SA Agent - JiaDe",    "employeeId": "emp-jiade", "employeeName": "JiaDe Wang",    "channel": "discord",   "turns": 5,  "lastMessage": "Review this architecture diagram for the new microservice", "status": "active", "startedAt": "2026-03-20T10:18:00Z", "toolCalls": 2, "tokensUsed": 4200},
        {"id": "sess-002", "agentId": "agent-sde-ryan",     "agentName": "SDE Agent - Ryan",    "employeeId": "emp-ryan",  "employeeName": "Ryan Park",     "channel": "slack",     "turns": 8,  "lastMessage": "Help me debug this race condition in the connection pool", "status": "active", "startedAt": "2026-03-20T10:05:00Z", "toolCalls": 5, "tokensUsed": 8100},
        {"id": "sess-003", "agentId": "agent-devops-chris", "agentName": "DevOps Agent - Chris","employeeId": "emp-chris", "employeeName": "Chris Morgan",  "channel": "telegram",  "turns": 12, "lastMessage": "Check the Terraform plan for the new VPC peering setup",   "status": "active", "startedAt": "2026-03-20T09:50:00Z", "toolCalls": 8, "tokensUsed": 12400},
        {"id": "sess-004", "agentId": "agent-pm-alex",      "agentName": "PM Agent - Alex",     "employeeId": "emp-alex",  "employeeName": "Alex Rivera",   "channel": "slack",     "turns": 3,  "lastMessage": "Help me synthesize last week's user interview findings",   "status": "active", "startedAt": "2026-03-20T10:25:00Z", "toolCalls": 1, "tokensUsed": 2800},
        {"id": "sess-005", "agentId": "agent-helpdesk",     "agentName": "IT Help Desk Agent",  "employeeId": "emp-carol", "employeeName": "Carol Zhang",   "channel": "slack",     "turns": 4,  "lastMessage": "My VPN keeps disconnecting every 30 minutes",              "status": "active", "startedAt": "2026-03-20T10:20:00Z", "toolCalls": 0, "tokensUsed": 1900},
        {"id": "sess-006", "agentId": "agent-fa-carol",     "agentName": "Finance Agent - Carol","employeeId": "emp-carol","employeeName": "Carol Zhang",   "channel": "telegram",  "turns": 6,  "lastMessage": "Generate the Q2 budget variance report for Engineering",   "status": "active", "startedAt": "2026-03-20T10:10:00Z", "toolCalls": 3, "tokensUsed": 5600},
        {"id": "sess-007", "agentId": "agent-ae-mike",      "agentName": "Sales Agent - Mike",  "employeeId": "emp-mike",  "employeeName": "Mike Johnson",  "channel": "whatsapp",  "turns": 1,  "lastMessage": "Prepare a competitive analysis for the Acme Corp deal",   "status": "active", "startedAt": "2026-03-20T10:30:00Z", "toolCalls": 0, "tokensUsed": 850},
        {"id": "sess-008", "agentId": "agent-csm-emma",     "agentName": "CSM Agent - Emma",    "employeeId": "emp-emma",  "employeeName": "Emma Chen",     "channel": "slack",     "turns": 3,  "lastMessage": "Prepare QBR deck for TechCorp - pull health metrics",       "status": "active", "startedAt": "2026-03-20T10:22:00Z", "toolCalls": 2, "tokensUsed": 3200},
    ]
    for s in sessions:
        items.append({"PK": ORG, "SK": f"SESSION#{s['id']}", "GSI1PK": "TYPE#session", "GSI1SK": f"SESSION#{s['id']}", **s})

    # =====================================================================
    # 3. Employee activity (ACTIVITY#emp-id)
    # =====================================================================
    activities = {
        "emp-jiade":  {"lastActive": "2026-03-20T10:33:00Z", "messagesThisWeek": 47, "avgResponseSec": "3.2", "topTool": "deep-research",   "satisfaction": "4.8", "channelStatus": {"discord": "online", "slack": "online"}},
        "emp-marcus": {"lastActive": "2026-03-20T10:20:00Z", "messagesThisWeek": 42, "avgResponseSec": "3.5", "topTool": "arch-diagram",    "satisfaction": "4.6", "channelStatus": {"slack": "online", "telegram": "idle"}},
        "emp-daniel": {"lastActive": "2026-03-20T09:35:00Z", "messagesThisWeek": 28, "avgResponseSec": "3.8", "topTool": "cost-calculator",  "satisfaction": "4.5", "channelStatus": {"slack": "idle"}},
        "emp-ryan":   {"lastActive": "2026-03-20T10:30:00Z", "messagesThisWeek": 62, "avgResponseSec": "2.9", "topTool": "github-pr",        "satisfaction": "4.3", "channelStatus": {"slack": "online", "discord": "online"}},
        "emp-sophie": {"lastActive": "2026-03-20T10:05:00Z", "messagesThisWeek": 38, "avgResponseSec": "3.5", "topTool": "code-review",      "satisfaction": "4.4", "channelStatus": {"slack": "idle"}},
        "emp-chris":  {"lastActive": "2026-03-20T10:34:00Z", "messagesThisWeek": 72, "avgResponseSec": "2.4", "topTool": "shell",            "satisfaction": "4.9", "channelStatus": {"slack": "online", "telegram": "online"}},
        "emp-lisa":   {"lastActive": "2026-03-20T08:35:00Z", "messagesThisWeek": 19, "avgResponseSec": "4.5", "topTool": "deep-research",    "satisfaction": "4.1", "channelStatus": {"slack": "offline"}},
        "emp-tony":   {"lastActive": "2026-03-20T09:50:00Z", "messagesThisWeek": 24, "avgResponseSec": "3.9", "topTool": "jira-query",       "satisfaction": "4.2", "channelStatus": {"slack": "idle"}},
        "emp-mike":   {"lastActive": "2026-03-20T10:23:00Z", "messagesThisWeek": 35, "avgResponseSec": "3.3", "topTool": "crm-query",        "satisfaction": "4.0", "channelStatus": {"whatsapp": "online", "slack": "idle"}},
        "emp-sarah":  {"lastActive": "2026-03-20T07:35:00Z", "messagesThisWeek": 22, "avgResponseSec": "3.7", "topTool": "web-search",       "satisfaction": "4.1", "channelStatus": {"whatsapp": "offline"}},
        "emp-alex":   {"lastActive": "2026-03-20T10:15:00Z", "messagesThisWeek": 44, "avgResponseSec": "3.0", "topTool": "deep-research",    "satisfaction": "4.6", "channelStatus": {"slack": "online"}},
        "emp-priya":  {"lastActive": "2026-03-19T10:35:00Z", "messagesThisWeek": 12, "avgResponseSec": "4.8", "topTool": "jira-query",       "satisfaction": "4.0", "channelStatus": {"slack": "offline", "discord": "offline"}},
        "emp-carol":  {"lastActive": "2026-03-20T10:10:00Z", "messagesThisWeek": 33, "avgResponseSec": "3.4", "topTool": "excel-gen",        "satisfaction": "4.5", "channelStatus": {"slack": "online", "telegram": "online"}},
        "emp-david":  {"lastActive": "2026-03-20T06:35:00Z", "messagesThisWeek": 18, "avgResponseSec": "4.0", "topTool": "excel-gen",        "satisfaction": "4.3", "channelStatus": {"slack": "offline"}},
        "emp-jenny":  {"lastActive": "2026-03-20T10:25:00Z", "messagesThisWeek": 29, "avgResponseSec": "3.6", "topTool": "email-send",       "satisfaction": "4.4", "channelStatus": {"slack": "online"}},
        "emp-emma":   {"lastActive": "2026-03-20T10:28:00Z", "messagesThisWeek": 41, "avgResponseSec": "2.8", "topTool": "crm-query",        "satisfaction": "4.7", "channelStatus": {"slack": "online", "whatsapp": "online"}},
        "emp-rachel": {"lastActive": "2026-03-20T09:35:00Z", "messagesThisWeek": 15, "avgResponseSec": "4.3", "topTool": "deep-research",    "satisfaction": "4.2", "channelStatus": {"slack": "idle"}},
    }
    for emp_id, data in activities.items():
        item = {"PK": ORG, "SK": f"ACTIVITY#{emp_id}", "GSI1PK": "TYPE#activity", "GSI1SK": f"ACTIVITY#{emp_id}", "employeeId": emp_id, **data}
        # Convert channelStatus dict — DynamoDB handles nested maps natively
        items.append(item)

    # =====================================================================
    # 4. Daily cost trend (COST_TREND#date)
    # =====================================================================
    for day_offset in range(7):
        date = (now - timedelta(days=6 - day_offset)).strftime("%Y-%m-%d")
        base_cost = [1.85, 2.12, 1.78, 2.41, 2.15, 1.98, 2.67][day_offset]
        items.append({
            "PK": ORG, "SK": f"COST_TREND#{date}",
            "GSI1PK": "TYPE#cost_trend", "GSI1SK": f"COST_TREND#{date}",
            "date": date,
            "openclawCost": str(base_cost),
            "chatgptEquivalent": "5.00",
            "totalRequests": int(base_cost * 280),
            "totalInputTokens": int(base_cost * 180000),
            "totalOutputTokens": int(base_cost * 120000),
        })

    # Write all items
    print(f"Writing {len(items)} items to {table_name} in {region}...")
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)
    print(f"Done! Seeded: {len(agent_usage)*7} usage records, {len(sessions)} sessions, {len(activities)} activities, 7 cost trend days.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--table", default="openclaw-enterprise")
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    seed(args.table, args.region)
