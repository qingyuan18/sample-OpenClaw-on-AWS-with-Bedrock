#!/usr/bin/env node
/**
 * crm-query — Query Salesforce CRM via REST API.
 *
 * Input (JSON string as argv[2]):
 *   { "soql": "SELECT Id, Name, Amount FROM Opportunity WHERE StageName = 'Closed Won' LIMIT 10" }
 *   { "action": "describe", "objectType": "Account" }
 *   { "action": "get", "objectType": "Contact", "id": "003xx000004TmiQ" }
 *
 * Requires env: SF_CLIENT_ID, SF_CLIENT_SECRET, SF_INSTANCE_URL
 * Output: { records, totalSize, done } or { fields, name } for describe
 */

'use strict';
const https = require('https');
const qs    = require('querystring');

const clientId     = process.env.SF_CLIENT_ID;
const clientSecret = process.env.SF_CLIENT_SECRET;
const instanceUrl  = process.env.SF_INSTANCE_URL;

if (!clientId || !clientSecret || !instanceUrl) {
  console.log(JSON.stringify({ error: 'SF_CLIENT_ID, SF_CLIENT_SECRET, and SF_INSTANCE_URL environment variables are required. Ask IT admin to configure them in the Skill Platform.' }));
  process.exit(1);
}

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = {}; }

// ── HTTP helpers ────────────────────────────────────────────────────────────
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = typeof body === 'string' ? body : qs.stringify(body);
    const options = {
      hostname: u.hostname, port: 443, path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data), ...headers },
    };
    const req = https.request(options, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname, port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    };
    const req = https.request(options, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. OAuth2 client_credentials flow
  const tokenResp = await post(`${instanceUrl}/services/oauth2/token`, {
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
  });

  if (tokenResp.status !== 200 || !tokenResp.body.access_token) {
    const err = tokenResp.body?.error_description || tokenResp.body?.error || 'Authentication failed';
    console.log(JSON.stringify({ error: err }));
    process.exit(1);
  }

  const token   = tokenResp.body.access_token;
  const apiBase = `${instanceUrl}/services/data/v59.0`;

  // 2. Execute the requested action
  const action = args.action || 'query';

  if (action === 'query' || args.soql) {
    const soql = args.soql;
    if (!soql) {
      console.log(JSON.stringify({ error: '`soql` is required for query action', example: '{"soql":"SELECT Id, Name FROM Account LIMIT 5"}' }));
      process.exit(1);
    }
    const url  = `${apiBase}/query?q=${encodeURIComponent(soql)}`;
    const resp = await get(url, token);
    if (resp.status !== 200) {
      const err = Array.isArray(resp.body) ? resp.body[0]?.message : JSON.stringify(resp.body);
      console.log(JSON.stringify({ error: err }));
      process.exit(1);
    }
    console.log(JSON.stringify({ totalSize: resp.body.totalSize, done: resp.body.done, records: resp.body.records }, null, 2));

  } else if (action === 'describe') {
    const objectType = args.objectType;
    if (!objectType) { console.log(JSON.stringify({ error: '`objectType` is required for describe' })); process.exit(1); }
    const resp = await get(`${apiBase}/sobjects/${objectType}/describe`, token);
    if (resp.status !== 200) { console.log(JSON.stringify({ error: JSON.stringify(resp.body) })); process.exit(1); }
    const fields = (resp.body.fields || []).map(f => ({ name: f.name, label: f.label, type: f.type }));
    console.log(JSON.stringify({ name: resp.body.name, label: resp.body.label, fields }, null, 2));

  } else if (action === 'get') {
    const { objectType, id } = args;
    if (!objectType || !id) { console.log(JSON.stringify({ error: '`objectType` and `id` are required for get' })); process.exit(1); }
    const resp = await get(`${apiBase}/sobjects/${objectType}/${id}`, token);
    if (resp.status !== 200) { console.log(JSON.stringify({ error: JSON.stringify(resp.body) })); process.exit(1); }
    console.log(JSON.stringify(resp.body, null, 2));

  } else {
    console.log(JSON.stringify({ error: `Unknown action: ${action}`, validActions: ['query', 'describe', 'get'] }));
    process.exit(1);
  }
}

main().catch(e => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
