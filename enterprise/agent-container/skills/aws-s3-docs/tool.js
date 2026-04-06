#!/usr/bin/env node
/**
 * aws-s3-docs — Save, retrieve, list, and share documents via S3.
 *
 * Actions:
 *   save:    { "action":"save",    "filename":"report.md", "content":"...", "folder":"docs" }
 *   list:    { "action":"list",    "folder":"docs" }
 *   get:     { "action":"get",     "key":"docs/report.md" }
 *   share:   { "action":"share",   "key":"docs/report.md", "expiresIn": 3600 }
 *   delete:  { "action":"delete",  "key":"docs/report.md" }
 *
 * Uses: S3_DOCS_BUCKET env (falls back to tenant workspace bucket via SSM)
 * Output: depends on action
 */

'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = {}; }

const action = args.action || 'list';
const region = process.env.AWS_REGION || 'us-east-1';

// Resolve bucket: prefer explicit env, then derive from stack
function getBucket() {
  if (process.env.S3_DOCS_BUCKET) return process.env.S3_DOCS_BUCKET;
  if (process.env.S3_BUCKET)      return process.env.S3_BUCKET;
  try {
    const accountId = execSync('aws sts get-caller-identity --query Account --output text', { encoding: 'utf8' }).trim();
    return `openclaw-tenants-${accountId}`;
  } catch {
    throw new Error('Cannot determine S3 bucket. Set S3_DOCS_BUCKET or S3_BUCKET env var.');
  }
}

let bucket;
try { bucket = getBucket(); } catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}

// Tenant prefix (isolate documents per employee)
const tenantId = process.env.TENANT_ID || 'shared';
const docsRoot = `${tenantId}/docs`;

try {
  switch (action) {

    case 'save': {
      const filename = args.filename;
      const content  = args.content;
      if (!filename || content === undefined) {
        console.log(JSON.stringify({ error: '`filename` and `content` are required for save' }));
        process.exit(1);
      }
      const folder = args.folder ? `${docsRoot}/${args.folder}` : docsRoot;
      const key    = `${folder}/${filename}`;
      const tmp    = path.join(os.tmpdir(), `s3docs-${Date.now()}-${path.basename(filename)}`);
      fs.writeFileSync(tmp, content, 'utf8');
      execSync(`aws s3 cp "${tmp}" "s3://${bucket}/${key}" --region "${region}"`, { stdio: 'pipe' });
      fs.unlinkSync(tmp);
      console.log(JSON.stringify({ action: 'saved', key, bucket, sizeBytes: Buffer.byteLength(content, 'utf8') }, null, 2));
      break;
    }

    case 'list': {
      const folder = args.folder ? `${docsRoot}/${args.folder}` : docsRoot;
      const out    = execSync(
        `aws s3 ls "s3://${bucket}/${folder}/" --region "${region}" --recursive`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const files = out.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        return { date: parts[0], time: parts[1], sizeBytes: parseInt(parts[2], 10), key: parts[3] };
      });
      console.log(JSON.stringify({ action: 'list', folder, count: files.length, files }, null, 2));
      break;
    }

    case 'get': {
      const key = args.key;
      if (!key) { console.log(JSON.stringify({ error: '`key` is required for get' })); process.exit(1); }
      const tmp = path.join(os.tmpdir(), `s3docs-get-${Date.now()}`);
      execSync(`aws s3 cp "s3://${bucket}/${key}" "${tmp}" --region "${region}"`, { stdio: 'pipe' });
      const content = fs.readFileSync(tmp, 'utf8');
      fs.unlinkSync(tmp);
      console.log(JSON.stringify({ action: 'get', key, content, sizeBytes: Buffer.byteLength(content, 'utf8') }, null, 2));
      break;
    }

    case 'share': {
      const key       = args.key;
      const expiresIn = args.expiresIn || 3600;
      if (!key) { console.log(JSON.stringify({ error: '`key` is required for share' })); process.exit(1); }
      const url = execSync(
        `aws s3 presign "s3://${bucket}/${key}" --expires-in ${expiresIn} --region "${region}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      console.log(JSON.stringify({ action: 'share', key, url, expiresIn, expiresAt }, null, 2));
      break;
    }

    case 'delete': {
      const key = args.key;
      if (!key) { console.log(JSON.stringify({ error: '`key` is required for delete' })); process.exit(1); }
      execSync(`aws s3 rm "s3://${bucket}/${key}" --region "${region}"`, { stdio: 'pipe' });
      console.log(JSON.stringify({ action: 'deleted', key }, null, 2));
      break;
    }

    default:
      console.log(JSON.stringify({ error: `Unknown action: ${action}`, validActions: ['save', 'list', 'get', 'share', 'delete'] }));
      process.exit(1);
  }
} catch (e) {
  const msg = (e.stderr || e.message || '').toString().trim();
  console.log(JSON.stringify({ error: msg }));
  process.exit(1);
}
