/**
 * NodeWeaver Test Report Generator
 * Reads vitest-results.json + playwright-results.json and writes report.md
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(ROOT, 'test-results');

// ── Readers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseVitestResults(data) {
  if (!data) return { tests: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0 } };

  const tests = [];
  let passed = 0, failed = 0, skipped = 0;

  for (const suite of data.testResults ?? []) {
    const filePath = suite.testFilePath ?? suite.name ?? '';
    const category = filePath.includes('/unit/') ? 'Unit'
      : filePath.includes('/integration/') ? 'Integration'
      : 'Other';

    for (const t of suite.assertionResults ?? []) {
      const ok = t.status === 'passed';
      const isPending = t.status === 'pending' || t.status === 'todo';

      if (ok) passed++;
      else if (isPending || t.status === 'skipped') skipped++;
      else failed++;

      tests.push({
        category,
        name: [...(t.ancestorTitles ?? []), t.title].join(' › '),
        status: t.status,
        ok,
        skipped: isPending || t.status === 'skipped',
        duration: t.duration ?? null,
        error: (t.failureMessages ?? []).join('\n').slice(0, 800),
      });
    }
  }

  return { tests, summary: { total: tests.length, passed, failed, skipped } };
}

function parsePlaywrightResults(data) {
  if (!data) return { tests: [], summary: { total: 0, passed: 0, failed: 0, skipped: 0 } };

  const tests = [];
  let passed = 0, failed = 0, skipped = 0;

  function walkSuites(suites) {
    for (const suite of suites ?? []) {
      walkSuites(suite.suites);
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const result = test.results?.[0];
          const isSkipped = test.status === 'skipped';
          const ok = test.status === 'expected';
          const statusLabel = ok ? 'passed' : isSkipped ? 'skipped' : 'failed';

          if (ok) passed++;
          else if (isSkipped) skipped++;
          else failed++;

          const errors = (result?.errors ?? []).map(e => e.message ?? String(e)).join('\n');

          tests.push({
            category: 'E2E',
            name: spec.fullTitle ?? spec.title,
            status: statusLabel,
            ok,
            skipped: isSkipped,
            duration: result?.duration ?? null,
            error: errors.slice(0, 800),
          });
        }
      }
    }
  }

  walkSuites(data.suites);
  return { tests, summary: { total: tests.length, passed, failed, skipped } };
}

// ── Formatters ───────────────────────────────────────────────────────────────

function parseDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function escMd(str = '') {
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim().slice(0, 120);
}

function statusIcon(t) {
  if (t.ok) return '✅';
  if (t.skipped) return '⏭';
  return '❌';
}

function getSuggestions(name, error) {
  const e = (error ?? '').toLowerCase();
  const n = (name ?? '').toLowerCase();
  const tips = [];

  if (e.includes('econnrefused') || e.includes('fetch failed') || e.includes('network error')) {
    tips.push('Dev server is not running — start it with `pnpm dev` from `apps/designer/`');
  }
  if (n.includes('qwen') && (e.includes('econnrefused') || e.includes('fetch failed'))) {
    tips.push('Qwen server is not running — start `servers/qwen_server.py`');
  }
  if (e.includes('404')) {
    tips.push('API route returned 404 — check the route file exists in `src/app/api/`');
  }
  if (e.includes('400') && !e.includes('econnrefused')) {
    tips.push('Request body or query param was rejected — check route validation logic');
  }
  if (e.includes('401') || e.includes('unauthorized') || e.includes('api key')) {
    tips.push('API key invalid or missing — check `.env.local` (ANTHROPIC_API_KEY, ELEVENLABS_API_KEY)');
  }
  if (e.includes('500') || e.includes('internal server error')) {
    tips.push('Server threw an exception — check the Next.js terminal output for the stack trace');
  }
  if (e.includes('timeout') || e.includes('exceeded')) {
    tips.push('Test timed out — server may be slow or the UI element was not found within the timeout');
  }
  if (n.includes('play mode') && e.includes('timeout')) {
    tips.push('Play mode may have failed to render — check browser console for React errors');
  }
  if (n.includes('node') && e.includes('not found')) {
    tips.push('Canvas node not rendering — check for store hydration issues (open story, check console)');
  }
  if (e.includes('parseerror') || (e.includes('json') && e.includes('unexpected'))) {
    tips.push('Response is not valid JSON — the route may be returning an HTML error page');
  }
  if (e.includes('415')) {
    tips.push('Content-type mismatch in the route — check PUT handler validation');
  }

  return tips;
}

// ── Report builder ────────────────────────────────────────────────────────────

function buildReport(vitestData, playwrightData) {
  const vt = parseVitestResults(vitestData);
  const pw = parsePlaywrightResults(playwrightData);

  const unitTests = vt.tests.filter(t => t.category === 'Unit');
  const integrationTests = vt.tests.filter(t => t.category === 'Integration');
  const e2eTests = pw.tests;
  const allTests = [...vt.tests, ...pw.tests];

  const total = {
    total: allTests.length,
    passed: allTests.filter(t => t.ok).length,
    failed: allTests.filter(t => !t.ok && !t.skipped).length,
    skipped: allTests.filter(t => t.skipped).length,
  };

  const failures = allTests.filter(t => !t.ok && !t.skipped);
  const allPassed = total.failed === 0 && total.total > 0;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let md = `# NodeWeaver Test Report\n\n`;
  md += `**Date:** ${now} UTC  \n`;
  md += `**Overall status:** ${allPassed ? '✅ All tests passed' : `❌ ${total.failed} failure(s)`}  \n`;
  if (!vitestData) md += `> ⚠ No Vitest results found — run \`pnpm test:unit && pnpm test:integration\` first.\n`;
  if (!playwrightData) md += `> ⚠ No Playwright results found — run \`pnpm test:e2e\` first.\n`;
  md += `\n---\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `| Suite | Total | ✅ Passed | ❌ Failed | ⏭ Skipped |\n`;
  md += `|-------|------:|----------:|----------:|-----------:|\n`;

  function suiteRow(label, tests) {
    const t = tests.length;
    const p = tests.filter(x => x.ok).length;
    const f = tests.filter(x => !x.ok && !x.skipped).length;
    const s = tests.filter(x => x.skipped).length;
    return `| ${label} | ${t} | ${p} | ${f} | ${s} |\n`;
  }

  md += suiteRow('Unit', unitTests);
  md += suiteRow('Integration', integrationTests);
  md += suiteRow('E2E (Playwright)', e2eTests);
  md += `| **Total** | **${total.total}** | **${total.passed}** | **${total.failed}** | **${total.skipped}** |\n\n`;

  // Detail tables
  function testTable(tests, heading) {
    if (tests.length === 0) return `## ${heading}\n\n_No results — suite may not have been run._\n\n`;
    let s = `## ${heading}\n\n`;
    s += `| | Test | Duration | Error |\n`;
    s += `|---|------|----------|-------|\n`;
    for (const t of tests) {
      const err = t.error ? escMd(t.error.split('\n')[0]) : '—';
      s += `| ${statusIcon(t)} | ${escMd(t.name)} | ${parseDuration(t.duration)} | ${err} |\n`;
    }
    return s + '\n';
  }

  md += testTable(unitTests, 'Unit Tests');
  md += testTable(integrationTests, 'Integration Tests');
  md += testTable(e2eTests, 'E2E Tests');

  // Failures
  md += `---\n\n`;
  if (failures.length === 0) {
    md += `## ✅ No Failures\n\nAll executed tests passed. The codebase is healthy.\n`;
  } else {
    md += `## ❌ Failures — Actionable Details\n\n`;
    md += `> Use these details to diagnose and fix issues before the next run.\n\n`;

    for (const t of failures) {
      md += `### ${t.name}\n\n`;
      md += `**Suite:** ${t.category} | **Duration:** ${parseDuration(t.duration)}\n\n`;
      if (t.error) {
        md += `**Error:**\n\`\`\`\n${t.error.slice(0, 1200)}\n\`\`\`\n\n`;
      }
      const tips = getSuggestions(t.name, t.error);
      if (tips.length > 0) {
        md += `**Suggested fixes:**\n`;
        for (const tip of tips) md += `- ${tip}\n`;
        md += '\n';
      }
    }
  }

  return md;
}

// ── Main ─────────────────────────────────────────────────────────────────────

mkdirSync(RESULTS_DIR, { recursive: true });

// Merge unit + integration results into a single structure
function mergeVitestResults(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...a, testResults: [...(a.testResults ?? []), ...(b.testResults ?? [])] };
}

const vitestUnit = readJson(resolve(RESULTS_DIR, 'vitest-unit-results.json'));
const vitestIntegration = readJson(resolve(RESULTS_DIR, 'vitest-integration-results.json'));
const vitestData = mergeVitestResults(vitestUnit, vitestIntegration);
const playwrightData = readJson(resolve(RESULTS_DIR, 'playwright-results.json'));

if (!vitestData && !playwrightData) {
  console.error('\n❌ No test result files found in test-results/');
  console.error('   Run `pnpm test` first to generate results.\n');
  process.exit(1);
}

const report = buildReport(vitestData, playwrightData);
const reportPath = resolve(RESULTS_DIR, 'report.md');
writeFileSync(reportPath, report, 'utf-8');

console.log(`\n📋 Report written → test-results/report.md\n`);
console.log(report);
