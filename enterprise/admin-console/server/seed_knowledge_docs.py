"""
Seed actual Markdown knowledge documents to S3.
These are the real knowledge files that agents read via workspace/knowledge/ directory.
"""
import argparse
import os
import boto3

DOCS = {
    "_shared/knowledge/company-policies/": [
        ("data-handling-policy.md", """# Data Handling Policy

## Classification Levels
- **Public**: Marketing materials, blog posts, open-source code
- **Internal**: Internal wikis, meeting notes, project plans
- **Confidential**: Customer data, financial reports, HR records
- **Restricted**: Credentials, encryption keys, PII

## Rules
1. Never store Restricted data in plain text
2. Encrypt Confidential data at rest and in transit
3. PII must not appear in logs, chat histories, or AI agent memory files
4. Customer data must stay within the designated AWS region (us-east-2)
5. All data access must be logged and auditable

## AI Agent Specific
- Agents must not store customer PII in MEMORY.md
- Agents must redact sensitive data before responding
- File operations on Confidential/Restricted data require approval
"""),
        ("security-baseline.md", """# Security Baseline

## Authentication
- All systems require MFA
- API keys rotate every 90 days
- Service accounts use IAM roles, not long-lived credentials

## Network
- No public-facing security groups without WAF
- VPC endpoints for AWS services
- All traffic encrypted with TLS 1.2+

## Incident Response
1. Detect → 2. Contain → 3. Eradicate → 4. Recover → 5. Post-mortem
- Sev-1: 15 min response, all-hands
- Sev-2: 1 hour response, on-call team
- Sev-3: Next business day
"""),
        ("code-of-conduct.md", """# ACME Corp Code of Conduct

## Core Values
1. **Customer Obsession** — Every decision starts with customer impact
2. **Ownership** — Act on behalf of the company, not just your task
3. **Bias for Action** — Speed matters. A good plan today beats a perfect plan next week
4. **Earn Trust** — Be transparent, admit mistakes, deliver on commitments
5. **Dive Deep** — Understand the details, question assumptions

## Communication Standards
- Be direct and respectful
- Document decisions and rationale
- Default to written communication for important decisions
- Use async communication when possible
"""),
    ],
    "_shared/knowledge/onboarding/": [
        ("new-hire-checklist.md", """# New Hire Onboarding Checklist

## Day 1
- [ ] Get laptop and credentials from IT
- [ ] Complete security training
- [ ] Set up development environment
- [ ] Meet your manager and team
- [ ] Review ACME Corp Code of Conduct

## Week 1
- [ ] Complete all compliance training modules
- [ ] Set up your AI agent (OpenClaw Enterprise Portal)
- [ ] Review your position's SOUL template
- [ ] Customize your USER.md preferences
- [ ] Join relevant Slack/Teams channels

## Month 1
- [ ] Complete first project milestone
- [ ] Give feedback on onboarding experience
- [ ] Schedule 1:1 with skip-level manager
"""),
    ],
    "_shared/knowledge/arch-standards/": [
        ("microservice-guidelines.md", """# Microservice Design Guidelines

## Service Boundaries
- Each service owns its data store
- Services communicate via async events (SQS/SNS) when possible
- Synchronous calls only for real-time requirements
- Circuit breakers on all external calls

## API Standards
- REST for CRUD, gRPC for internal high-throughput
- API versioning: /v1/, /v2/ in URL path
- Rate limiting: 1000 req/min default, configurable per client
- All APIs must have OpenAPI spec

## Observability
- Structured JSON logging (no printf debugging)
- Distributed tracing with X-Ray
- Custom CloudWatch metrics for business KPIs
- Health check endpoint: GET /health
"""),
        ("aws-well-architected.md", """# AWS Well-Architected Checklist

## Operational Excellence
- [ ] Infrastructure as Code (CDK/Terraform)
- [ ] Automated deployments with rollback
- [ ] Runbooks for common operations

## Security
- [ ] Least privilege IAM policies
- [ ] Encryption at rest and in transit
- [ ] VPC with private subnets for data stores

## Reliability
- [ ] Multi-AZ deployment
- [ ] Auto-scaling configured
- [ ] Backup and disaster recovery tested

## Performance
- [ ] Right-sized instances
- [ ] Caching strategy (ElastiCache/CloudFront)
- [ ] Database query optimization

## Cost Optimization
- [ ] Reserved instances for steady-state
- [ ] Spot instances for batch workloads
- [ ] S3 lifecycle policies
- [ ] Cost allocation tags on all resources
"""),
    ],
    "_shared/knowledge/runbooks/": [
        ("deployment-runbook.md", """# Service Deployment Runbook

## Pre-deployment
1. All integration tests pass in staging
2. Canary deployment to 5% traffic
3. Monitor error rate for 15 minutes
4. If error rate < 0.1%, proceed to full deployment

## Deployment Steps
```bash
# 1. Tag release
git tag -a v1.x.x -m "Release v1.x.x"
git push origin v1.x.x

# 2. Deploy to staging
aws deploy create-deployment --application-name myapp --deployment-group staging

# 3. Verify staging
curl -s https://staging.acme.com/health | jq .status

# 4. Deploy to production (canary)
aws deploy create-deployment --application-name myapp --deployment-group prod-canary

# 5. Full production rollout
aws deploy create-deployment --application-name myapp --deployment-group prod-full
```

## Rollback
If error rate > 1% after deployment:
```bash
aws deploy stop-deployment --deployment-id <id>
aws deploy create-deployment --application-name myapp --deployment-group prod-full --revision previousRevision
```
"""),
    ],
    "_shared/knowledge/case-studies/": [
        ("enterprise-migration.md", """# Case Study: TechCorp Cloud Migration

## Client
TechCorp — 500-employee SaaS company, $50M ARR

## Challenge
- Legacy on-premise infrastructure (3 data centers)
- 200+ microservices, 50TB data
- Zero-downtime migration requirement

## Solution
- Phased migration over 6 months
- AWS Landing Zone with multi-account strategy
- Database Migration Service for PostgreSQL → Aurora
- Container migration: Docker → ECS Fargate

## Results
- 40% infrastructure cost reduction
- 99.99% uptime during migration
- 3x deployment frequency improvement
- $2M annual savings

## Key Learnings
1. Start with stateless services
2. Database migration is the hardest part — plan extra time
3. Network connectivity (Direct Connect) should be set up first
4. Training the team on AWS is as important as the technical migration
"""),
    ],
    "_shared/knowledge/financial-reports/": [
        ("budget-guidelines.md", """# Department Budget Guidelines FY2026

## Budget Allocation
| Department | Annual Budget | Monthly | Notes |
|-----------|--------------|---------|-------|
| Engineering | $600K | $50K | Includes cloud infrastructure |
| Sales | $360K | $30K | Includes travel and events |
| Product | $300K | $25K | Includes user research tools |
| Finance | $240K | $20K | Includes audit and compliance |
| HR | $180K | $15K | Includes recruiting platforms |
| Customer Success | $240K | $20K | Includes CS tools |
| Legal | $120K | $10K | Includes external counsel |

## Approval Thresholds
- < $1,000: Manager approval
- $1,000 - $10,000: VP approval
- > $10,000: CFO approval
- > $50,000: CEO + Board approval

## AI Agent Costs
- Bedrock API costs allocated to department budgets
- Default model (Nova 2 Lite): ~$0.30/1M input tokens
- Premium model override requires VP approval
"""),
    ],
    "_shared/knowledge/hr-policies/": [
        ("leave-policy.md", """# Leave Policy

## Annual Leave
- 15 days PTO per year (prorated for new hires)
- Maximum 5 consecutive days without VP approval
- Unused PTO carries over up to 5 days

## Sick Leave
- 10 days per year
- Doctor's note required for 3+ consecutive days

## Remote Work
- Hybrid: 3 days office, 2 days remote
- Full remote requires director approval
- International remote work requires HR + Legal approval

## Holidays
- 10 company holidays per year
- 2 floating holidays (employee choice)
"""),
    ],
    "_shared/knowledge/contract-templates/": [
        ("nda-template.md", """# Non-Disclosure Agreement Template

## Parties
- **Disclosing Party**: ACME Corp
- **Receiving Party**: [COUNTERPARTY NAME]

## Confidential Information
All non-public information disclosed by either party, including but not limited to:
- Technical specifications and source code
- Business plans and financial data
- Customer lists and pricing
- Product roadmaps and strategies

## Obligations
1. Receiving Party shall not disclose Confidential Information to third parties
2. Receiving Party shall use Confidential Information only for the agreed purpose
3. Receiving Party shall protect Confidential Information with reasonable care

## Term
- Duration: 2 years from effective date
- Survival: Obligations survive for 3 years after termination

## Exceptions
- Information that becomes publicly available (not through breach)
- Information independently developed by Receiving Party
- Information received from a third party without restriction
"""),
    ],
    "_shared/knowledge/customer-playbooks/": [
        ("qbr-template.md", """# Quarterly Business Review Template

## Agenda (60 minutes)
1. **Executive Summary** (5 min) — Key metrics and highlights
2. **Usage & Adoption** (10 min) — DAU/MAU, feature adoption, support tickets
3. **Value Delivered** (15 min) — ROI metrics, time saved, cost reduction
4. **Roadmap Preview** (10 min) — Upcoming features relevant to customer
5. **Customer Feedback** (10 min) — Open discussion, pain points
6. **Action Items** (10 min) — Next steps, owners, deadlines

## Preparation Checklist
- [ ] Pull usage metrics from analytics dashboard
- [ ] Calculate ROI based on customer's baseline
- [ ] Review support tickets from last quarter
- [ ] Prepare roadmap slides with customer-relevant features
- [ ] Check renewal date and expansion opportunities

## Health Score Indicators
- 🟢 Green: NPS > 8, usage growing, no critical tickets
- 🟡 Yellow: NPS 6-8, flat usage, some open tickets
- 🔴 Red: NPS < 6, declining usage, critical tickets open
"""),
    ],
    "_shared/knowledge/org-directory/": [
        ("company-directory.md", """# ACME Corp — Company Directory

This is the official employee directory. Use it to find who to contact for any topic,
draft introductions, or understand each person's role and AI agent capabilities.

---

## Engineering

### JiaDe Wang — Solutions Architect · Engineering (Admin)
- **Employee ID**: emp-jiade  · **Employee No**: EMP-001
- **Role**: Solutions Architect — enterprise AI solutions, AWS Bedrock, AgentCore deployments. Also IT Admin.
- **Agent capabilities**: architecture diagrams, cost calculations, deep research, jina-reader
- **IM channels**: Discord, Slack
- **Best for**: Enterprise AI architecture, Bedrock/AgentCore questions, OpenClaw Enterprise demos, IT support

### Marcus Bell — Solutions Architect · Engineering
- **Employee ID**: emp-marcus  · **Employee No**: EMP-002
- **Role**: Solutions Architect — pre-sales technical lead, architecture reviews, customer POCs
- **Agent capabilities**: architecture diagrams, cost calculations, deep research, jina-reader, web search
- **IM channels**: Slack, Telegram
- **Best for**: AWS architecture questions, customer technical proposals, solution design reviews

### Daniel Kim — Solutions Architect · Engineering
- **Employee ID**: emp-daniel  · **Employee No**: EMP-003
- **Role**: Solutions Architect — cloud migration projects, infrastructure cost optimization
- **Agent capabilities**: architecture diagrams, deep research, jina-reader
- **IM channels**: Slack
- **Best for**: Cloud migration plans, architecture tradeoffs, cost optimization recommendations

### Ryan Park — Software Engineer · Backend Team
- **Employee ID**: emp-ryan  · **Employee No**: EMP-004
- **Role**: Backend Software Engineer — API design, microservices, code review
- **Agent capabilities**: GitHub PR review, code analysis, deep research, shell commands
- **IM channels**: Slack, Discord
- **Best for**: Code reviews, backend architecture, debugging, technical implementation questions

### Sophie Turner — Software Engineer · Backend Team
- **Employee ID**: emp-sophie  · **Employee No**: EMP-005
- **Role**: Software Engineer — frontend and backend development, testing
- **Agent capabilities**: GitHub PR, code review, deep research
- **IM channels**: Slack
- **Best for**: Frontend/backend code questions, PR reviews

### Chris Morgan — DevOps Engineer · Platform Team (Admin)
- **Employee ID**: emp-chris  · **Employee No**: EMP-007
- **Role**: DevOps Engineer — infrastructure, CI/CD, cloud operations. Also IT Admin.
- **Agent capabilities**: Terraform, Docker, Kubernetes, GitHub Actions, shell
- **IM channels**: Slack, Telegram
- **Best for**: Infrastructure issues, CI/CD pipelines, cloud ops, VPN/credential resets

### Peter Wu — Executive · Engineering
- **Employee ID**: emp-peter  · **Employee No**: EMP-031
- **Role**: Executive (Engineering leadership) — strategic decisions, cross-team coordination
- **Agent capabilities**: web search, deep research, jina-reader, full tool access (no restrictions)
- **IM channels**: Discord, Portal
- **Best for**: Executive-level decisions, cross-department escalations, strategic planning

---

## Product

### Alex Rivera — Product Manager · Product (Manager)
- **Employee ID**: emp-alex  · **Employee No**: EMP-015
- **Role**: Product Manager — product roadmap, requirements, feature prioritization. Dept head.
- **Agent capabilities**: Jira queries, deep research, jina-reader
- **IM channels**: Slack
- **Best for**: Product requirements, roadmap questions, feature specs, sprint planning

### Priya Patel — Product Manager · Product
- **Employee ID**: emp-priya  · **Employee No**: EMP-014
- **Role**: Product Manager — user research synthesis, transcript analysis, roadmap items
- **Agent capabilities**: Jira queries, transcript analysis, deep research, jina-reader
- **IM channels**: Slack, Discord
- **Best for**: User research synthesis, feature specs, user story discussions

---

## Sales

### Mike Johnson — Account Executive · Enterprise Sales (Manager)
- **Employee ID**: emp-mike  · **Employee No**: EMP-011
- **Role**: Account Executive — Fortune 500 accounts, deal management, competitive analysis. Sales head.
- **Agent capabilities**: CRM queries, web search, jina-reader
- **IM channels**: WhatsApp, Slack
- **Best for**: CRM data, competitive analysis, deal strategy, enterprise proposals

### Sarah Kim — Account Executive · Enterprise Sales
- **Employee ID**: emp-sarah  · **Employee No**: EMP-012
- **Role**: Account Executive — SMB and mid-market accounts, product demos
- **Agent capabilities**: CRM queries, web search, jina-reader
- **IM channels**: WhatsApp
- **Best for**: SMB deal support, product positioning, customer objection handling

---

## Finance

### Carol Zhang — Finance Analyst · Finance
- **Employee ID**: emp-carol  · **Employee No**: EMP-016
- **Role**: Finance Analyst — budget tracking, financial reports, SAP ERP data
- **Agent capabilities**: SAP connector (read-only), Excel report generation, financial analysis
- **IM channels**: Slack, Telegram
- **Best for**: Budget reports, financial data queries, Excel financial models, expense analysis

### David Park — Finance Analyst · Finance
- **Employee ID**: emp-david  · **Employee No**: EMP-017
- **Role**: Finance Analyst — SAP ERP data, budget monitoring, Excel reports
- **Agent capabilities**: SAP connector (read-only), Excel report generation, budget tracking
- **IM channels**: Slack
- **Best for**: Budget variance analysis, cost center reports, financial forecasting

---

## HR & Admin

### Jenny Liu — HR Specialist · HR & Admin (Manager)
- **Employee ID**: emp-jenny  · **Employee No**: EMP-018
- **Role**: HR Specialist — onboarding, leave policies, employee experience. HR dept head.
- **Agent capabilities**: web search, email drafting, policy lookup
- **IM channels**: Slack
- **Best for**: HR policies, onboarding questions, leave requests, employee handbook

---

## Customer Success

### Emma Chen — Customer Success Manager · Customer Success
- **Employee ID**: emp-emma  · **Employee No**: EMP-019
- **Role**: CSM — enterprise account QBRs, health scoring, churn prevention
- **Agent capabilities**: CRM queries, web search, Slack bridge, jina-reader
- **IM channels**: Slack, WhatsApp
- **Best for**: Customer health reports, QBR preparation, account escalations

---

## Legal & Compliance

### Rachel Li — Legal Counsel · Legal & Compliance
- **Employee ID**: emp-rachel  · **Employee No**: EMP-021
- **Role**: Legal Counsel — GDPR compliance, vendor contracts, IP protection
- **Agent capabilities**: deep research, jina-reader, contract analysis
- **IM channels**: Slack
- **Best for**: Contract reviews, compliance questions, NDA drafts, regulatory guidance

---

## How to Reach Anyone

1. **Via AI agent**: Each employee has an AI agent that handles routine requests on their behalf.
   Ask their agent via any connected IM channel (Discord, Telegram, Slack, WhatsApp, Portal).

2. **For urgent matters**: Contact directly via their IM channel listed above.

3. **Cross-team requests**: Describe your need — the agent will identify the right person and draft
   an introduction message or request for you.

---

## Department Structure

| Department | Head | Key Contacts |
|------------|------|-------------|
| Engineering | Peter Wu | JiaDe Wang (SA+Admin), Marcus Bell (SA), Ryan Park (SDE), Chris Morgan (DevOps+Admin) |
| Product | Alex Rivera | Alex Rivera (PM), Priya Patel (PM) |
| Sales | Mike Johnson | Mike Johnson (AE), Sarah Kim (AE) |
| Finance | (CFO) | Carol Zhang, David Park |
| HR & Admin | Jenny Liu | Jenny Liu |
| Customer Success | (VP CS) | Emma Chen |
| Legal | (CLO) | Rachel Li |

---

*Last updated: 2026-04-03. Run `seed_knowledge_docs.py` to refresh after org changes.*
"""),
    ],
}


def seed(bucket: str, region: str):
    s3 = boto3.client("s3", region_name=region)
    total = 0

    for prefix, files in DOCS.items():
        for filename, content in files:
            key = f"{prefix}{filename}"
            s3.put_object(Bucket=bucket, Key=key, Body=content.encode(), ContentType="text/markdown")
            total += 1
            print(f"  {key} ({len(content)} bytes)")

    print(f"\nDone! {total} knowledge documents uploaded to S3.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bucket", default=os.environ.get("S3_BUCKET", ""))
    parser.add_argument("--region", default="us-east-2")
    args = parser.parse_args()
    if not args.bucket:
        print("ERROR: --bucket required or set S3_BUCKET env var")
        exit(1)
    seed(args.bucket, args.region)
