"""
S3 operations for workspace files, SOUL management, and memory.
Centralizes all S3 access with proper error handling and caching.
"""
import os
import json
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.environ.get("AWS_REGION", "us-east-2")
_s3 = None
_bucket = None


def _client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3", region_name=AWS_REGION)
    return _s3


def bucket():
    global _bucket
    if _bucket is None:
        # Prefer S3_BUCKET env var (set by /etc/openclaw/env and start.sh)
        _bucket = os.environ.get("S3_BUCKET", "")
        if not _bucket:
            try:
                account = boto3.client("sts", region_name=AWS_REGION).get_caller_identity()["Account"]
                _bucket = f"openclaw-tenants-{account}"
            except Exception:
                _bucket = "openclaw-tenants-000000000000"
    return _bucket


def read_file(key: str) -> Optional[str]:
    """Read a text file from S3."""
    try:
        obj = _client().get_object(Bucket=bucket(), Key=key)
        return obj["Body"].read().decode("utf-8")
    except ClientError:
        return None


def write_file(key: str, content: str, metadata: Optional[dict] = None) -> bool:
    """Write a text file to S3. S3 versioning handles history automatically."""
    try:
        extra = {}
        if metadata:
            extra["Metadata"] = {k: str(v) for k, v in metadata.items()}
        _client().put_object(
            Bucket=bucket(), Key=key,
            Body=content.encode("utf-8"),
            ContentType="text/markdown",
            **extra,
        )
        return True
    except ClientError as e:
        print(f"[s3ops] write error: {e}")
        return False


def list_files(prefix: str) -> list[dict]:
    """List files under a prefix."""
    files = []
    try:
        paginator = _client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket(), Prefix=prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                name = key[len(prefix):]  # relative name
                if name and not name.endswith("/"):
                    files.append({
                        "key": key,
                        "name": name,
                        "size": obj["Size"],
                        "lastModified": obj["LastModified"].isoformat(),
                    })
    except ClientError:
        pass
    return files


def list_versions(key: str) -> list[dict]:
    """List all versions of a file (requires S3 versioning enabled)."""
    versions = []
    try:
        resp = _client().list_object_versions(Bucket=bucket(), Prefix=key)
        for v in resp.get("Versions", []):
            if v["Key"] == key:
                versions.append({
                    "versionId": v["VersionId"],
                    "lastModified": v["LastModified"].isoformat(),
                    "size": v["Size"],
                    "isLatest": v["IsLatest"],
                })
    except ClientError:
        pass
    return versions


def read_version(key: str, version_id: str) -> Optional[str]:
    """Read a specific version of a file."""
    try:
        obj = _client().get_object(Bucket=bucket(), Key=key, VersionId=version_id)
        return obj["Body"].read().decode("utf-8")
    except ClientError:
        return None


# === SOUL-specific operations ===

def get_soul_layers(pos_id: str, employee_id: Optional[str] = None) -> dict:
    """Get all three SOUL layers for an agent."""
    global_soul = read_file("_shared/soul/global/SOUL.md") or ""
    global_agents = read_file("_shared/soul/global/AGENTS.md") or ""
    global_tools = read_file("_shared/soul/global/TOOLS.md") or ""
    position_soul = read_file(f"_shared/soul/positions/{pos_id}/SOUL.md") or ""
    position_agents = read_file(f"_shared/soul/positions/{pos_id}/AGENTS.md") or ""

    personal_soul = ""
    personal_user = ""
    if employee_id:
        personal_soul = read_file(f"{employee_id}/workspace/SOUL.md") or ""
        personal_user = read_file(f"{employee_id}/workspace/USER.md") or ""

    return {
        "global": {"SOUL.md": global_soul, "AGENTS.md": global_agents, "TOOLS.md": global_tools},
        "position": {"SOUL.md": position_soul, "AGENTS.md": position_agents},
        "personal": {"SOUL.md": personal_soul, "USER.md": personal_user},
    }


