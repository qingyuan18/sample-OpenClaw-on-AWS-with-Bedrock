#!/usr/bin/env node
/**
 * aws-bedrock-kb-search — Semantic search over Amazon Bedrock Knowledge Bases.
 *
 * Input (JSON string as argv[2]):
 *   { "query": "What is our refund policy?", "numResults": 5 }
 *
 * Requires env: BEDROCK_KB_ID
 *
 * Output: { query, results: [{ content, score, source, location }] }
 */

'use strict';
const { execSync } = require('child_process');

const kbId = process.env.BEDROCK_KB_ID;
if (!kbId) {
  console.log(JSON.stringify({ error: 'BEDROCK_KB_ID environment variable not set. Ask IT admin to configure it in the Skill Platform.' }));
  process.exit(1);
}

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = { query: process.argv[2] }; }

const query      = args.query;
const numResults = args.numResults || 5;
const region     = process.env.AWS_REGION || 'us-east-1';

if (!query) {
  console.log(JSON.stringify({ error: '`query` is required', usage: '{"query":"What is the expense policy?","numResults":5}' }));
  process.exit(1);
}

try {
  const out = execSync(
    `aws bedrock-agent-runtime retrieve` +
    ` --knowledge-base-id "${kbId}"` +
    ` --retrieval-query '{"text":${JSON.stringify(query)}}'` +
    ` --retrieval-configuration '{"vectorSearchConfiguration":{"numberOfResults":${numResults}}}'` +
    ` --region "${region}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );

  const response = JSON.parse(out);
  const results  = (response.retrievalResults || []).map(r => ({
    content:  r.content?.text || '',
    score:    r.score         || 0,
    source:   r.location?.s3Location?.uri || r.location?.webLocation?.url || 'unknown',
    metadata: r.metadata      || {},
  }));

  console.log(JSON.stringify({ query, numResults: results.length, results }, null, 2));
} catch (e) {
  const msg = (e.stderr || e.message || '').trim();
  console.log(JSON.stringify({ error: msg }));
  process.exit(1);
}
