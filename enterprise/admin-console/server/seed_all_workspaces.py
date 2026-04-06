"""
Seed workspace files for ALL employees that have SSM position mappings.
Creates IDENTITY.md, USER.md, MEMORY.md, and a daily memory file for each.
Skips employees that already have workspace files in S3.
"""
import argparse
import os
import boto3
from datetime import datetime, timezone

EMPLOYEES = {
    "emp-jiade":  {"name": "JiaDe Wang",    "pos": "pos-sa",     "posName": "Solutions Architect",       "dept": "Engineering"},
    "emp-marcus": {"name": "Marcus Bell",   "pos": "pos-sa",     "posName": "Solutions Architect",       "dept": "Engineering"},
    "emp-daniel": {"name": "Daniel Kim",    "pos": "pos-sa",     "posName": "Solutions Architect",       "dept": "Engineering"},
    "emp-ryan":   {"name": "Ryan Park",     "pos": "pos-sde",    "posName": "Software Engineer",         "dept": "Backend Team"},
    "emp-sophie": {"name": "Sophie Turner", "pos": "pos-sde",    "posName": "Software Engineer",         "dept": "Backend Team"},
    "emp-nathan": {"name": "Nathan Brooks", "pos": "pos-sde",    "posName": "Software Engineer",         "dept": "Frontend Team"},
    "emp-chris":  {"name": "Chris Morgan",  "pos": "pos-devops", "posName": "DevOps Engineer",           "dept": "Platform Team"},
    "emp-lisa":   {"name": "Lisa Chen",     "pos": "pos-devops", "posName": "DevOps Engineer",           "dept": "Platform Team"},
    "emp-tony":   {"name": "Tony Reed",     "pos": "pos-qa",     "posName": "QA Engineer",               "dept": "QA Team"},
    "emp-mike":   {"name": "Mike Johnson",  "pos": "pos-ae",     "posName": "Account Executive",         "dept": "Enterprise Sales"},
    "emp-sarah":  {"name": "Sarah Kim",     "pos": "pos-ae",     "posName": "Account Executive",         "dept": "Enterprise Sales"},
    "emp-tom":    {"name": "Tom Wilson",    "pos": "pos-ae",     "posName": "Account Executive",         "dept": "SMB Sales"},
    "emp-alex":   {"name": "Alex Rivera",   "pos": "pos-pm",     "posName": "Product Manager",           "dept": "Product"},
    "emp-priya":  {"name": "Priya Patel",   "pos": "pos-pm",     "posName": "Product Manager",           "dept": "Product"},
    "emp-carol":  {"name": "Carol Zhang",   "pos": "pos-fa",     "posName": "Finance Analyst",           "dept": "Finance"},
    "emp-david":  {"name": "David Park",    "pos": "pos-fa",     "posName": "Finance Analyst",           "dept": "Finance"},
    "emp-jenny":  {"name": "Jenny Liu",     "pos": "pos-hr",     "posName": "HR Specialist",             "dept": "HR & Admin"},
    "emp-emma":   {"name": "Emma Chen",     "pos": "pos-csm",    "posName": "Customer Success Manager",  "dept": "Customer Success"},
    "emp-rachel": {"name": "Rachel Li",     "pos": "pos-legal",  "posName": "Legal Counsel",             "dept": "Legal & Compliance"},
    "emp-peter":  {"name": "Peter Wu",      "pos": "pos-exec",   "posName": "Executive",                 "dept": "Engineering"},
}

