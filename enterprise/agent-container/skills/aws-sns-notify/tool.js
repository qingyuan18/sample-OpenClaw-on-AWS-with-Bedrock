#!/usr/bin/env node
/**
 * aws-sns-notify — Publish a notification via Amazon SNS.
 *
 * Input (JSON string as argv[2]):
 *   { "message": "...", "subject": "optional", "attributes": {} }
 *
 * Requires env: SNS_TOPIC_ARN
 *
 * Output: { messageId, topicArn, subject, status }
 */

'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const topicArn = process.env.SNS_TOPIC_ARN;
if (!topicArn) {
  console.log(JSON.stringify({ error: 'SNS_TOPIC_ARN environment variable not set. Ask IT admin to configure it in the Skill Platform.' }));
  process.exit(1);
}

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = { message: process.argv[2] }; }

const message = args.message;
if (!message) {
  console.log(JSON.stringify({ error: '`message` is required', usage: '{"message":"Deployment complete","subject":"Deploy Alert"}' }));
  process.exit(1);
}

const subject    = args.subject    || '';
const attributes = args.attributes || {};
const region     = process.env.AWS_REGION || 'us-east-1';

// Build CLI args
let cmd = `aws sns publish --topic-arn "${topicArn}" --region "${region}"`;

// Write message to temp file to avoid shell escaping issues
const tmpMsg = path.join(os.tmpdir(), `sns-msg-${Date.now()}.txt`);
fs.writeFileSync(tmpMsg, message);
cmd += ` --message "file://${tmpMsg}"`;

if (subject) {
  const tmpSubj = path.join(os.tmpdir(), `sns-subj-${Date.now()}.txt`);
  fs.writeFileSync(tmpSubj, subject);
  cmd += ` --subject "file://${tmpSubj}"`;
}

if (Object.keys(attributes).length > 0) {
  const tmpAttr = path.join(os.tmpdir(), `sns-attr-${Date.now()}.json`);
  // SNS MessageAttributes format: { "key": { "DataType": "String", "StringValue": "val" } }
  const formatted = {};
  for (const [k, v] of Object.entries(attributes)) {
    formatted[k] = { DataType: 'String', StringValue: String(v) };
  }
  fs.writeFileSync(tmpAttr, JSON.stringify(formatted));
  cmd += ` --message-attributes "file://${tmpAttr}"`;
}

try {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const result = JSON.parse(out);
  console.log(JSON.stringify({
    messageId: result.MessageId,
    topicArn,
    subject:   subject || null,
    status:    'published',
  }, null, 2));
} catch (e) {
  const msg = e.stderr || e.message;
  console.log(JSON.stringify({ error: msg.trim() }));
  process.exit(1);
} finally {
  // Clean up temp files
  try { fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('sns-')).forEach(f => fs.unlinkSync(path.join(os.tmpdir(), f))); } catch {}
}
