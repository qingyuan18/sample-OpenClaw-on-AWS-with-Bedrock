#!/usr/bin/env node
/**
 * aws-ses-mailer — Send email via Amazon SES.
 *
 * Input (JSON string as argv[2]):
 *   { "to": "alice@example.com",           // or array
 *     "subject": "Hello",
 *     "body": "Email body text or HTML",
 *     "bodyType": "text|html",             // default: text
 *     "cc": [],                            // optional
 *     "bcc": []  }                         // optional
 *
 * Requires env: SES_FROM_EMAIL
 *
 * Output: { messageId, from, to, subject, status }
 */

'use strict';
const { execSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const fromEmail = process.env.SES_FROM_EMAIL;
if (!fromEmail) {
  console.log(JSON.stringify({ error: 'SES_FROM_EMAIL environment variable not set. Ask IT admin to configure it in the Skill Platform.' }));
  process.exit(1);
}

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = {}; }

const to = args.to;
if (!to) {
  console.log(JSON.stringify({ error: '`to` is required', usage: '{"to":"user@example.com","subject":"Hello","body":"Message text"}' }));
  process.exit(1);
}

const subject  = args.subject  || '(no subject)';
const body     = args.body     || '';
const bodyType = args.bodyType || 'text';
const toList   = Array.isArray(to) ? to : [to];
const cc       = args.cc  || [];
const bcc      = args.bcc || [];
const region   = process.env.AWS_REGION || 'us-east-1';

const input = {
  Source: fromEmail,
  Destination: {
    ToAddresses:  toList,
    CcAddresses:  cc,
    BccAddresses: bcc,
  },
  Message: {
    Subject: { Data: subject, Charset: 'UTF-8' },
    Body: bodyType === 'html'
      ? { Html: { Data: body, Charset: 'UTF-8' } }
      : { Text: { Data: body, Charset: 'UTF-8' } },
  },
};

const tmpFile = path.join(os.tmpdir(), `ses-input-${Date.now()}.json`);
fs.writeFileSync(tmpFile, JSON.stringify(input));

try {
  const out = execSync(
    `aws ses send-email --cli-input-json "file://${tmpFile}" --region "${region}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const result = JSON.parse(out);
  console.log(JSON.stringify({
    messageId: result.MessageId,
    from:      fromEmail,
    to:        toList,
    subject,
    status:    'sent',
  }, null, 2));
} catch (e) {
  const msg = e.stderr || e.message;
  console.log(JSON.stringify({ error: msg.trim() }));
  process.exit(1);
} finally {
  try { fs.unlinkSync(tmpFile); } catch {}
}
