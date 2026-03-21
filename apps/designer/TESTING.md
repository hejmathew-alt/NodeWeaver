# NodeWeaver — Test Suite

Automated test coverage for the NodeWeaver designer app. Tests run against a live local dev server.

---

## Stack

| Layer | Tool | Config |
|-------|------|--------|
| Unit tests | Vitest v2 | `vitest.config.ts` |
| Integration tests | Vitest v2 | same config, separate `tests/integration/` |
| E2E tests | Playwright v1.50 | `playwright.config.ts` |
| Report generator | Node ESM script | `scripts/generate-report.mjs` |

---

## Directory Layout

```
apps/designer/
├── tests/
│   ├── unit/
│   │   ├── blocks.test.ts         — deriveBody + migrateNodeToBlocks
│   │   ├── char-seed.test.ts      — charSeed determinism + range
│   │   └── constants.test.ts      — DEBOUNCE_* + AI_MAX_TOKENS values
│   ├── integration/
│   │   ├── helpers.ts             — BASE_URL, makeTestStory, makeMinimalWav, isServiceUp
│   │   ├── api-stories.test.ts    — Story CRUD (POST / GET / PUT / DELETE / 404)
│   │   ├── api-audio.test.ts      — Audio file storage API (PUT / GET / DELETE / errors)
│   │   ├── api-ai-generate.test.ts — AI route smoke tests (voice, line, inspire, avatar-prompt, invalid mode)
│   │   └── api-tts.test.ts        — Qwen + ElevenLabs TTS routes (skips if unavailable)
│   └── e2e/
│       ├── dashboard.spec.ts      — Dashboard loads, Inspire Me + Quick Start modals open
│       ├── canvas.spec.ts         — Canvas page: nodes render, toolbar buttons, add node, zoom
│       ├── node-editor.spec.ts    — Node editor panel: click to open, save, play, prose preview
│       └── play-mode.spec.ts      — Play mode: launches, shows content, exit, canvas ▶ button
├── scripts/
│   └── generate-report.mjs       — Reads JSON outputs → writes test-results/report.md
├── test-results/                  — Generated output (gitignored except .gitkeep)
│   ├── .gitkeep
│   ├── vitest-results.json        — Written by Vitest
│   ├── playwright-results.json    — Written by Playwright
│   ├── playwright-html/           — Playwright HTML report
│   └── report.md                  — Final aggregated markdown report
├── vitest.config.ts
└── playwright.config.ts
```

---

## Prerequisites

### 1. Install dependencies (first time only)

```bash
cd apps/designer
pnpm install
```

### 2. Install Playwright browsers (first time only)

```bash
cd apps/designer
npx playwright install chromium
```

### 3. Start the full stack

The integration and E2E tests require the Next.js dev server to be running:

```bash
# From the repo root or apps/designer
pnpm dev
```

Wait until you see `✓ Ready in Xms` before running tests.

### 4. Optional services

Some tests skip gracefully if these are unavailable:

| Service | Port | Test file |
|---------|------|-----------|
| Qwen TTS server | 7862 | `api-tts.test.ts` — Qwen block skipped if down |
| ElevenLabs API key | — | `api-tts.test.ts` — EL block skipped if key empty |

---

## Running Tests

### Full suite (unit + integration + E2E) then report

```bash
cd apps/designer
pnpm test
```

This runs all three suites sequentially and writes `test-results/report.md`.

### Individual suites

```bash
pnpm test:unit          # Vitest unit tests only
pnpm test:integration   # Vitest integration tests (needs dev server)
pnpm test:e2e           # Playwright E2E (needs dev server)
pnpm test:report        # Re-generate report.md from existing JSON results
```

### View the Playwright HTML report

```bash
npx playwright show-report test-results/playwright-html
```

---

## What Each Suite Tests

### Unit (`tests/unit/`)

Pure logic tests. No network. No filesystem. Fast.

| File | What's tested |
|------|---------------|
| `blocks.test.ts` | `deriveBody()` — correct text derivation from block arrays; `migrateNodeToBlocks()` — legacy node body migration |
| `char-seed.test.ts` | `charSeed()` — determinism, uniqueness, range bounds, edge cases |
| `constants.test.ts` | `DEBOUNCE_PERSIST` (300ms), `DEBOUNCE_SPANS` > `DEBOUNCE_PERSIST`, all `AI_MAX_TOKENS` modes positive, `story-gen` highest, all integers |