def save_soul_layer(layer: str, pos_id: str, employee_id: Optional[str], filename: str, content: str) -> dict:
    """Save a SOUL layer file to S3."""
    if layer == "global":
        key = f"_shared/soul/global/{filename}"
    elif layer == "position":
        key = f"_shared/soul/positions/{pos_id}/{filename}"
    elif layer == "personal" and employee_id:
        key = f"{employee_id}/workspace/{filename}"
    else:
        return {"error": "Invalid layer or missing employee_id"}

    now = datetime.now(timezone.utc).isoformat()
    success = write_file(key, content, metadata={"updatedAt": now, "layer": layer})
    return {"key": key, "saved": success, "updatedAt": now}


# === Memory operations ===

def get_agent_memory(employee_id: str) -> dict:
    """Get memory files for an agent's workspace."""
    memory_md = read_file(f"{employee_id}/workspace/MEMORY.md")
    daily_files = list_files(f"{employee_id}/workspace/memory/")
    return {
        "memoryMd": memory_md or "",
        "memoryMdSize": len(memory_md) if memory_md else 0,
        "dailyFiles": daily_files,
        "totalDailyFiles": len(daily_files),
        "totalSize": sum(f["size"] for f in daily_files) + (len(memory_md) if memory_md else 0),
    }


def get_daily_memory(employee_id: str, date: str) -> Optional[str]:
    """Read a specific daily memory file."""
    return read_file(f"{employee_id}/workspace/memory/{date}.md")


# === Workspace listing ===

def get_workspace_tree(pos_id: str, employee_id: Optional[str] = None) -> dict:
    """Get the full workspace file tree for an agent, with role-filtered skills."""
    global_files = list_files("_shared/soul/global/")
    position_files = list_files(f"_shared/soul/positions/{pos_id}/") if pos_id else []
    personal_files = list_files(f"{employee_id}/workspace/") if employee_id else []

    # List all skills and filter by role
    all_skill_files = list_files("_shared/skills/")
    position_skills = list_files(f"_shared/soul/positions/{pos_id}/skills/") if pos_id else []

    # Determine agent's role from position
    pos_to_role = {
        "pos-sa": "engineering", "pos-sde": "engineering", "pos-devops": "devops",
        "pos-qa": "qa", "pos-ae": "sales", "pos-pm": "product",
        "pos-fa": "finance", "pos-hr": "hr", "pos-csm": "csm",
        "pos-legal": "legal",
    }
    agent_role = pos_to_role.get(pos_id, "employee")

    # Read each skill's manifest and filter
    global_skills = []  # allowedRoles: ["*"]
    role_skills = []    # matches agent's role
    skill_names_seen = set()

    for f in all_skill_files:
        # Only look at skill.json files
        if not f["name"].endswith("skill.json"):
            continue
        skill_name = f["name"].split("/")[0]
        if skill_name in skill_names_seen:
            continue
        skill_names_seen.add(skill_name)

        # Read manifest to check permissions
        manifest_content = read_file(f["key"])
        if not manifest_content:
            continue
        try:
            import json as _json
            manifest = _json.loads(manifest_content)
        except Exception:
            continue

        allowed = manifest.get("permissions", {}).get("allowedRoles", ["*"])
        blocked = manifest.get("permissions", {}).get("blockedRoles", [])

        if agent_role in blocked:
            continue

        if "*" in allowed:
            global_skills.append(f)
        elif agent_role in allowed or "management" in allowed:
            role_skills.append(f)

    return {
        "global": {
            "soul": global_files,
            "skills": global_skills,
        },
        "position": {
            "soul": position_files,
            "skills": role_skills + position_skills,
        },
        "personal": {
            "files": personal_files,
        },
        "summary": {
            "globalCount": len(global_files) + len(global_skills),
            "positionCount": len(position_files) + len(role_skills) + len(position_skills),
            "personalCount": len(personal_files),
        },
    }