USER_TEMPLATES = {
    "pos-sa":    "# User Preferences\n\n- Communication: technical but accessible\n- Focus: AWS architecture, cost optimization, security\n- Code examples: Python, TypeScript, CDK\n- Always consider Well-Architected Framework pillars",
    "pos-sde":   "# User Preferences\n\n- Communication: concise, code-first\n- Focus: clean code, testing, performance\n- Languages: Python, TypeScript, Go\n- Always include unit test examples",
    "pos-devops": "# User Preferences\n\n- Communication: direct, operational\n- Focus: infrastructure as code, CI/CD, monitoring\n- Tools: Terraform, Docker, Kubernetes, GitHub Actions\n- Always consider security and cost",
    "pos-qa":    "# User Preferences\n\n- Communication: detail-oriented, systematic\n- Focus: test coverage, automation, quality metrics\n- Tools: pytest, Selenium, JMeter, Jira\n- Always include edge cases",
    "pos-ae":    "# User Preferences\n\n- Communication: professional, customer-facing\n- Focus: deal pipeline, competitive analysis, ROI\n- Tools: CRM, presentation, email\n- Always consider customer impact",
    "pos-pm":    "# User Preferences\n\n- Communication: structured, data-driven\n- Focus: user research, roadmap, metrics\n- Tools: Jira, Figma, analytics\n- Always tie back to user value",
    "pos-fa":    "# User Preferences\n\n- Communication: precise, numbers-focused\n- Focus: budget analysis, forecasting, compliance\n- Format: tables and charts preferred\n- Always include variance explanations",
    "pos-hr":    "# User Preferences\n\n- Communication: empathetic, policy-aware\n- Focus: employee experience, compliance, onboarding\n- Tools: HRIS, scheduling, communication\n- Always consider confidentiality",
    "pos-csm":   "# User Preferences\n\n- Communication: proactive, relationship-focused\n- Focus: customer health, QBR prep, churn prevention\n- Tools: CRM, analytics, presentation\n- Always track NPS and engagement",
    "pos-legal":  "# User Preferences\n\n- Communication: precise, risk-aware\n- Focus: contract review, compliance, IP protection\n- Tools: document review, regulatory databases\n- Always flag potential risks",
}


def seed(bucket: str, region: str):
    s3 = boto3.client("s3", region_name=region)
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    created = 0
    skipped = 0

    for emp_id, info in EMPLOYEES.items():
        # Check if workspace already exists
        prefix = f"{emp_id}/workspace/"
        try:
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1)
            if resp.get("KeyCount", 0) > 0:
                existing = resp["Contents"][0]["Key"]
                # Check if it has IDENTITY.md (full workspace) or just SOUL.md (partial)
                resp2 = s3.list_objects_v2(Bucket=bucket, Prefix=f"{prefix}IDENTITY.md", MaxKeys=1)
                if resp2.get("KeyCount", 0) > 0:
                    print(f"  {emp_id}: already has full workspace, skipping")
                    skipped += 1
                    continue
                else:
                    print(f"  {emp_id}: partial workspace (no IDENTITY.md), creating missing files")
        except Exception:
            pass

        pos = info["pos"]
        name = info["name"]

        # IDENTITY.md
        identity = f"# Agent Identity\n\n- **Name**: {name}'s AI Assistant\n- **Position**: {info['posName']}\n- **Department**: {info['dept']}\n- **Company**: ACME Corp\n- **Platform**: OpenClaw Enterprise\n"
        s3.put_object(Bucket=bucket, Key=f"{prefix}IDENTITY.md", Body=identity.encode(), ContentType="text/markdown")

        # USER.md
        user_md = USER_TEMPLATES.get(pos, "# User Preferences\n\n- Default preferences")
        s3.put_object(Bucket=bucket, Key=f"{prefix}USER.md", Body=user_md.encode(), ContentType="text/markdown")

        # MEMORY.md
        memory = f"# Long-term Memory\n\n- Agent activated on {today}\n- Position: {info['posName']} at ACME Corp\n- Department: {info['dept']}\n"
        s3.put_object(Bucket=bucket, Key=f"{prefix}MEMORY.md", Body=memory.encode(), ContentType="text/markdown")

        # Daily memory
        daily = f"# {today}\n\n- Workspace initialized for {name}\n- Position: {info['posName']}\n"
        s3.put_object(Bucket=bucket, Key=f"{prefix}memory/{today}.md", Body=daily.encode(), ContentType="text/markdown")

        created += 1
        print(f"  {emp_id}: workspace created ({info['posName']})")

    print(f"\nDone! Created: {created}, Skipped: {skipped}, Total: {len(EMPLOYEES)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", default=os.environ.get("S3_BUCKET", ""))
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    if not args.bucket:
        print("ERROR: --bucket required or set S3_BUCKET env var")
        exit(1)
    seed(args.bucket, args.region)