### Integration (`tests/integration/`)

HTTP tests against the live dev server at `http://localhost:3000`. Each test creates isolated `test_*` story IDs and cleans them up via DELETE.

| File | Routes tested |
|------|---------------|
| `api-stories.test.ts` | `POST /api/stories`, `GET /api/stories`, `GET /api/stories/:id`, `PUT /api/stories/:id`, `DELETE /api/stories/:id`, 404 for missing/deleted |
| `api-audio.test.ts` | `PUT /api/stories/:id/audio`, `GET /api/stories/:id/audio`, path traversal → 400, wrong content-type → 415, missing param → 400, DELETE |
| `api-ai-generate.test.ts` | `POST /api/ai/generate` with modes `voice`, `line`, `inspire`, `avatar-prompt`; missing mode → 400 |
| `api-tts.test.ts` | `POST /api/qwen/speak` → valid WAV; `POST /api/tts/elevenlabs` → valid MP3 |

### E2E (`tests/e2e/`)

Browser automation via Playwright (headless Chromium). Tests create a story via API in `beforeAll` and delete it in `afterAll`.

| File | What's covered |
|------|----------------|
| `dashboard.spec.ts` | App loads without crash, story list or empty state visible, Inspire Me modal opens, Quick Start modal opens |
| `canvas.spec.ts` | Canvas page loads, toolbar visible, existing nodes render, adding a node increases node count, zoom controls work, story title visible, Characters navigation works |
| `node-editor.spec.ts` | Clicking a node opens the editor panel, Save button is present, Play/Finalise visible, prose text appears in canvas preview, adding a node then saving doesn't crash |
| `play-mode.spec.ts` | Play button launches play mode, story content renders, Exit returns to canvas, canvas ▶ on a node works |

---

## Report

After running tests, `test-results/report.md` contains:

- **Overall status** — pass/fail summary
- **Summary table** — Unit / Integration / E2E totals
- **Detail tables** — every test with status icon, name, duration, first error line
- **Failures section** — full error + actionable suggested fix per failure

### Suggested fix patterns (auto-detected)

| Error pattern | Suggested fix |
|---------------|---------------|
| `ECONNREFUSED` / `fetch failed` | Dev server not running — `pnpm dev` |
| Qwen + connection refused | Qwen server not running — `servers/qwen_server.py` |
| `404` | API route missing in `src/app/api/` |
| `400` (not connection error) | Request body/query param rejected — check validation |
| `401` / `api key` | Key missing/invalid in `.env.local` |
| `500` / `internal server error` | Server exception — check Next.js terminal |
| `timeout` / `exceeded` | Server slow or UI element not found |
| `parseerror` / `json` + `unexpected` | Route returning HTML error page instead of JSON |
| `415` | Content-type mismatch — check PUT handler |

---

## Environment Variables

Integration and TTS tests read from `apps/designer/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...      # Required for api-ai-generate tests
ELEVENLABS_API_KEY=sk_...         # Optional — EL TTS tests skip if missing
```

The helpers file parses `.env.local` directly (does not rely on Next.js env loading).

---

## Adding New Tests

**Unit test** — add a `*.test.ts` file under `tests/unit/`. Import from `@/lib/…` or `@nodeweaver/engine`. No server required.

**Integration test** — add a `*.test.ts` file under `tests/integration/`. Use `BASE_URL` + `makeTestStoryId()` from `helpers.ts`. Always clean up test stories in `afterAll`.

**E2E test** — add a `*.spec.ts` file under `tests/e2e/`. Use the Playwright `request` fixture to create/delete test stories via API.

---

## CI / Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| All integration tests fail with `ECONNREFUSED` | Dev server not running | `pnpm dev` |
| E2E tests time out on `waitForSelector` | Page didn't load in time | Increase `timeout` in `playwright.config.ts` |
| Vitest can't resolve `@/lib/…` | Path alias not set | Check `vitest.config.ts` `resolve.alias` |
| `Cannot find module '@nodeweaver/engine'` | Engine package not built | `pnpm install` from repo root |
| TTS tests always skip | Service down or key missing | Start Qwen server or add `ELEVENLABS_API_KEY` to `.env.local` |
| Report says "No results found" | Tests not yet run | Run `pnpm test` first |
