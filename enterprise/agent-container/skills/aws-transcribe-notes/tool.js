#!/usr/bin/env node
/**
 * aws-transcribe-notes — Transcribe a meeting recording and generate structured notes.
 *
 * Two modes:
 *   Start job:  { "s3Uri": "s3://bucket/recording.mp3", "language": "en-US" }
 *   Get result: { "jobName": "openclaw-transcribe-xxxx" }
 *
 * Output (start):  { jobName, status: "IN_PROGRESS", checkIn: "~60s" }
 * Output (result): { jobName, status, transcript, notes: { summary, actionItems, decisions } }
 */

'use strict';
const { execSync } = require('child_process');

let args = {};
try { args = JSON.parse(process.argv[2] || '{}'); } catch { args = {}; }

const region = process.env.AWS_REGION || 'us-east-1';

// ── Mode: check existing job ───────────────────────────────────────────────
if (args.jobName) {
  try {
    const out = execSync(
      `aws transcribe get-transcription-job --transcription-job-name "${args.jobName}" --region "${region}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const job    = JSON.parse(out).TranscriptionJob;
    const status = job.TranscriptionJobStatus;

    if (status !== 'COMPLETED') {
      console.log(JSON.stringify({ jobName: args.jobName, status, message: status === 'FAILED' ? job.FailureReason : 'Still processing, check again shortly.' }));
      process.exit(0);
    }

    // Download transcript JSON
    const transcriptUri = job.Transcript?.TranscriptFileUri;
    if (!transcriptUri) throw new Error('No transcript URI found');

    const rawTranscript = execSync(`curl -sf "${transcriptUri}"`, { encoding: 'utf8' });
    const transcriptData = JSON.parse(rawTranscript);
    const text = transcriptData.results?.transcripts?.[0]?.transcript || '';

    // Generate structured notes by extracting patterns from the transcript
    const sentences   = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const actionItems = sentences.filter(s => /\b(will|should|need to|action|todo|follow.?up|assign|deadline|by [A-Z])\b/i.test(s)).slice(0, 8);
    const decisions   = sentences.filter(s => /\b(decided|agreed|confirmed|approved|resolved|concluded|final)\b/i.test(s)).slice(0, 5);
    const summary     = text.length > 600 ? text.slice(0, 600).replace(/\s\S*$/, '') + '...' : text;

    console.log(JSON.stringify({
      jobName: args.jobName,
      status:  'COMPLETED',
      language: job.LanguageCode,
      durationSeconds: job.MediaFormat ? undefined : undefined,
      transcript: text,
      notes: {
        summary,
        actionItems: actionItems.length ? actionItems : ['No explicit action items detected'],
        decisions:   decisions.length   ? decisions   : ['No explicit decisions detected'],
      },
    }, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: (e.stderr || e.message || '').trim() }));
    process.exit(1);
  }
  process.exit(0);
}

// ── Mode: start new job ────────────────────────────────────────────────────
const s3Uri = args.s3Uri;
if (!s3Uri) {
  console.log(JSON.stringify({
    error: '`s3Uri` or `jobName` is required',
    usage: '{"s3Uri":"s3://my-bucket/meeting.mp3","language":"en-US"} or {"jobName":"openclaw-transcribe-xxxx"}',
  }));
  process.exit(1);
}

const language = args.language || 'en-US';
const jobName  = `openclaw-transcribe-${Date.now()}`;

// Infer media format from extension
const ext         = s3Uri.split('.').pop().toLowerCase();
const mediaFormat = ['mp3','mp4','wav','flac','ogg','amr','webm'].includes(ext) ? ext : 'mp3';

try {
  execSync(
    `aws transcribe start-transcription-job` +
    ` --transcription-job-name "${jobName}"` +
    ` --language-code "${language}"` +
    ` --media-format "${mediaFormat}"` +
    ` --media '{"MediaFileUri":"${s3Uri}"}'` +
    ` --region "${region}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );

  console.log(JSON.stringify({
    jobName,
    status:   'IN_PROGRESS',
    s3Uri,
    language,
    message:  'Transcription started. Call this skill again with {"jobName":"' + jobName + '"} to retrieve results (usually ready in 30-90 seconds).',
  }, null, 2));
} catch (e) {
  const msg = (e.stderr || e.message || '').trim();
  console.log(JSON.stringify({ error: msg }));
  process.exit(1);
}
