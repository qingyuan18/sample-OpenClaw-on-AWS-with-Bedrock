"""
One-time migration: copy user-mapping and routing config from SSM to DynamoDB.

Run once after deploying the updated db.py/main.py:
    cd enterprise/admin-console/server
    python3 migrate_ssm_to_ddb.py --stack openclaw-multitenancy --region us-east-1

This script is READ-ONLY on SSM and WRITE-ONLY on DynamoDB.
Safe to run multiple times (idempotent — overwrites same keys).
"""

import argparse
import sys
import boto3
import db


def migrate_user_mappings(ssm, stack: str) -> int:
    """Copy SSM user-mapping/* to DynamoDB MAPPING# items."""
    prefix = f"/openclaw/{stack}/user-mapping/"
    params = {"Path": prefix, "Recursive": True, "MaxResults": 10}
    migrated = 0
    while True:
        resp = ssm.get_parameters_by_path(**params)
        for p in resp.get("Parameters", []):
            name = p["Name"].replace(prefix, "")
            parts = name.split("__", 1)
            if len(parts) != 2:
                print(f"  skip (no __): {name}")
                continue
            channel, uid = parts
            emp_id = p["Value"]
            db.create_user_mapping(channel, uid, emp_id)
            print(f"  MAPPING#{channel}__{uid} → {emp_id}")
            migrated += 1
        token = resp.get("NextToken")
        if not token:
            break
        params["NextToken"] = token
    return migrated


def migrate_routing_config(ssm, stack: str) -> dict:
    """Copy SSM position/employee runtime mappings to DynamoDB CONFIG#routing."""
    position_runtime = {}
    employee_override = {}

    # positions/{pos_id}/runtime-id
    pos_prefix = f"/openclaw/{stack}/positions/"
    try:
        resp = ssm.get_parameters_by_path(Path=pos_prefix, Recursive=True)
        for p in resp.get("Parameters", []):
            # /openclaw/stack/positions/pos-exec/runtime-id
            key = p["Name"].replace(pos_prefix, "")  # "pos-exec/runtime-id"
            if key.endswith("/runtime-id"):
                pos_id = key.replace("/runtime-id", "")
                position_runtime[pos_id] = p["Value"]
                print(f"  position {pos_id} → {p['Value']}")
    except Exception as e:
        print(f"  warning: could not read position runtime params: {e}")

    # positions/{pos_id}/runtime-id — paginate for completeness
    try:
        params2 = {"Path": pos_prefix, "Recursive": True}
        while True:
            resp2 = ssm.get_parameters_by_path(**params2)
            for p in resp2.get("Parameters", []):
                key = p["Name"].replace(pos_prefix, "")
                if key.endswith("/runtime-id"):
                    pos_id = key.replace("/runtime-id", "")
                    if pos_id not in position_runtime:  # avoid duplicates
                        position_runtime[pos_id] = p["Value"]
                        print(f"  position (page2+) {pos_id} → {p['Value']}")
            token2 = resp2.get("NextToken")
            if not token2:
                break
            params2["NextToken"] = token2
    except Exception as e:
        print(f"  warning: position pagination: {e}")

    # tenants/{emp_id}/runtime-id — paginate (many tenant params, runtime-id on page 2+)
    tenant_prefix = f"/openclaw/{stack}/tenants/"
    try:
        params3 = {"Path": tenant_prefix, "Recursive": True}
        while True:
            resp3 = ssm.get_parameters_by_path(**params3)
            for p in resp3.get("Parameters", []):
                key = p["Name"].replace(tenant_prefix, "")  # "emp-wjd/runtime-id"
                if key.endswith("/runtime-id") and key.startswith("emp-"):
                    emp_id = key.replace("/runtime-id", "")
                    employee_override[emp_id] = p["Value"]
                    print(f"  employee override {emp_id} → {p['Value']}")
            token3 = resp3.get("NextToken")
            if not token3:
                break
            params3["NextToken"] = token3
    except Exception as e:
        print(f"  warning: could not read employee runtime params: {e}")

    db.set_routing_config(position_runtime, employee_override)
    return {"position_runtime": position_runtime, "employee_override": employee_override}


def main():
    parser = argparse.ArgumentParser(description="Migrate SSM user-mapping and routing config to DynamoDB")
    parser.add_argument("--stack", default="openclaw-multitenancy")
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be migrated, don't write")
    args = parser.parse_args()

    print(f"Migration: SSM → DynamoDB  stack={args.stack}  region={args.region}")
    if args.dry_run:
        print("DRY RUN — no writes to DynamoDB")

    ssm = boto3.client("ssm", region_name=args.region)

    print("\n--- User Mappings ---")
    if args.dry_run:
        prefix = f"/openclaw/{args.stack}/user-mapping/"
        resp = ssm.get_parameters_by_path(Path=prefix, Recursive=True)
        for p in resp.get("Parameters", []):
            name = p["Name"].replace(prefix, "")
            print(f"  would migrate: {name} → {p['Value']}")
    else:
        n = migrate_user_mappings(ssm, args.stack)
        print(f"  migrated {n} user mappings")

    print("\n--- Routing Config ---")
    if args.dry_run:
        for prefix in [f"/openclaw/{args.stack}/positions/", f"/openclaw/{args.stack}/tenants/"]:
            resp = ssm.get_parameters_by_path(Path=prefix, Recursive=True)
            for p in resp.get("Parameters", []):
                if "runtime-id" in p["Name"]:
                    print(f"  would migrate: {p['Name'].split('/')[-2]} → {p['Value']}")
    else:
        cfg = migrate_routing_config(ssm, args.stack)
        print(f"  migrated {len(cfg['position_runtime'])} position rules + {len(cfg['employee_override'])} employee overrides")

    print("\nVerify DynamoDB contents:")
    if not args.dry_run:
        mappings = db.get_user_mappings()
        routing = db.get_routing_config()
        print(f"  MAPPING# items in DDB: {len(mappings)}")
        print(f"  CONFIG#routing position_runtime: {len(routing['position_runtime'])} entries")
        print(f"  CONFIG#routing employee_override: {len(routing['employee_override'])} entries")

    print("\nDone.")


if __name__ == "__main__":
    main()
