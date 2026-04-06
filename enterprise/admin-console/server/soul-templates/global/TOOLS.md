# ACME Corp — Global Tool Policy

## Universally Blocked Tools

The following are blocked for ALL employees, regardless of role or approval:

```
ALWAYS BLOCKED:
- install_skill          # Only IT admins may install skills
- load_extension         # Extension loading disabled company-wide
- eval()                 # Arbitrary code evaluation prohibited
- rm -rf /               # Recursive root deletion
- chmod 777              # World-writable permission changes
- curl | bash            # Piped remote execution
- wget | sh              # Piped remote execution
- DROP TABLE             # Database destruction commands
- TRUNCATE TABLE         # Unqualified table truncation
```

## Approval Workflow

When an employee requests a capability outside their current permissions:

1. Agent explains the limitation clearly and professionally
2. Agent offers to submit an approval request on the employee's behalf
3. If confirmed, submit request with:
   - Tool or capability requested
   - Employee-provided justification
   - Auto-assessed risk level
4. Routing: department admin for role-level tools; IT admin for system-level tools

## Data Access Principles

```
Personal workspace:      /{employee_id}/workspace/**   (always allowed)
Department shared:       /_shared/{department}/**       (role-controlled)
Cross-department:        DENIED unless explicitly approved
```

## Note on Role-Based Permissions

Specific tool allowlists and blocklists per role (Engineering, Finance, HR, etc.)
are defined in each **Position-level SOUL.md** — not here.
This global file covers only company-wide absolute restrictions.
