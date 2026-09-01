#!/usr/bin/env node
// Real security audit worker. Replaces `npx @claude-flow/cli@latest hooks worker dispatch
// --trigger audit`, which failed every single time on this machine with "spawn claude ENOENT"
// (see .claude-flow/logs/headless/audit_*_result.log) — Node's spawn() without shell:true only
// resolves claude.exe on Windows, but the npm global bin only has claude/claude.cmd/claude.ps1.
// This spawns the same already-installed `claude` CLI with shell:true (so Windows resolves the
// .cmd shim) and lets it read the real files instead of a hardcoded/truncated context dump.
//
// Usage: node scripts/security-audit.mjs

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROMPT = `Audit this repository for real, concrete security issues — not hypothetical ones.
Check: hardcoded secrets/API keys, SQL injection risk, XSS, insecure auth/authorization, unsafe
dependency usage. Read the actual files (worker/src/, supabase/functions/, js/, *.html, admin.html)
with your own tools — do not guess or invent findings, and do not repeat already-fixed issues you
find only in .claude-flow/logs/ or git history. Reply with ONLY this JSON, no prose, no markdown fences:
{"vulnerabilities":[{"severity":"high|medium|low","file":"...","line":N,"description":"..."}],"riskScore":0-100,"recommendations":["..."]}`;

const statusPath = '.claude-flow/security/audit-status.json';
const metricsPath = '.claude-flow/metrics/security-audit.json';
const now = new Date().toISOString();

function fail(reason, extra = {}) {
  console.error(`Audit failed: ${reason}`);
  writeFileSync(metricsPath, JSON.stringify({ timestamp: now, success: false, error: reason, ...extra }, null, 2));
  process.exit(1);
}

// Strip CLAUDE_CODE_*/CLAUDECODE env vars so the child never bridges into a live parent
// session (it would otherwise attach to CLAUDE_CODE_MESSAGING_SOCKET and print a chat-style
// status update instead of the JSON envelope) — matters whenever this runs nested under another
// Claude Code session, not just when triggered standalone by cron/CI/daemon.
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^CLAUDE/i.test(k))
);

// PROMPT goes over stdin, not argv: cmd.exe's argument quoting (shell:true is required on
// Windows to resolve the claude.cmd shim) mangles long strings full of quotes/braces/colons,
// which silently corrupted --output-format and made claude fall back to plain text output.
const proc = spawnSync(
  'claude',
  ['-p', '--output-format', 'json', '--allowedTools', 'Read Grep Glob'],
  { cwd: process.cwd(), encoding: 'utf8', shell: true, timeout: 20 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, env: childEnv, input: PROMPT }
);

if (proc.error) fail(proc.error.message);
if (proc.status !== 0) fail(`claude exited ${proc.status}: ${(proc.stderr || '').slice(0, 500)}`);

let envelope;
try {
  envelope = JSON.parse(proc.stdout);
} catch {
  fail('claude did not return a valid JSON envelope', { raw: proc.stdout.slice(0, 1000) });
}

if (envelope.is_error) fail(`claude reported an error: ${envelope.result}`);

let report;
try {
  const text = String(envelope.result).trim().replace(/^```json\s*|```$/g, '');
  report = JSON.parse(text);
} catch {
  fail('model reply was not the expected JSON shape', { raw: String(envelope.result).slice(0, 1000) });
}

const vulns = report.vulnerabilities || [];
const high = vulns.filter((v) => v.severity === 'high').length;

writeFileSync(metricsPath, JSON.stringify({ timestamp: now, success: true, costUsd: envelope.total_cost_usd, ...report }, null, 2));
writeFileSync(statusPath, JSON.stringify({
  initialized: now,
  status: high > 0 ? 'FAILING' : 'PASSING',
  totalCves: vulns.length,
  lastScan: now,
}, null, 2));

console.log(`Audit real: ${vulns.length} findings (${high} high). riskScore=${report.riskScore}. cost=$${(envelope.total_cost_usd ?? 0).toFixed(4)}`);
process.exit(high > 0 ? 1 : 0);
