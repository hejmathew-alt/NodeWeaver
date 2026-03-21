# /test — Run NodeWeaver Test Suite

Run the full automated test suite for the NodeWeaver designer app and present the results report.

## Instructions

Follow these steps exactly, in order.

### Step 1 — Verify prerequisites

Check the test server is running on port 4000:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/stories
```
If the result is not `200`, tell the user: "The test server is not running. Double-click `Run Tests.command` from the repo root (it starts the server and runs the full suite automatically), or run `pnpm test:serve` from `apps/designer` and wait for 'Ready', then run `/test` again." Stop here.

### Step 2 — Install dependencies if needed

Check whether vitest and playwright are installed:
```bash
ls apps/designer/node_modules/.bin/vitest 2>/dev/null && echo "ok" || echo "missing"
ls apps/designer/node_modules/.bin/playwright 2>/dev/null && echo "ok" || echo "missing"
```

If either says "missing", run:
```bash
cd apps/designer && pnpm install
```

Check whether the Playwright Chromium browser is installed:
```bash
ls "$HOME/Library/Caches/ms-playwright/chromium-"*/chrome-mac/Chromium.app 2>/dev/null | head -1
```
If nothing is found, run:
```bash
cd apps/designer && npx playwright install chromium
```

### Step 3 — Run the tests

Run all three suites from `apps/designer/`:

```bash
cd /Users/mojomathers/Documents/Claude Projects/NodeWeaver/apps/designer && pnpm test:unit 2>&1; echo "--- UNIT DONE ---"
```
```bash
cd /Users/mojomathers/Documents/Claude Projects/NodeWeaver/apps/designer && pnpm test:integration 2>&1; echo "--- INTEGRATION DONE ---"
```
```bash
cd /Users/mojomathers/Documents/Claude Projects/NodeWeaver/apps/designer && pnpm test:e2e 2>&1; echo "--- E2E DONE ---"
```

Note: some tests may fail with `ECONNREFUSED` if optional services (Qwen TTS at port 7862) are not running. This is expected — those tests are designed to skip gracefully.

### Step 4 — Generate the report

```bash
cd /Users/mojomathers/Documents/Claude Projects/NodeWeaver/apps/designer && pnpm test:report 2>&1
```

### Step 5 — Read and present the report

Read the file at `apps/designer/test-results/report.md`.

Present the full report to the user. Do not summarise or truncate it — show the complete markdown content verbatim so they can see every test result and every actionable fix suggestion.

If the report file does not exist (generation failed), check `test-results/vitest-results.json` and `test-results/playwright-results.json` to diagnose what went wrong, and tell the user which step failed and why.

### Step 6 — Offer next steps

After presenting the report, offer:
- "Should I investigate any of the failures?"
- "Should I fix any of the issues found?"
