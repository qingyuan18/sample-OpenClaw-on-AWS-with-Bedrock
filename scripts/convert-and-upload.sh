#!/bin/bash
# convert-and-upload.sh — Convert standard Claude Skill to OpenClaw Enterprise format and upload to S3
#
# Usage:
#   ./convert-and-upload.sh <skill-dir> [allowedRoles]
#
# Examples:
#   ./convert-and-upload.sh ./my-skill "engineering,sales"
#   ./convert-and-upload.sh ./another-skill "*"   # All roles
#
# Env overrides:
#   BUCKET   — S3 bucket name (default: openclaw-tenants-687912291502)
#   REGION   — AWS region   (default: us-east-1)

set -euo pipefail

SKILL_DIR="${1:?Usage: $0 <skill-dir> [allowedRoles]}"
ROLES="${2:-*}"
BUCKET="${BUCKET:-openclaw-tenants-687912291502}"
REGION="${REGION:-us-east-1}"
SKILL_NAME=$(basename "$SKILL_DIR")

if [ ! -d "$SKILL_DIR" ]; then
  echo "Error: skill directory not found: $SKILL_DIR" >&2
  exit 1
fi

# Generate skill.json if missing
if [ ! -f "$SKILL_DIR/skill.json" ]; then
  DESC=""
  if [ -f "$SKILL_DIR/SKILL.md" ]; then
    DESC=$(grep "^description:" "$SKILL_DIR/SKILL.md" | head -1 | sed 's/description: *//')
  fi
  DESC="${DESC:-A converted Claude skill}"

  ROLES_JSON=$(echo "$ROLES" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split(',')))")

  cat > "$SKILL_DIR/skill.json" << EOF
{
  "name": "${SKILL_NAME}",
  "version": "1.0.0",
  "description": "${DESC}",
  "author": "Converted",
  "layer": 2,
  "category": "productivity",
  "scope": "department",
  "requires": {"env": [], "tools": []},
  "permissions": {"allowedRoles": ${ROLES_JSON}, "blockedRoles": []}
}
EOF
  echo "Generated skill.json for ${SKILL_NAME}"
fi

# Upload to S3
aws s3 sync "$SKILL_DIR/" "s3://${BUCKET}/_shared/skills/${SKILL_NAME}/" --region "$REGION"
echo "Uploaded ${SKILL_NAME} to s3://${BUCKET}/_shared/skills/${SKILL_NAME}/"
