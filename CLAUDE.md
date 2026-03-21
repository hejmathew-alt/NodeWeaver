# NodeWeaver — CLAUDE.md

## What is NodeWeaver?

A visual interactive-fiction authoring tool. Writers create branching narrative stories by placing and connecting scene nodes on a canvas, writing prose and dialogue into content blocks, and auditioning character voices via local AI TTS. Exports `.nwv` JSON files for a game engine runtime to play. Stories are authored locally and released publicly as finished interactive games.

**Hardware**: Runs on an M4 Mac Mini (32 GB RAM). Accessed at the desk and from an iPad over the home local network at `http://192.168.x.x:3000`.

## Monorepo Layout

```
NodeWeaver/
├── apps/designer/          Next.js 16 app (the authoring UI)
│   └── src/
│       ├── app/            App Router pages + API routes
│       ├── components/     Canvas, panels, dashboard
│       ├── lib/            Utilities (TTS, AI context, export, layout)
│       ├── store/          Zustand stores
│       └── types/          Ambient TS declarations
├── packages/engine/        Shared types & constants (@nodeweaver/engine)
│   └── src/
│       ├── types/          NWV schema (source of truth)
│       └── constants/      Genre metadata & theme colours
├── servers/                Python AI servers + venv
│   ├── qwen_server.py      Qwen TTS server (port 7862)
│   ├── audiocraft_server.py Stable Audio Open SFX/ambient/music server (port 7863)
│   └── venv/               Python 3.11 virtualenv
├── package.json            Root: delegates dev/build/lint to designer
├── pnpm-workspace.yaml     Workspace config (apps/* + packages/*)
└── Launch NodeWeaver.command  Shell shortcut → pnpm dev
```

## Tech Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **@xyflow/react** v12 — canvas/graph renderer
- **@dnd-kit/core + sortable** — drag-and-drop block reordering & cross-node moves
- **@dagrejs/dagre** — hierarchical auto-layout
- **Zustand v5** — state (`useStoryStore`, `useSettingsStore`)
- **Dexie v4** — IndexedDB persistence (DB name: `VoidRunnerDesigner`)
- **Tailwind CSS v4**
- **nanoid** — block/node IDs
- **pnpm** workspaces

## Commands

```bash
pnpm dev          # runs designer on localhost:3000
pnpm build        # production build
pnpm lint         # eslint
```

## Node Types

| Type     | Colour  | Badge         | Handles          |
|----------|---------|---------------|------------------|
| `start`  | teal    | Start         | source only      |
| `story`  | blue    | Story         | source + target  |
| `combat` | red     | Interactive   | source + target  |
| `chat`   | green   | Chat          | source + target  |
| `twist`  | purple  | Twist (dashed)| source + target  |
| `end`    | orange  | End           | target only      |

## Content Model

- **NWVStory** → nodes[], characters[], lanes[], enemies{}
- **NWVNode** → ordered **blocks[]** (prose | line), choices[], position, status
- **NWVBlock** → type, text, characterId, emotion, tone, voiceTexture, sfxCues[]
- **NWVChoice** → label, flavour, next (node ID), effects, requires, combat, ending
- **NWVCharacter** → name, role, backstory, traits, qwenInstruct, TTS provider config, default delivery params
- **NWVLane** → swim lane / story arc with colour and description
- **Narrator** — built-in character (id: `'narrator'`), auto-injected if missing

`body` field is auto-derived from prose blocks via `deriveBody()` for game engine backward-compat. Blocks are the source of truth in the designer.

## Key Files

### Canvas & Nodes
- `components/canvas/StoryCanvas.tsx` — main canvas (React Flow + DnD + panel system)
- `components/canvas/CanvasToolbar.tsx` — node creation, auto-arrange, panel toggles
- `components/canvas/nodes/` — StoryNode, CombatNode, ChatNode, TwistNode, StartNode, EndNode
- `components/canvas/nodes/BlocksPreview.tsx` — sortable block list inside canvas nodes
- `components/canvas/nodes/CanvasBlock.tsx` — individual draggable block row

### Panels
- `components/CanvasPlayer.tsx` — canvas-native TTS playback HUD (triggered by ▶ on nodes)
- `components/panels/NodeEditorPanel.tsx` — block editor, choices, TTS playback, AI write
- `components/panels/CharacterPanel.tsx` — character list, voice design, AI generate, voice test
- `components/panels/SettingsPanel.tsx` — TTS provider, canvas text size, API keys

### State & Data
- `store/story.ts` — useStoryStore (all story CRUD, node/block/choice/character mutations)
- `lib/settings.ts` — useSettingsStore (TTS provider, API keys, canvas text size)
- `lib/db.ts` — Dexie schema (stories + fileHandles tables)

### AI & TTS
- `app/api/ai/generate/route.ts` — Claude streaming (3 modes: voice, body, line)
- `app/api/qwen/speak/route.ts` — Qwen full WAV synthesis
- `app/api/qwen/stream/route.ts` — Qwen streaming WAV synthesis
- `lib/qwen-daemon.ts` — manages local Qwen TTS server subprocess (port 7862)
- `lib/char-seed.ts` — deterministic voice seed hash per character
- `lib/context-builder.ts` — builds AI writing context from story graph (ancestors, siblings, twists)

### Audio Generation (SFX / Ambient / Music)
- `servers/audiocraft_server.py` — Stable Audio Open server (port 7863), MPS GPU accelerated
- `lib/audiocraft-daemon.ts` — daemon manager for audio server (singleton, auto-spawn)
- `lib/sfx-player.ts` — Web Audio API player (playOnce, playLooped, playFromUrl)
- `app/api/audio/sfx/route.ts` — SFX generation proxy (local Stable Audio or ElevenLabs cloud)
- `app/api/audio/ambient/route.ts` — Ambient generation proxy
- `app/api/audio/music/route.ts` — Music generation proxy

### Export & Layout
- `lib/export.ts` — File System Access API save/open, .nwv JSON export
- `lib/blocks.ts` — deriveBody(), migrateNodeToBlocks()
- `lib/layout.ts` — autoLayout() (Dagre), pushOverlaps() (collision BFS)

### Engine Package
- `packages/engine/src/types/index.ts` — all NWV types (single source of truth)
- `packages/engine/src/constants/genres.ts` — GENRE_META with briefs, voice test lines, theme colours

## Genres

sci-fi, fantasy, horror, mystery-noir, post-apocalyptic, cyberpunk, comedy, romance, custom. Each has a writing brief (injected into AI prompts), sample voice test lines, and themed canvas colours.

## TTS Architecture

**Two-phase audio strategy:**
- **Dev / authoring phase** — Qwen3-TTS for all nodes. Fast, free, local. Good enough for iteration.
- **Polish / release phase** — ElevenLabs batch API for all fixed dialogue nodes. High quality, one-time cost per release. WAVs shipped with game files.
- **Shipped game (runtime)** — ~95% pre-generated EL WAVs. Only the single dynamic AI-driven character uses the live Qwen pipeline at runtime.

**Qwen (primary, local)**: Python server at `servers/qwen_server.py`, port 7862. Managed as singleton subprocess by `qwen-daemon.ts`. Voice consistency via deterministic `charSeed(characterId)`. Streaming playback uses Web Audio API with gapless scheduling. Known limitation: Qwen3 defaults to American accent — British prompting is inconsistent.

Voice design params per block: `[Emotional: X] [Tone: Y] [Voice: Z]` bracket tags appended to the character's `qwenInstruct` prompt.

**Other providers**: ElevenLabs / EL (API key needed). Kokoro and Web Speech have been removed.

**ElevenLabs API permissions required**: Text to Speech, Sound Effects, Voices (Write), Voice Generation.

> **Shorthand**: In conversations, "Q" or "Qwen" means the local Qwen TTS server; "EL" or "ElevenLabs" means the ElevenLabs cloud TTS/SFX API.

## Audio Generation Architecture

**Stable Audio Open (local)**: Text-to-audio diffusion model (`stabilityai/stable-audio-open-1.0`) via `diffusers.StableAudioPipeline`. Python server at `servers/audiocraft_server.py`, port 7863. Managed by `audiocraft-daemon.ts`. Runs on MPS (Apple Silicon GPU). Single model handles SFX, ambient, and music. Outputs 44.1kHz stereo (converted to mono WAV).

**ElevenLabs SFX (cloud)**: Alternative provider via `https://api.elevenlabs.io/v1/sound-generation`. Requires API key (set in Settings). Higher quality, returns MP3 at 48kHz. Provider selection in Settings panel (`sfxProvider: 'local' | 'elevenlabs'`).

**Audio types**: SFX (spot effects, 3s default, 10s max), Ambient (looping soundscapes, 15s default, 30s max), Music (background score, 15s default, 30s max). SFX attaches per-block as `NWVSFXCue[]` with `wordIndex` for word-anchored timing; ambient/music attaches per-node.

**Python venv**: `servers/venv/` — torch 2.10, diffusers 0.31, transformers 4.57.

## AI Tool Suite

Four AI tools with an organic metaphor — **Seed**, **Loom**, **Canopy**, **Graft**:

| Tool | Purpose | Status |
|------|---------|--------|
| **Seed** | Plants the story — conversation-first wizard for concept → premise → cast → architecture → canvas | Implemented |
| **Loom** | Weaves the nodes — per-node developmental editor with structural analysis | Implemented |
| **Canopy** | Watches the whole shape from above — story-level structural advisor | Future |
| **Graft** | Makes careful interventions that change direction — narrative tutor | Future |

### Seed

Conversation-first tabbed panel (`SeedModal.tsx`). Four tabs: **Conversation** (freeform chat), **Premise** (3 structured cards), **Cast** (character cards with wound/want), **Architecture** (act spine + jaw-drop moments). "Plant this seed" creates NWVStory scaffold.

- `POST /api/seed-chat` — streaming conversational responses with multi-turn history, phase-scoped prompts
- `POST /api/seed-generate` — structured JSON generation for premise/cast/architecture tabs
- Prompts in `lib/ai-prompts.ts`: `buildSeedChatSystem()`, `buildSeedGenerateSystem()`, `buildSeedGenerateUser()`

### AI Co-Author

Uses Claude Sonnet via `/api/ai/generate`. Five modes:
- **voice** — generates Qwen TTS instruct prompt from voice concept (300 tokens)
- **body** — writes/rewrites scene prose with full story-graph context (500 tokens)
- **line** — writes single dialogue line with scene + character context (200 tokens)
- **audio-suggest** — analyzes full scene → suggests SFX/ambient/music prompts as JSON (800 tokens, non-streaming)
- **sfx-suggest** — analyzes single block → suggests 1–4 word-anchored SFX cues as JSON (800 tokens, non-streaming)

Context builder (`lib/context-builder.ts`) does BFS from roots to build: ancestral path, sibling branches, downstream twist anchors, path characters.

## Conventions

- All paths below `apps/designer/src/` unless noted
- Component files use PascalCase, lib files use kebab-case
- Zustand stores use `use[Name]Store` pattern
- IDs generated with `nanoid()`
- Colours: light mode canvas (slate-50 bg, dot pattern)
- Panel widths: default 320, wide 640, range 280–800
- Cmd+S / Ctrl+S saves to linked file handle
- Delete/Backspace deletes selected node (unless locked or text focused)

## Working Approach

- Read before editing — understand existing patterns first
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused
- Test TTS changes against the local Qwen server
- The engine package has no runtime deps — types and constants only

---

## Code Quality Standards

*Standing rules distilled from codebase reviews. Apply these in all new and modified code.*

### Security
- **Secrets**: API keys and tokens live only in `.env.local` (gitignored via `.env*`). Never hardcode or log them. Never spread `process.env` into subprocess `env` — pass an explicit whitelist (`PATH`, `HOME`, and only what the subprocess needs).
- **Filename inputs**: Any user-supplied filename used in a server-side file operation must be validated with a strict regex before use. `path.basename()` alone is not sufficient. Example: `/^(tts|sfx|ambient|music)_[a-z0-9]{16}[a-z0-9_-]*\.(wav|mp3|json)$/.test(filename)`.
- **Shell commands**: Never interpolate user-controlled or configurable values into shell strings. Use Node.js APIs (`net`, `fs`, `child_process` with argument arrays) instead of `exec()` with template strings.
- **Colour values**: Before inserting any colour string into a CSS `style` attribute via `innerHTML`, validate with `/^#[0-9a-f]{6}$/i`. `escapeHtml()` on the text content is not enough.

### Error Handling
- **Don't swallow errors silently**: Every `catch {}` block must at minimum `console.error`. Prefer surfacing errors to the user for operations they initiated.
- **Fire-and-forget only for non-critical persistence**: Timestamp saves, IDB caches, and speculative pre-generation may be fire-and-forget. Story persist (`store/story.ts`) must surface failures — if a PUT to `/api/stories/[id]` fails, the user should know.
- **Type-narrow caught errors**: `catch (err)` → `if (err instanceof Error) console.error(err.message); else console.error(err)`. Never use `err.message` directly on `unknown`.

### React & TypeScript
- **Memoize expensive derivations**: Any function that traverses the full node/block graph (e.g. `storyToFlow()`) must be wrapped in `useMemo` with the correct dependency. Don't call it naked in render.
- **Document intentional eslint-disable**: When disabling `react-hooks/exhaustive-deps` for a RAF loop or stable ref pattern, add a one-line comment explaining why (e.g. `// RAF attaches once; reads storyRef for latest data`).
- **Unsafe casts**: `as unknown as X` is a code smell. If you need it, add a comment explaining why TypeScript can't infer correctly, and narrow the type at the boundary instead if possible.

### Memory Leaks
- Every `setInterval`, `setTimeout`, `addEventListener`, and RAF loop started inside a `useEffect` must be cleaned up in the effect's return function.
- For intervals inside async IIFEs (e.g. playback loops): move the interval ID out of the IIFE so the `useEffect` cleanup can reach it. Or check `isMounted` at the top of the interval callback.

### Daemon / Subprocess Paths
- All server script paths and venv paths are rooted at `os.homedir() + 'Documents/Claude Projects/NodeWeaver/servers/'`. Follow the pattern established in `comfyui-daemon.ts`. Never hardcode paths from a previous project location.

### Constants
- Debounce timings, token limits, and other magic numbers belong in named constants, not inline literals. Prefer adding them to the relevant module (e.g. `DEBOUNCE_PERSIST` near the top of `store/story.ts`) rather than scattering them as bare numbers.

---

## Git Practices

### Branch Strategy
- `main` — stable, releasable only. Never commit directly.
- `develop` — active integration branch. Day-to-day target.
- `feature/<name>` — one branch per meaningful unit of work.

Always branch from `develop`, merge back to `develop`.

### Workflow
```bash
git checkout develop
git checkout -b feature/<descriptive-name>
# develop and test...
git add -p                          # stage by hunk, not whole files
git commit -m "type: description"
git checkout develop
git merge feature/<name> --no-ff
git branch -d feature/<name>
```

### Commit Messages (Conventional Commits)
Format: `type: short description`

| Type | Use for |
|------|---------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructure, no behaviour change |
| `chore` | Tooling, deps, config |
| `docs` | Documentation only |
| `wip` | Checkpoint commit mid-feature (squash before merge) |

### Rules
- Commit early and often within a feature branch — small, focused commits
- Never commit generated assets (WAV files, build output, `.next/`)
- Never commit `servers/venv/` or `servers/comfyui/` — both are gitignored
- Use `git add -p` to review what you're staging — avoid accidental commits
- Tag stable milestones: `git tag -a v0.x.0 -m "description"`
- Push to remote regularly as off-site backup, even if working solo
- Always verify no large binaries are staged before pushing to GitHub (100 MB limit)

---

## Progress Log

*Updated as work proceeds. Most recent first.*

### Session 21 — 2026-03-20
- **AI Tool Suite renaming** — Dropped "AI" from tool names. Full suite: Seed · Loom · Canopy · Graft (organic metaphor: plant → weave → watch → intervene)
- **Seed UI rewrite** — Replaced single-phase wizard (`SeedAIModal.tsx`) with conversation-first tab model (`SeedModal.tsx`):
  - **4 tabs**: Conversation | Premise | Cast | Architecture
  - **Conversation tab** — freeform chat with phase-scoped system prompts (spark → premise → cast → architecture); suggestion chips via `[CHIPS: ...]` format; genre picker always visible; locked state indicators
  - **Premise tab** — 3 structured premise cards ([who] wants [what] but [obstacle]), click to select and lock; regenerate button
  - **Cast tab** — 2–4 character cards with name, role, wound, want; fully editable inline; add/remove characters
  - **Architecture tab** — act spine (Early / Middle / Late columns) + jaw-drop moments (amber cards with position cycling); "Plant this seed" button
  - **Tab dot indicators** — grey (not yet populated), green (done), primary (active)
  - **Progressive disclosure** — structured tabs populate via dedicated generation calls, not extracted from chat
- **New API routes**:
  - **`/api/seed-chat/route.ts`** — streaming conversational endpoint; accepts `phase`, `history[]`, `locked` state, `message`; builds system prompt from phase instruction + locked state + persona rules
  - **`/api/seed-generate/route.ts`** — structured JSON endpoint; accepts `type` (premises/cast/architecture), `conversationSummary`, `lockedState`; returns typed JSON
- **New prompts** (`lib/ai-prompts.ts`):
  - `buildSeedChatSystem()` — dynamic system prompt from phase + locked state + persona; phase instructions scope Claude to one job per phase
  - `buildSeedGenerateSystem()` / `buildSeedGenerateUser()` — structured generation prompts for each tab type
  - `SEED_PERSONA` — warm, direct tone; one question or one chip set per response; no craft terminology
  - `SEED_PHASE_INSTRUCTIONS` — per-phase scoping rules (spark: feeling only; premise: stakes and obstacles; cast: wound/want gaps; architecture: emotional shape)
- **Renaming across codebase**: `SeedAIModal` → `SeedModal`, `showSeedAI` → `showSeed`, `onSeedAI` → `onSeed`, `Seed AI` → `Seed` in all UI labels, toolbar titles, store messages
- **Old `SeedAIModal.tsx` preserved** — kept for reference, no longer imported anywhere

### Session 20 — 2026-03-18
- **Test suite** — Full Vitest + Playwright setup, 76 tests passing (28 unit, 27 integration, 21 E2E):
  - **`apps/designer/vitest.config.ts`** + **`playwright.config.ts`** — test runner config; Playwright `baseURL` on port 4000 (separate from dev :3001 and prod :3000)
  - **`apps/designer/package.json`** — added `test:serve` (Next.js on :4000), `test:unit`, `test:integration`, `test:e2e`, `test:report` scripts; each writes its own JSON output file
  - **`apps/designer/tests/`** — unit (`blocks`, `char-seed`, `constants`), integration (`api-stories`, `api-ai-generate`, `api-audio`, `api-tts`), E2E (`dashboard`, `node-editor`, `canvas`, `play-mode`) test suites
  - **`apps/designer/scripts/generate-report.mjs`** — consolidates Vitest + Playwright JSON into `test-results/report.md`
  - **`apps/designer/TESTING.md`** — full test documentation (stack, layout, prerequisites, run commands, troubleshooting)
  - **`Run Tests.command`** + **`Test Server.command`** — double-click launchers at repo root; Run Tests auto-starts server on :4000 if not running, installs Playwright Chromium on first run, opens report on completion
  - **`.claude/commands/test.md`** — `/test` slash command for running the suite from within Claude Code
- **Security hardening** (from codebase review):
  - **`src/app/api/stories/[id]/audio/route.ts`** — `safeAudioFilename()` regex whitelist, `export const config` body size limit (50 MB), MIME validation, atomic temp-file-then-rename writes
  - **`src/app/api/stories/[id]/avatar/route.ts`** — `safeAvatarFilename()` regex, 10 MB limit, `image/png` MIME check, atomic writes
  - **`src/app/api/avatar/generate/route.ts`** — `ALLOWED_COMFYUI_HOST` regex SSRF guard; rejects any non-localhost/LAN ComfyUI URL
  - **`src/lib/comfyui-daemon.ts`** — subprocess `env` whitelisted to `PATH`, `HOME`, `PYTORCH_ENABLE_MPS_FALLBACK` only; removes wholesale `...process.env` inheritance
  - **`src/lib/qwen-daemon.ts`** — same env whitelist applied; spawn failure logs underlying cause
  - **`src/components/panels/NodeEditorPanel.tsx`** — SFX `linked.color` validated against `/^#[0-9a-f]{6}$/i` before CSS injection
  - **`src/proxy.ts`** *(renamed from `middleware.ts`)* — `export default function proxy` satisfies Next.js 16 proxy convention; removes startup deprecation warning
- **Code quality** (from codebase review):
  - **`src/lib/ai-prompts.ts`** *(new)* — all 14 system prompts + 12 builder functions extracted from generate route; exports `buildSystemPrompt`, `buildUserMessage`, `NON_STREAMING_MODES`
  - **`src/app/api/ai/generate/route.ts`** — shrunk from 841 lines to 110 lines (HTTP plumbing only); imports prompt builders from `lib/ai-prompts`
  - **`src/lib/constants.ts`** *(new)* — `DEBOUNCE_PERSIST`, `DEBOUNCE_SPANS`, `AI_MAX_TOKENS`, `AI_MAX_TOKENS_DEFAULT`; already consumed by store and route
  - **`packages/engine/src/types/index.ts`** — removed dead `kokoroVoice` and `kokoroSpeed` fields from `NWVCharacter` (0 usages since Session 4)
  - **`src/lib/tts-player.ts`** — `scheduleBuffer` `catch {}` → `catch (err) { console.error(...) }`
  - **`src/lib/audio-storage.ts`** — timestamp JSON parse `catch {}` → `console.warn` on corruption
  - **`src/lib/voice-commands.ts`** — command JSON parse `catch {}` → `console.warn` on malformed AI response
- **CLAUDE.md** — Future Ideas updated with full Canvas Direction + Narrative Quality + AI Tutor design session notes (canvas L→R spine, act columns, choice architecture tools, voice drift detector, tension curve visualiser, narrative health dashboard)

### Session 19 — 2026-03-18
- **ComfyUI MPS fix** — Avatar generation was timing out with `BrokenPipeError: [Errno 32] Broken pipe` in the KSampler node on Apple Silicon:
  - **`apps/designer/src/lib/comfyui-daemon.ts`** — Added `'--force-fp16'` to ComfyUI spawn args; prevents fp32 MPS kernel gap that caused the broken pipe during KSampler inference
  - **`apps/designer/src/lib/comfyui.ts`** — Added immediate error detection in the history poll loop: inspects `entry.status.status_str === 'error'` and surfaces the real `exception_message` + `node_type` instead of waiting the full 90s timeout before failing
- **Qwen TTS audio resumed** — `AudioContext` was getting suspended when `TTSPlayer` was created outside the user-gesture call stack (after a React state-update re-render chain):
  - **`apps/designer/src/lib/tts-player.ts`** — Added `if (ctx.state === 'suspended') { await ctx.resume(); }` at the top of `scheduleBuffer()` to self-heal a suspended context before decoding and scheduling audio
- **Word highlighting removed from node editor** — Per-word bolding during TTS preview was no longer needed; entire subsystem removed from `NodeEditorPanel.tsx`: `previewWordIdx` state, `previewWordTimersRef`, `previewScheduleFnRef`, `schedulePreviewWords()` function, CTC fetch block and `wavChunks` assembler, `activeWordIdx` prop from `BlockTextEditor`, word highlight `useEffect`
- **ElevenLabs voice design autoplay fixed** — `audio.play()` after async EL fetch was throwing `NotAllowedError` (browser gesture context expired):
  - **`apps/designer/src/components/pages/CharactersPage.tsx`** — Removed auto-play from `handleDesignVoice()`; added `elPreviewUrl` state to hold the blob URL; added `handlePlayPreview()` function invoked by an explicit "▶ Play Preview" button; blob URL cleaned up on unmount and on new design start
- **ElevenLabs "Use this voice" — voice name validation** — clicking "Use this voice" on a nameless character hit the API route's `voiceName` guard:
  - **`apps/designer/src/components/pages/CharactersPage.tsx`** — `handleCreateVoice()` now pre-checks `character.name?.trim()` and shows `"Give this character a name before saving the voice."` rather than propagating the API error
- **React hydration error suppressed** — Chrome extension injecting `__gchrome_remoteframetoken` onto `<html>` caused a hydration mismatch overlay:
  - **`apps/designer/src/app/layout.tsx`** — Added `suppressHydrationWarning` to `<html>` tag

### Session 18 — 2026-03-17
- **ComfyUI character avatar generation** — Full portrait generation pipeline for characters:
  - **`packages/engine/src/types/index.ts`** — Added `ArtStyle` union (`'realistic' | 'illustrated' | 'manga' | 'graphic_novel' | 'dark_fantasy' | 'ink_sketch' | 'pixel_art' | 'chibi'`); added `avatarPrompt?`, `avatarFile?`, `avatarSeed?`, `avatarLocked?` to `NWVCharacter`; added `artStyle?: ArtStyle` to `NWVStoryMetadata`
  - **`apps/designer/src/lib/settings.ts`** — Added `comfyuiUrl: string` (default `'http://localhost:8188'`), `comfyuiModel: string` (default `''`) and their setters to the persisted settings store
  - **`apps/designer/src/lib/comfyui.ts`** *(new)* — Exports `ART_STYLE_LABELS`, `checkComfyUIHealth(url)`, `buildPortraitWorkflow(prompt, seed, model)`, `generatePortrait(url, workflow)`, `buildFullPrompt(characterPrompt, artStyle)`; 8 art style SD prompt prefixes; ComfyUI API workflow (KSampler→VAEDecode→SaveImage); polls `/history/{id}` every 1.5s up to 90s; fetches PNG via `/view`
  - **`apps/designer/src/app/api/stories/[id]/avatar/route.ts`** *(new)* — GET/PUT/DELETE for `data/stories/{id}/_avatars/{filename}`; mirrors audio storage pattern; `content-type: image/png` with `no-cache` header
  - **`apps/designer/src/app/api/avatar/generate/route.ts`** *(new)* — POST accepts `{ prompt, artStyle, seed?, comfyuiUrl, comfyuiModel }`; checks ComfyUI health; returns PNG bytes + `x-used-seed` header
  - **`apps/designer/src/app/api/ai/generate/route.ts`** — Added `avatar-prompt` mode (non-streaming, 200 tokens); system prompt writes 15–25 word SD portrait prompts from character name/role/backstory/traits
  - **`apps/designer/src/components/pages/CharactersPage.tsx`** — Avatar section added to each expanded `CharacterCard`: circular 80px preview (shows stored or preview image, initials fallback), appearance description textarea with `✦ AI` button (calls `avatar-prompt`), `⚙ Generate` button (Preview→Accept/Discard flow), `↑ Upload` button (client-side resize to 512×512), seed display + 🔒 lock toggle; Art Style picker in page header (project-level); Narrator excluded from portrait UI
  - **`apps/designer/src/components/panels/SettingsPanel.tsx`** — Added "Image Generation" section: ComfyUI URL input, `Test Connection` button (checks `/system_stats` with 2s timeout, shows ✓/✗), optional model name field, setup note
  - **Generate flow**: Preview first — image shown as client-side object URL; `Accept` PUTs PNG to avatar storage API and updates character's `avatarFile`/`avatarSeed`; `Discard` revokes the object URL

### Session 18 — 2026-03-17
- **Lighting FX System** — Full pipeline from keyframe authoring → CSS rendering → preset library → AI generation → PlayMode spotlight:
  - **`packages/engine/src/types/index.ts`** — Added `saturation` and `contrast` to `VFXEffectType` union
  - **`apps/designer/src/lib/vfx-engine.ts`** (new) — Core VFX engine: `VFXState` interface, `defaultVFXState()`, `computeVFXState(keyframes, currentMs)` (per-effect-type interpolation, flicker noise via sin+random, shake random displacement, hex tint interpolation), `applyVFXToDOM(contentEl, tintEl, vignetteEl, state)` (mutates `style.filter`, `style.opacity`, `style.transform`, tint rgba overlay, radial-gradient vignette — no React re-renders)
  - **`apps/designer/src/lib/vfx-presets.ts`** (new) — 14 named presets across 4 categories: Ambient Light (Candlelight, Moonlight, Fluorescent Buzz), Dramatic (Blackout, Lightning Flash, Emergency Red), Player State (Concussion, Poisoned, Tension, Euphoria, Adrenaline), Environmental (Underwater, Memory, Deep Space)
  - **`apps/designer/src/components/AVFXPlayView.tsx`** — Added `storyRef` to avoid stale closure in RAF loop (critical fix — without it, keyframes added after RAF start were invisible); RAF loop reads `storyRef.current.nodes.find(...)` for always-fresh keyframes; VFX overlay divs (tint + vignette) placed outside the filtered `vfxContentRef` element so CSS filter doesn't affect the overlays
  - **`apps/designer/src/components/AVFXPanel.tsx`** — Added `saturation` and `contrast` to `VFX_EFFECTS` and `VFX_DEFAULTS`; "Presets ▾" dropdown with category-grouped grid; "✨ AI" button toggling a text input row; `applyPreset()` inserts keyframes via `addVFXKeyframe`; `handleAILighting()` POSTs `mode: 'lighting-suggest'` with scene context
  - **`apps/designer/src/app/api/ai/generate/route.ts`** — Added `lighting-suggest` mode: non-streaming JSON (600 tokens), `LIGHTING_SUGGEST_SYSTEM` prompt returns `{ keyframes: [...] }` max 6 keyframes, user message inlines genre/nodeTitle/nodeMood/nodeBody/description
  - **`apps/designer/src/components/PlayMode.tsx`** — Added VFX RAF loop: `nodeStartMsRef` captures `Date.now()` on each node transition, RAF computes `currentMs = Date.now() - nodeStartMsRef.current`, applies CSS effects via `applyVFXToDOM`; canvas beam (`mix-blend-mode: screen`) draws warm radial gradient spotlight centred on `[data-active-block="true"]` element when `vignette > 0.25`; `data-active-block` attribute added to active block div

### Session 17 — 2026-03-17
- **Survival genre** — full treatment: `GenreSlug` (`'survival'`), `GENRE_META` (earthy green theme, 6 voice test lines, extreme-conditions brief), added to genre dropdowns in InspireModal + QuickStartModal, QuickStart brief + placeholder, `INSPIRE_SETTINGS` + `INSPIRE_TROPES` in generate route
- **Children's genre** (Roald Dahl style) — full treatment: `GenreSlug` (`'children'`), `GENRE_META` (dark whimsy brief, 6 voice test lines, moss green / plum theme), added to genre dropdowns, QuickStart brief + placeholder, `INSPIRE_SETTINGS` + `INSPIRE_TROPES`
- **HTTPS / LAN cert** — Dev server now runs on HTTPS so voice mode works from iPad over LAN:
  - `apps/designer/setup-https.sh` — installs mkcert, detects LAN IP, generates cert, prints iPad trust steps
  - `apps/designer/package.json` dev script — `--experimental-https-key ./certs/key.pem --experimental-https-cert ./certs/cert.pem --hostname 0.0.0.0`
  - Cert covers `localhost 127.0.0.1 ::1 192.168.86.23`, expires June 2028
  - **One-time step:** run `mkcert -install` in a terminal (needs sudo password), then trust CA on iPad (see HTTPS / LAN Setup section)
- **Inspire Me variety overhaul** — prevents repetitive and same-feeling concepts:
  - Added `INSPIRE_SETTINGS` map per genre: 8–10 curated fresh settings per genre injected into the system prompt so Claude has specific anchors to draw from
  - Strengthened trope rejection wording to "NEVER use — any concept resembling these is rejected"
  - Extended `INSPIRE_TROPES` for post-apocalyptic (added cartographers, sole survivor awakening, vault emerges, scavenging a dead city), survival, children genres
  - Added variety rules to prompt: favours professional-context protagonists, culturally varied names, unusual relationships, small personal stakes over chosen-hero framing

### Session 16 — 2026-03-17
- **Cross-browser filesystem persistence** — Stories and audio files migrated from browser IndexedDB to server-side filesystem. Any browser on the network (Chrome, Safari, iPad) now sees the same stories.
  - **`app/api/stories/route.ts`** (new) — `GET` lists all `.json` from `data/stories/`, sorted by `updatedAt`; `POST` creates `{id}.json`
  - **`app/api/stories/[id]/route.ts`** (new) — `GET` reads, `PUT` upserts, `DELETE` removes story JSON + audio directory
  - **`app/api/stories/[id]/audio/route.ts`** (new) — `GET/PUT/DELETE ?file=filename` for audio blobs and `.words.json` timestamp files; stored at `data/stories/{id}/_audio/`
  - **`lib/audio-storage.ts`** — Added `saveAudioFileServer`, `readAudioFileServer`, `saveTimestampsServer`, `readTimestampsServer` as new primary functions; IDB functions retained as passive backup
  - **`lib/db.ts`** — Dexie v4: `stories` and `audioFiles` removed from active schema; `fileHandles` stays (FSA handles are browser-bound)
  - **`store/story.ts`** — `persist()` now debounced (300ms) `PUT /api/stories/{id}`; `persistNow()` for immediate writes; `loadStory()` fetches `GET /api/stories/{id}`
  - **`app/page.tsx`** — `useLiveQuery` replaced with fetch + `refreshStories`; one-time silent IDB→server migration on first load; `db.stories.*` → API calls
  - **`InspireModal`, `QuickStartModal`, `WorldBuilderModal`** — `db` import removed; `onStoriesChanged` prop threaded through for dashboard refresh
  - **`FinaliseModal`, `PlayMode`, `AVFXPanel`, `NodeEditorPanel`** — All IDB audio calls → server equivalents
  - **Data layout**: `apps/designer/data/stories/{id}.json` + `apps/designer/data/stories/{id}/_audio/{filename}` (gitignored)

### Session 15 — 2026-03-17
- **AV FX timeline scrubber, snap-to, and drag** — Precision timing tools for the AV FX panel:
  - **`store/story.ts`** — Added ephemeral `avfxPlayheadMs: number` + `setAvfxPlayheadMs`; `avfxBlockDurationsMs: number[]` + `setAvfxBlockDurationsMs` (shared between panel and play view)
  - **`AVFXPlayView.tsx`** — Emits `avfxPlayheadMs` every 80ms during block playback via `setInterval`; uses `blockBaseMsRef` + `blockStartTimeRef` for sub-frame accuracy; resets to 0 on stop; uses `avfxBlockDurationsMs` from store when available (real IDB durations) and falls back to `estimateBlockMs()` per block
  - **`AVFXPanel.tsx`** — `LABEL_W=88` constant for scrubber offset math; `snapMs()` snaps raw ms to nearest block boundary within 10px; `msToBlockWord()` reverse-maps a timeline ms position to `{blockId, wordIndex}` for SFX cross-block drag; async IDB timestamp loader `useEffect` reads `readTimestampsIDB` for each block with `ttsAudioFile`, builds real duration array, calls `setAvfxBlockDurationsMs`; `effectiveDurations/effectiveStarts/effectiveTotalMs` derived from store (real) or estimated — all geometry now uses these; red scrubber line+dot absolute-positioned over all tracks, draggable; VFX diamonds get `onMouseDown` drag + position updates during drag; SFX dots same; single global `useEffect` captures `mousemove`/`mouseup` for all three drag modes; `handleVFXTrackClick` snaps to block boundaries
  - **`app/story/[id]/page.tsx`** — Fixed Play / Exit AV FX button overlap: header conditionally renders "✕ Exit AV FX" when `avfxMode`, else Play; removed duplicate floating Exit button from inside the play pane

### Session 14 — 2026-03-17
- **Audio Visual FX mode** — Full implementation of the DAW-style split-view panel:
  - **`packages/engine/src/types/index.ts`** — Added `VFXEffectType` union (`blur | brightness | vignette | tint | flicker | shake | textOpacity`) and `NWVVFXKeyframe` interface (`id, timeMs, effect, value, transitionMs, prompt?`); added `vfxKeyframes?: NWVVFXKeyframe[]` to `NWVNode`
  - **`store/story.ts`** — Added `avfxMode: boolean`, `avfxNodeId: string | null` state; added `setAVFXMode`, `setAVFXNodeId`, `addVFXKeyframe`, `updateVFXKeyframe`, `removeVFXKeyframe` actions (stamp+persist pattern)
  - **`canvas/CanvasToolbar.tsx`** — Added `♪ Audio Visual FX` button (violet theme, `avfxMode` active state); removed hint text "Click on a button to add a node…"; wired `avfxMode` and `onToggleAVFX` props
  - **`canvas/StoryCanvas.tsx`** — Added `onToggleAVFX` prop threaded from `StoryCanvas` → `StoryFlowInner` → `CanvasToolbar`; reads `avfxMode` from store to pass to toolbar
  - **`components/AVFXPlayView.tsx`** (new) — Compact dark story reader for the top 55% pane: TTS playback via `TTSPlayer` (Qwen) or `HTMLAudioElement` (EL), phases `idle|playing|choosing|ended`, block text with active highlight, choice navigation updates `avfxNodeId` in store, stops when node changes
  - **`components/AVFXPanel.tsx`** (new) — DAW timeline for the bottom 45% pane: BFS-ordered node picker (left w-44 column), 5 track rows per node (Dialogue / SFX / Ambient / Music / Visual FX), `estimateBlockMs()` timeline geometry (~400ms/word), SFX dot markers, ambient/music clip bars with generate UI, VFX diamond keyframe editor (click to add at timeMs, click to edit effect/value/transitionMs), generation via existing `/api/audio/*` backends
  - **`app/story/[id]/page.tsx`** — When `avfxMode`, renders `AVFXPlayView` (top 55%) + `AVFXPanel` (bottom 45%) instead of canvas; Exit AV FX button top-right returns to canvas; canvas receives `onToggleAVFX={() => setAVFXMode(true)}`
  - **`panels/NodeEditorPanel.tsx`** — Removed: entire per-block SFX section (cue chips, + SFX button, inline gen panel, AI suggest checklist), Scene Audio section (ambient/music generate/preview/remove), Audio Suggestions Panel, `audioGenInlinePanel` variable, all associated state (`sfxBlockId`, `sfxPrompt/Duration/Generating/Error/Preview/PreviewPlaying`, `sfxSuggesting/Suggestions/BatchGenerating/BatchProgress/DiffusionPct`, `sceneAudioCollapsed`, `audioGenOpen/Suggest/Generating/Prompt/PromptSuggesting/Duration/Error/Preview`, `scenePlayerRef`, `sceneAudioPlaying`, `suggestLoading`, `suggestions`); removed unused imports (`aiContextToAudioSuggest`, `AudioGenType`, `nanoid`); removed `audioModel` from settings destructure; `BlockTextEditor` SFX word underlines (visual display of existing cues) retained
- **Toolbar hint text removed** — "Click a button to add a node · Drag a handle to empty space..." hint div removed from CanvasToolbar

### Session 12 — 2026-03-16
- **Voice dictation + assistant** — Full voice mode implementation:
  - **`store/voice.ts`** — new ephemeral Zustand store: `voiceModeActive`, `status: 'idle'|'listening'|'processing'|'speaking'`, `lastTranscript`, `lastInterim`, `lastCommandResult`, `lastErrorMessage`
  - **`lib/voice-recognition.ts`** — `VoiceRecognition` singleton (`webkitSpeechRecognition`, `continuous`, `interimResults`, auto-restart); `DictationTarget` interface (`insert/setInterim/clearInterim`); module-level `_activeDictationTarget` ref; `handleVoiceEvent()` router (interim → field, wake-word finals → command, other finals → dictation)
  - **`lib/voice-commands.ts`** — `fetchCommandIntent()` calls `/api/ai/generate` `command-interpret` mode; `executeCommand()` maps intents: `add-character`, `new-node`, `save`, `play`, `read-back`, `undo`, `new-block`, `open-settings`, `open-characters`
  - **`app/api/ai/generate/route.ts`** — `command-interpret` mode added (non-streaming, `max_tokens: 200`); `COMMAND_INTERPRET_SYSTEM` prompt lists all intents + JSON format rules; augmented with story context (`storyTitle`, `genre`, `selectedNodeTitle`, `characterNames[]`)
  - **`components/VoiceHUD.tsx`** — floating HUD (`absolute bottom-20 left-1/2 z-40`): orchestrates recognition lifecycle, `speak(text)` using browser `SpeechSynthesisUtterance` or Qwen `TTSPlayer` (configurable), pulse dot/spinner/EQ bars for status, wake word hint, stop button
  - **`canvas/CanvasToolbar.tsx`** — mic toggle button (only when `voiceEnabled`): outline-red idle, solid-red listening, spinner AI…
  - **`canvas/StoryCanvas.tsx`** — canvas glow ring (`box-shadow: 0 0 0 2px #ef4444, 0 0 32px 6px #ef444418`) when listening; `panelHidden` state with collapse tab on right edge (chevron button, always visible)
  - **`panels/NodeEditorPanel.tsx`** — `BlockTextEditor` registers as `DictationTarget` on focus/blur when `voiceModeActive`; `insert()` uses `document.execCommand('insertText')`; `setInterim()` appends `.voice-interim` span; `clearInterim()` removes it
  - **`panels/SettingsPanel.tsx`** — Voice & Dictation section: enable toggle, wake word input, response mode radio (qwen/browser), assistant instruct textarea, language select, HTTPS caveat amber box
  - **`lib/settings.ts`** — 5 new persisted fields: `voiceEnabled`, `wakeWord`, `voiceResponseMode`, `voiceLanguage`, `voiceAssistantInstruct`
  - **`app/globals.css`** — `.voice-interim { color: #8b5cf6; font-style: italic; opacity: 0.6; pointer-events: none; user-select: none; }`
- **Global Settings modal** — Gear icon on dashboard opens `GlobalSettingsModal` (API keys + full voice/dictation settings accessible without opening a story); `components/dashboard/GlobalSettingsModal.tsx`
- **Right panel collapse** — Tab button docked to right edge of canvas hides/shows the NodeEditorPanel and all other right panels for full-canvas immersion; state resets on page load
- **World Builder** — Added to Future Ideas in CLAUDE.md (optional depth layer after concept generation, AI-assisted wizard for locations/factions/lore/world rules/characters; open questions on output format, editability, context injection)

### Session 11 — 2026-03-15
- **Canvas-native play mode** — ▶ button on canvas nodes no longer opens the full PlayMode overlay. Instead triggers a lightweight `CanvasPlayer` HUD floating at the bottom-centre of the canvas:
  - **`CanvasPlayer.tsx`** — new component: plays node blocks via TTS (Qwen TTSPlayer or EL), shows EQ bar animation, shows choice buttons when done, advancing through the graph without leaving the canvas
  - **`store/story.ts`** — added `canvasPlayNodeId: string | null` + `setCanvasPlayNodeId` (separate from `playFromNodeId` which still drives the full PlayMode from the header Play button)
  - **All 5 node types** — ▶ button now calls `setCanvasPlayNodeId` instead of `setPlayFromNodeId`; EQ bars (3 animated bars in node's accent colour) appear in the node header when `isPlaying`
  - **`globals.css`** — added `@keyframes eqBar` (3px → 11px height, `alternate` for wave effect)
  - **`page.tsx`** — canvas wrapper made `relative`; removed `playFromNodeId` effect that opened PlayMode; added `<CanvasPlayer story={activeStory} />`
  - **Playback state**: playing node stays glowing (pulses) during TTS and while waiting for a choice; visited nodes/chosen edges stay frozen-highlighted; closing the HUD calls `clearPlayHistory()` — all glow resets
- **Romance genre** added — `GenreSlug`, `GENRE_META` (deep rose theme, 6 voice test lines: longing/restraint register), `InspireModal`, `QuickStartModal` (brief + placeholder prompt)
- **Audio timeline** added to Future Ideas (DAW-style panel, waveform display, scrub/preview, dialogue reference blocks)
- **PlayMode choice cycling removed** — choice buttons in full PlayMode are plain with hover-only styling (no cycling pulse)

### Session 10 — 2026-03-15
- **Word bolding fix: estimated-first + real-timestamp upgrade** (`PlayMode.tsx`):
  - **Root cause**: `scheduleFromStart` waited for `ctcPromise` (pending until CTC finishes, ~500ms after stream ends) before scheduling any timers. Words in the past at resolve time all fired at delay=0 in a flood — "starts from halfway" effect.
  - **Option A — Estimated timers fire immediately**: Step 1 of `scheduleFromStart` now schedules uniform estimated word timers the instant `startedAtMs` is known (no promise wait). Step 2 runs `Promise.all([tsToUse, sfxBufsPromise])` as before; when real timestamps arrive, only unfired estimated timers are cancelled and replaced with precisely-timed real ones. Already-fired words stay as estimated (close enough). Eliminates all cascade behaviour on every play.
  - **Streaming-path IDB cache**: `simpleHash(block.text)` (djb2) added as helper. `streamTsKey = stream_${block.id}_${simpleHash(block.text)}` — text-hash-keyed so stale timestamps from edited blocks are auto-ignored. After CTC resolves, timestamps saved to IDB under this key (fire-and-forget). `tsPromise` now checks `ttsAudioFile` first, then falls back to `streamTsKey` — so second+ plays get real timestamps instantly at `startedAtMs`, upgrading all estimated timers before any fire.
  - **SFX scheduling** unchanged in behaviour — stays in `Promise.all` callback, uses real timestamps when available else estimated fallback.
- **C3 look-ahead pre-generation** added to Future Ideas.

### Session 9 — 2026-03-15
- **CTC forced aligner for word timestamps** — replaced faster-whisper (transcription) with `ctc-forced-aligner` (forced alignment, knows text upfront, handles pauses/breaths accurately):
  - **`ctc-forced-aligner` installed** in `servers/venv` — ONNX-based (~150MB model downloads to `~/ctc_forced_aligner/model.onnx` on first use), no torch needed for inference
  - **`qwen_server.py`** — `/timestamps` endpoint changed from raw WAV bytes to JSON `{audio_b64, text, engine}`. New `_ctc_timestamps(wav_bytes, text)` function: decodes base64, resamples to 16 kHz via `_wav_to_float32_16k()`, runs CTC alignment pipeline (`generate_emissions → preprocess_text → get_alignments → get_spans → postprocess_results`), returns `[{word, start_ms, end_ms}]`. Old faster-whisper path preserved as `_whisper_timestamps()` selectable via `engine='whisper'`. Module-level `_ts_lock` guards lazy model init.
  - **`TimestampEngine = 'ctc' | 'whisper'`** added to `lib/settings.ts` (default `'ctc'`, persisted to localStorage)
  - **SettingsPanel** — alignment engine radio buttons (amber-themed) appear under word timestamps checkbox when enabled
  - **`/api/qwen/timestamps/route.ts`** — accepts JSON `{audioB64, text, engine}`, forwards to Python as `{audio_b64, text, engine}`
  - **`FinaliseModal.tsx`** + **full-synthesis path in `PlayMode.tsx`** — encode WAV as base64, pass `text` and `timestampEngine` in the timestamps request
- **Streaming path CTC alignment** — streaming player now collects WAV chunks for CTC while audio plays:
  - **`tts-player.ts`** — added `onAllChunks?: (chunks: ArrayBuffer[]) => void` callback — fires after full stream received, before `waitForEnd()`, so CTC runs concurrently with audio playback
  - **`assembleWavChunks(chunks)`** helper in `PlayMode.tsx` — strips 44-byte WAV headers, concatenates PCM, writes new WAV header
  - **Streaming CTC path**: `player.onAllChunks` assembles full WAV → fires CTC alignment → resolves a pending `ctcPromise` → `scheduleFromStart(startedAtMs, ctcPromise)` uses real CTC timestamps. Past words (during CTC compute window ~200–500ms) clamp to 0 and catch up; future words schedule precisely around pauses and breaths.

### Session 8 — 2026-03-15
- **Word bolding fixed + audio delay eliminated** (`PlayMode.tsx`):
  - **Root cause**: `scheduleFromStart` never received real timestamps for pre-session-5 blocks (no IDB timestamps stored) and live Qwen path was blocking on `await fetch('/api/qwen/timestamps')` before `audio.play()`, adding ~0.5–2s silence.
  - **Fix 1 — No delay**: Qwen live path now starts the timestamps fetch as a **non-awaited Promise** before playing audio. `scheduleFromStart` receives the pending promise; its `delay = startedAtMs + ts.start_ms - Date.now()` formula correctly handles late-resolving timestamps (past words clamp to 0, future words schedule normally). Audio starts immediately after WAV synthesis.
  - **Fix 2 — Estimated fallback**: When `timestamps` resolves to null/empty and `wordTimestamps` is ON, `scheduleFromStart` now generates uniform estimated timestamps from word count × `estimatedMs`. Ensures word bolding works on all pre-session-5 IDB-cached blocks, any Qwen/EL timestamp API failure, and streaming-path blocks. Verified visually — yellow word highlight steps through text on a pre-session-5 horror story.
  - **SFX bug fix**: `effectiveTs` (not `timestamps`) now used for SFX `wordIndex` lookup, so SFX timing also benefits from the estimated fallback.
- **SFX batch progress indicator** (`NodeEditorPanel.tsx`):
  - Single Generate button: spinner SVG appears during generation
  - Batch "Generate N Selected" button: sliding progress bar + `Generating 1/3…` counter as each item generates

### Session 5 — 2026-03-14
- **Word-level SFX timing** — Replaced linear estimation with real per-word timestamps from TTS audio:
  - **`WordTimestamp` type** added to `packages/engine/src/types/index.ts` — `{word, start_ms, end_ms}`
  - **`faster-whisper` installed** in `servers/venv` (`tiny.en`, CPU int8, ~40 MB) for Qwen forced-alignment
  - **`/timestamps` endpoint in `qwen_server.py`** — accepts raw WAV bytes via POST, lazy-loads `WhisperModel('tiny.en')`, runs `transcribe(word_timestamps=True)`, returns `[{word, start_ms, end_ms}, ...]` as JSON. Model cached on `Handler._whisper` class attr.
  - **`/api/qwen/timestamps/route.ts`** — new Next.js proxy route that forwards WAV bytes to the Qwen server's `/timestamps` endpoint
  - **`/api/tts/elevenlabs/route.ts`** — added `withTimestamps?: boolean` param; when true, calls `/v1/text-to-speech/{voiceId}/with-timestamps` (returns JSON with `audio_base64` + character `alignment`), converts character-level alignment to word timestamps via `charAlignmentToWords()`, returns `{audioBase64, timestamps}` JSON. Standard path unchanged (returns `audio/mpeg` binary).
  - **`lib/audio-storage.ts`** — added `makeTimestampsFilename()` (appends `.words.json`), `saveTimestampsIDB()`, `readTimestampsIDB()` — stores/reads timestamp arrays as JSON blobs in the existing `audioFiles` IDB table
  - **`FinaliseModal.tsx`**:
    - EL path: passes `withTimestamps: true`, decodes `audioBase64` → `ArrayBuffer`, saves timestamps via `saveTimestampsIDB` (best-effort fire-and-forget)
    - Qwen path: fires `/api/qwen/timestamps` with the WAV buffer after synthesis (best-effort, non-blocking), saves timestamps to IDB
  - **`PlayMode.tsx`** — SFX scheduling now loads `readTimestampsIDB(story.id, block.ttsAudioFile)` for each block; uses `timestamps[cue.wordIndex].start_ms` for precise scheduling when available; falls back to linear estimation (`(wordIndex / totalWords) * estimatedMs`) when timestamps are missing (blocks not yet re-finalised)

### Session 4 — 2026-03-14
- **ElevenLabs TTS — full integration**:
  - **Finalise for Release** (`FinaliseModal`) now supports both Q and EL providers. Split-button in story header defaults to Qwen; dropdown selects ElevenLabs. Batch execution routes through `/api/qwen/speak` or `/api/tts/elevenlabs` depending on provider. Qwen blocks saved as `.wav`, EL blocks as `.mp3`.
  - **Live editor playback** (`NodeEditorPanel`) routes ▶ buttons through EL (`/api/tts/elevenlabs` → `new Audio()`) when character `ttsProvider === 'elevenlabs'` and voice ID is set; otherwise falls back to Q streaming.
  - **Per-block delivery mapping** — emotion/tone/voiceTexture dropdowns map to EL `stability/similarity/style` via `mapQwenToEL()` (`lib/el-delivery-map.ts`) when character is on EL provider.
  - **EL Voice Design API migration** — updated `/api/elevenlabs/voice-design` and `/api/elevenlabs/voice-create` to new EL endpoints (`/v1/text-to-voice/design`, `/v1/text-to-voice`); response parsing updated for `previews[0].audio_base_64` JSON format.
  - **Character panel EL section** — always-editable accent/gender/description fields; "Design Voice" button always visible; AI button generates EL voice description via Claude without touching Qwen instruct; switching provider to EL pre-populates EL description from Qwen instruct if empty; Lock/Unlock button available for EL voices.
  - **Removed Kokoro/Web Speech** — `TTSProvider` narrowed to `'qwen' | 'elevenlabs'`; removed from SettingsPanel.
  - **Removed duplicate "Suggest SFX" button** from Content section header — functionality already available via the AI ✨ button in the per-block SFX panel.
- **`batch-tts.ts`** — added `BatchProvider` type; `checkPrerequisites` and `buildBatchItems` accept provider param; Q provider skips API key / voice ID checks.

### Session 4 — 2026-03-14
- **Dice combat system** — Full implementation of the Interactive node mechanic:
  - **Types**: `InteractionType = 'dice-combat'`; `interactionType?`, `combatEnemy?` on `NWVNode`; `combatOutcome?: 'victory' | 'defeat' | 'escape'` on `NWVChoice`
  - **Store**: `addEnemy`, `updateEnemy`, `deleteEnemy`; `selectedPanel` extended to `'enemies'`; `createNode('combat')` auto-creates Victory + Defeat outcome choices; `updateNode` auto-adds them on type switch; `addChoice` accepts optional `defaults`
  - **EnemyPanel** (`components/panels/EnemyPanel.tsx`) — new panel: enemy cards with name, HP, damage range, ASCII art, taunts. Opened via Enemies button in toolbar.
  - **Interactive node panel redesign** — combat config moved entirely into NodeEditorPanel: `⚔ Dice Combat` pill in header; COMBAT section with enemy picker; ChoiceCard shows coloured outcome badges (green=victory, red=defeat, slate=escape); Victory/Defeat non-deletable; `+ Enable Escape` button adds optional escape route
  - **CombatNode** stripped clean — just badge, title, blocks preview (no canvas config UI)
  - **PlayMode** — full combat phase: dice animation (⚀–⚅ cycling), HP bars, ASCII art, combat log (last 5 rounds); routing via `choices.find(c => c.combatOutcome === ...)?.next`; escape button hidden when no escape choice
- **Canvas controls reorganisation** — Auto Arrange moved from toolbar to canvas ControlButton (⬡); Lock toggle added as last ControlButton (🔒/🔓); `showInteractive={false}` hides built-in RF lock button; toolbar no longer takes props
- **EL TTS shared cache** (`lib/el-audio-cache.ts`) — module-level `EL_AUDIO_CACHE` Map + `makeElCacheKey()` shared between PlayMode and NodeEditorPanel; prevents repeat API calls within a browser session
- **Bug: start node re-trigger** — `useEffect` for start node detection changed from `[story]` to `[]` (mount-only); reads from `storyRef.current`
- **Bug: Backspace deletes node while editing prose** — canvas keyboard handler now checks `target.isContentEditable` in addition to `INPUT`/`TEXTAREA`/`SELECT`

### Session 3 — 2026-03-14
- **Audio playback fix** — WAV bytes were discarded on Accept without persisting to IndexedDB; PlayMode tried to fetch from non-existent `/api/audio/file` endpoint. Fixed by adding `saveAudioFileIDB()` calls in scene audio and SFX Accept handlers, and reading from IndexedDB in PlayMode for ambient/music/SFX.
- **SFX Interface Redesign — Color-coded drag-to-link** — Complete overhaul of the per-block SFX system:
  - **Type changes**: Added `wordIndex?: number` and `color?: string` to `NWVSFXCue` in engine types
  - **Color-coded draggable chips**: Each SFX cue renders as a colored pill with dot, truncated prompt, and `@word` anchor label. Chips are `draggable="true"` — drag to a word to link. Hover reveals play (▶) and delete (✕) controls.
  - **Play button on preview**: Added ▶/■ toggle to hear generated SFX before accepting
  - **Block-level SFX play button**: Green "SFX" button in block header controls (appears when block has cues), plays all cues with estimated word-position timing
  - **Removed manual offset input**: Replaced by drag-to-link word positioning
  - **Color palette**: 8-color cycling (`SFX_COLORS`), auto-assigns next unused color
  - **PlayMode offset computation**: `wordIndex`-based timing estimation replaces raw `offsetMs` (legacy fallback preserved)
- **ContentEditable inline word linking** — Replaced `<textarea>` + separate word row with single `<div contentEditable>` component (`BlockTextEditor`):
  - Ref-based uncontrolled pattern avoids React cursor jumping
  - Debounced word-span injection (400ms): after typing pause, plain text replaced with `<span data-wi="N">` elements; SFX-linked words show colored `border-bottom` underlines inline
  - Caret position save/restore via `TreeWalker` + `Selection` API
  - Drop targets on word spans for drag-to-link SFX cues
  - `onPaste` intercepts rich HTML and inserts plain text only
  - AI streaming text updates div content directly via ref
  - Eliminates duplicated text — prose appears once with visual SFX links embedded
- **Multi-provider SFX generation** — Added ElevenLabs as cloud SFX option alongside local:
  - **Settings**: `SFXProvider` type (`'local' | 'elevenlabs'`) added to `useSettingsStore`, persisted to localStorage
  - **Settings UI**: SFX Provider picker in SettingsPanel with emerald-themed radio buttons
  - **Route branching**: `/api/audio/sfx/route.ts` inspects `provider` field — routes to ElevenLabs API (`/v1/sound-generation`) or local Stable Audio server
  - **Client**: `NodeEditorPanel` passes `sfxProvider` and `elevenLabsKey` in SFX generation fetch calls
- **Stable Audio Open model swap** — Replaced AudioLDM2 with Stable Audio Open in `servers/audiocraft_server.py`:
  - `StableAudioPipeline` from `diffusers` with model `stabilityai/stable-audio-open-1.0`
  - Output: 44.1kHz stereo (was 16kHz mono) — stereo→mono averaged, trimmed to target duration
  - Inference steps: SFX 30, ambient/music 50 (was 50/100)
  - Removed GPT2Model monkey-patch (not needed for Stable Audio)
  - MPS/CUDA/CPU auto-detection preserved
- **AI SFX suggest per-block** — New `sfx-suggest` mode in `/api/ai/generate`:
  - System prompt asks Claude to suggest 1–4 word-anchored SFX for a single block
  - Returns JSON array with `prompt`, `wordIndex`, `anchorWord`, `description`
  - Green "AI ✨" button in expanded SFX panel triggers suggestion
  - Checklist UI with checkboxes, prompt text, `@anchorWord`, description
  - "Generate Selected" button batch-generates checked suggestions, saves to IndexedDB, adds as color-coded cues with pre-linked wordIndex

### Session 2 — 2026-03-12
- **Comedy genre** — Added `comedy` to `GenreSlug`, `GENRE_META` (with brief, 6 voice test lines, warm amber theme), and dashboard genre dropdown.
- **AI Sound FX system (full pipeline)** — 11-phase implementation:
  - **Types**: `NWVSFXCue` (id, filename, prompt, offsetMs, duration) on NWVBlock.sfxCues[], `ambientPrompt`/`musicPrompt` on NWVNode, `AudioGenType`/`AudioGenRequest`/`AudioGenResult` shared types
  - **Python server**: `servers/audiocraft_server.py` — port 7863, `/sfx`, `/ambient`, `/music`, `/health`. Single AudioLDM2 model for all types. MPS GPU accelerated. Includes GPT2Model monkey-patch for diffusers/transformers compat.
  - **Daemon**: `lib/audiocraft-daemon.ts` — singleton manager (mirrors qwen-daemon), 180s timeout
  - **API routes**: `/api/audio/sfx`, `/api/audio/ambient`, `/api/audio/music` — proxy to Python server
  - **SFX Player**: `lib/sfx-player.ts` — `playOnce()`, `playLooped()`, `playFromUrl()` via Web Audio API
  - **Store**: `addBlockSfxCue`, `removeBlockSfxCue`, `updateBlockSfxCue`, `updateNodeAudio`, `removeAudioFile` mutations in story.ts
  - **Storage**: `lib/audio-storage.ts` — File System Access API (`_audio/` sibling folder) + IndexedDB fallback (Dexie v3)
  - **AI suggest**: `audio-suggest` mode in `/api/ai/generate` — Claude analyzes scene → suggests SFX/ambient/music prompts as JSON
  - **UI in NodeEditorPanel**: Scene Audio section at bottom (ambient + music generate/remove with AI auto-suggested prompts), per-block `+ SFX` buttons that expand inline with mini visual timeline showing cue bars with offset timing, inline generation panel (prompt/duration/generate/preview/accept), "Suggest SFX" button with AI checklist
  - **PlayMode**: SFXPlayer instances for ambient/music/sfx alongside TTSPlayer, SFX cues scheduled at precise `offsetMs` offsets during block playback
  - **Export**: `ensureAudioDir()` helper, `_audio/` directory management
- **Removed stat system** — Removed `StatType` type, `str/wit/charm` from NWVEffects/NWVRequirement/NWVPlayerState, stat type dropdown from ChoiceCard. Stats are no longer part of the choice model.
- **Multi-SFX cue system** — Replaced single `sfx`/`sfxPrompt` on blocks with `sfxCues: NWVSFXCue[]` array. Each cue has `offsetMs` for precise timing during playback. Mini visual timeline bar shows positioned cues in the block editor.
- **Path consolidation** — Moved Python scripts and venv from `~/Documents/cyod/` to `~/Documents/NodeWeaver/servers/`. Updated `qwen-daemon.ts` and `audiocraft-daemon.ts` paths.

### Session 1 — 2026-03-12
- Created CLAUDE.md
- **Fix: character default delivery not shown in block TTS dropdowns** — The per-block emotion/tone/voiceTexture dropdowns in `NodeEditorPanel` showed generic placeholders even when the character had defaults set in the Character panel. TTS playback already fell back to character defaults correctly (`streamQwenLine` line 608-610), but the UI didn't reflect this. Fixed by showing inherited defaults as violet-tinted placeholder text (e.g. "Happy (default)").
- **UI: SVG icons for character panel** — Replaced emoji icons with crisp SVGs: microphone for narrator, person silhouette for characters, open/closed padlock for voice lock state. All in `CharacterPanel.tsx`.
- **Test stories** — Created 3 `.nwv` files in `test-stories/`: Signal from Cygnus (sci-fi, 9 nodes, 5 chars), The Bellford House (horror, 11 nodes, 3 chars), The Linden Case (noir, 12 nodes, 5 chars). All voices locked.

---

## Future Ideas

*Captured during conversations. Not commitments.*

---

### Node Display & Canvas Cleanup

Two connected improvements: what each node shows on the canvas, and how the canvas itself is organised and rendered. Both serve the same goal — the canvas is a navigation layer, not a reading layer.

**1. Node Summary (AI-Drafted)**

Each node displays a short AI-drafted summary at the top of the node editor instead of prose content or dialogue. This summary is also what renders on the canvas card.

*Two summary fields:*

| Field | Length | Used for |
|-------|--------|----------|
| `summary` | 6–10 words | Node card at mid/close zoom |
| `label` | 2–3 words | Node card at far zoom |

Both describe dramatic function, not prose content.
- Good: `"Player discovers they were never alone"`
- Bad: `"Elsie says she couldn't see anything from there"`

*Generation behaviour:*
- On node creation: empty, shows placeholder `"No summary yet — start writing or generate one"`
- Generate Summary button fires a Claude API call on demand
- Auto-regenerates silently on significant content change (debounced)
- Manual edit locks auto-regen — indicated by a lock icon (🔒)
- Lock can be toggled — unlocking re-enables auto-regen
- Regenerate button always available regardless of lock state

*API call:*
```js
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    system: `You are a narrative editor working on an interactive fiction project. Write concise directorial node summaries describing dramatic function — not prose content or dialogue. Respond with valid JSON only. No preamble or markdown.`,
    messages: [{
      role: "user",
      content: `Generate a summary for this story node.

Node type: ${nodeType}
Node content: ${nodeContent}
Recent story context (preceding spine nodes): ${recentContext}

Respond with exactly:
{
  "summary": "6-10 word dramatic summary",
  "label": "2-3 word canvas label"
}`
    }]
  })
});

const data = await response.json();
const text = data.content.find(b => b.type === "text")?.text ?? "";
const { summary, label } = JSON.parse(text);
```

*Context packet (pass into every call):*
- `nodeType` — STORY / TWIST / CHAT / END etc.
- `nodeContent` — full prose and dialogue of the node
- `recentContext` — summaries of the 3 preceding spine nodes (not full prose)

*Node editor UI:*
```
┌─────────────────────────────────────────────────┐
│ STORY  draft                          [ × close ]│
├─────────────────────────────────────────────────┤
│ SUMMARY                                    ✎ 🔒 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Player discovers they were never alone      │ │
│ └─────────────────────────────────────────────┘ │
│                          [ ↺ Regenerate summary ]│
├─────────────────────────────────────────────────┤
│ Node content / prose editor below...            │
```

*Error handling:*
- API failure: keep existing summary, show subtle retry option
- JSON parse failure: extract first sentence of response as fallback
- Never clear an existing summary on a failed regeneration

*Data model additions:*
```ts
interface NodeData {
  summary: string;
  label: string;
  summaryLocked: boolean;
  summaryGeneratedAt: Date;
}
```

---

**2. Canvas Visual Cleanup**

*Layout direction: Top-to-Bottom → Left-to-Right with spine*
- Spine runs horizontally left to right through act columns
- Branches diverge above or below the spine, always within the same act column
- Branches reconnect before act boundaries — nothing spans columns unresolved
- All node exits from right edge only, all entries from left edge only
- No line crossings within an act column

```
| ACT 1           | ACT 2               | ACT 3         |
|                 |    ○ branch above   |               |
| ○ ────────────► | ○ ──────────────── ►| ○ ──────────► |
|                 |    ○ branch below   |               |
```

*Node dimensions — standardised:*
```
Width:         240px fixed (all node types)
Height:        72px collapsed (fixed default)
Height:        auto on expand (author-triggered only)
Border radius: 8px
```
Every node is the same size. Always. Content truncates. The canvas is never a reading surface.

*Node type — left border stripe replaces badges:*

| Node Type | Colour | Hex |
|-----------|--------|-----|
| START | Green | `#4ADE80` |
| STORY | Teal | `#2DD4BF` |
| TWIST | Purple | `#A78BFA` |
| CHAT | Blue | `#60A5FA` |
| END | Orange | `#FB923C` |

- Draft state: border stripe at 60% opacity, background slightly desaturated
- Complete state: full colour stripe, clean background
- No separate status badge needed

*Collapsed node shows only:*
- Summary (or label at far zoom)
- Emotional beat tag (small, bottom-left)
- Type communicated via border stripe

*Collapsed node does NOT show:*
- Prose content, dialogue lines, speaker labels, character names

*Connection lines:*

Routing:
- Branches above spine curve gently upward, never crossing downward branches
- Auto-layout enforces no crossings within act columns

Line weight:
- Spine connections: 3px solid
- Branch connections: 1.5px solid
- Converging (returning to spine): 1.5px dashed

Choice label pills:
- Sit centred on the connection line — not floating near nodes
- Pill style: dark background, light text, font-size 11px
- Truncate at 32 characters, full label on hover

*Zoom-dependent rendering:*

| Zoom | Node shows | Lines |
|------|-----------|-------|
| Close (>80%) | Summary + beat tag + type icon | Full weight + choice pills |
| Mid (40–80%) | Summary only | Full weight + choice pills |
| Far (15–40%) | Label (2–3 words) only | Simplified, no pills |
| Very far (<15%) | Type colour block only | Thin lines, no labels |

*Hover & selection behaviour:*
- Node hover: non-connected nodes and lines dim to 20% opacity, connected path stays full brightness
- Node select: focus ring in type colour, connected path full brightness, all else at 20%
- Line hover: highlights to source node type colour, choice pill expands to full label

*Emotional beat tag:*

Small coloured dot + lowercase label, bottom-left of collapsed node.

| Beat | Label | Dot colour |
|------|-------|-----------|
| Setup | `setup` | Grey |
| Escalation | `escalation` | Yellow |
| Peak | `peak` | Red |
| Reversal | `reversal` | Purple |
| Release | `release` | Green |
| Cliffhanger | `cliffhanger` | Orange |
| Breathing room | `breath` | Blue |

Author-assigned or AI-suggested. Feeds the tension curve visualiser.

*Act columns:*
- Very subtle background tint per column
- Column header pinned at top of viewport while scrolling: `"ACT 1 — SETUP"` etc.
- Single 1px vertical rule at column boundary, opacity: 0.15

*Canvas background:*
- Subtle dot grid, opacity: 0.3
- Grid spacing matches node rhythm
- Dark mode default

*Data model additions:*
```ts
interface NodeVisual {
  beatTag: 'setup' | 'escalation' | 'peak' | 'reversal' | 'release' | 'cliffhanger' | 'breath';
  isExpanded: boolean;
  actColumn: number;
  spineNode: boolean;
}

interface EdgeVisual {
  routeAboveSpine: boolean;
  choiceLabel: string;
  choiceLabelFull: string;
  isSpineConnection: boolean;
}
```

*Implementation Priority:*
1. Fix node dimensions — uniform width/height, biggest immediate scannability win, minimal effort
2. Replace type badges with left border stripe — cleaner visual hierarchy
3. Left-to-right layout with act columns — structural foundation
4. Move choice labels onto lines as pills — eliminates floating label noise
5. AI summary generation — replaces prose preview with dramatic function label
6. Zoom-dependent rendering tiers — canvas readable at any distance
7. Hover dimming behaviour — path tracing without moving anything
8. Emotional beat tag system — feeds tension curve visualiser
9. Act column tinting and pinned headers — spatial anchoring

---

### Canvas Direction & Narrative Quality (Design Session)

**1. Canvas Direction Change: Top-to-Bottom → Left-to-Right with Central Spine**

Reorient the node canvas from vertical flow to horizontal flow with a central spine running left to right.

*Spine model:*
- A single clearly marked critical path runs left to right — the backbone of the story
- All branches diverge above or below the spine and must converge back within the same act column
- Branches that never rejoin the spine are flagged automatically
- The spine is architecturally distinct (distinct visual weight, colour, or layer)

*Act columns:*
- Replace current vertical lanes with vertical act columns — e.g. `ACT 1 | ACT 2 | ACT 3 | ACT 4`
- The spine passes through each act column left to right
- Branches live inside act columns, never spanning act boundaries unresolved
- Act boundaries act as gates — nothing crosses unresolved
- Existing lane logic is ~70% of the way there; this is primarily a reframe

*Zoom-dependent rendering:*
- Macro view: collapsed act clusters, spine visible, branch density readable at a glance
- Micro view: individual nodes with full detail
- Zoom level determines which representation renders

**2. Multiple Simultaneous Views (Same Underlying Data)**

| View | Purpose | Author Role |
|------|---------|------------|
| Outline view | Story development, beat planning | Writer |
| Node/graph view | Branch logic, state flags, connections | Designer |
| Timeline/tension view | Pacing, emotional curve | Director |
| Playtest view | Linear experience simulation | Player |

The existing Focus Mode is the foundation of the Outline/Writer view — extend, not replace.

**3. Narrative Quality Tooling**

*3.1 Choice Architecture Tools:*
- **Consequence graph analyser** — overlay highlighting "dead" choices: branches that reconverge too quickly or never get referenced downstream
- **Choice weight scoring panel** — tag each choice with stakes (low/medium/high), moral dimension (yes/no), payoff distance (nodes until this matters); warn if consecutive choices score low across all three
- **Branch coverage heatmap** — playtest simulation running N random paths, visualising nodes hit rarely or never
- **30-node rule enforcement** — warn when a player can travel more than 30 nodes without hitting a spine beat

*3.2 Character Voice Consistency:*
- **Per-character voice bible editor** — structured sidebar per character: vocabulary used/never used, sentence length, emotional register, speech tics; feeds directly into AI generation prompts
- **Voice drift detector** — post-generation Claude API call scoring each line against the character's voice bible, flagging outliers with a confidence score (e.g. "This line sounds 60% like Kira, 40% like Narrator — review?")
- **Dialogue diff view** — side-by-side old vs. new on regeneration, with character voice deltas highlighted

*3.3 Pacing & Tension Tools:*
- **Tension curve visualiser** — tag each node with an emotional beat (calm / rising tension / peak / reversal / release / cliffhanger); render as a waveform across a linear playthrough; compare against a user-defined target curve per episode
- **Word/beat budget tracker** — per scene, track estimated reading/listening time; warn when a sequence exceeds threshold without a player decision or audio beat change
- **Act structure overlay** — canvas layer marking cold open, act breaks, and climax nodes
- **"Yes, and / Yes, but / No, but" tagger** — tag each node exit with its improv/TV pattern; surface flat "yes, and" chains that indicate low-tension sequences
- **ABCD beat checker** — for each scene, validate presence of: A (main tension driver), B (character/emotional thread), C (something changes), D (what pulls the player forward)

*3.4 AI Generation Quality:*
- **Context packet builder** — before any AI generation call, automatically assemble: last N significant player choices, active character relationship states, world state flags, relevant voice bibles, planned jaw-dropping beats. Highest-leverage single feature for generation quality.
- **Causality prompt enforcer** — generation mode that requires the AI to state why this scene follows from the previous one (because/therefore logic) before writing; strips reasoning from output but uses it for coherence validation
- **Regeneration with constraints** — structured partial regen modes: "keep the plot, rewrite the voice" / "keep the voice, raise the stakes" / "make this choice feel harder"
- **Consistency checker node** — special non-rendering node type that fires a Claude API call at playtest time, feeding surrounding context and asking "does this scene contradict anything established earlier?"

*3.5 Blind Mode / Audio QA:*
- **Audio-only preview mode** — strip all visual context and play a scene with TTS only, inside NodeWeaver; mandatory QA step before shipping
- **Ambiguity linter** — flag lines containing visual references ("the red door", "you can see", "on the left") that are meaningless in blind mode

**4. Graft (Narrative Tutor)**

Philosophy: the tutor operates as a dramaturg, not a generator. It asks questions, surfaces structural weaknesses, and offers options — it does not decide. Keeps the author's voice intact while providing professional-level structural guidance.

*Features:*
- **"What if" suggester** — at any node, offer 4–5 dramatically distinct one-sentence direction options, each tagged by dramatic function: Betrayal / Revelation / Escalation / Breathing room / Complication
- **Socratic story coach** — asks structural questions rather than suggesting content (e.g. "You haven't established why the player should care about this character yet — what do you want them to feel here?")
- **"Earn it" checker** — for each planned jaw-dropping moment, review preceding nodes and assess whether setup earns the payoff; flags underearned beats with specific references to what's missing
- **Dramatic function gap detector** — analyses the current act and identifies what's structurally absent (e.g. "You have strong setup and a peak but no reversal before the act break")
- **"Stranger test" prompt** — for each jaw-dropping moment, evaluate: would a stranger knowing nothing else feel something here?

*Integration point:* Focus Mode text editor — a sidebar aware of graph position, surrounding nodes, and context packet. Not autocomplete; a well-read colleague.

**5. Narrative Health Dashboard**

A single per-episode quality scorecard aggregating:
- Choice depth score
- Tension curve vs. target
- Voice consistency warnings
- Blind mode coverage %
- Consequence graph dead-branch count
- ABCD beat completion rate

Embeds editorial quality into the tool so future authors get guardrails by default.

**Implementation Priority Suggestion:**
1. Canvas reorientation (L→R spine + act columns) — structural foundation
2. Focus Mode Graft panel — highest authoring value, leverages existing mode
3. Emotional beat tagging + tension curve visualiser — makes the canvas readable
4. Context packet builder — unlocks quality AI generation and tutor features
5. Voice bible editor + drift detector — protects character consistency at scale
6. Narrative health dashboard — synthesis layer, built last when sub-components exist

---

- ~~AI Sound FX / Audio Generation~~ — **Implemented in Session 2**
- ~~Audio WAV→MP3 compression~~ — **Implemented in Session 11**
- **ZIP export bundling** — Bundle `.nwv` + `_audio/` folder into a single ZIP for browsers without File System Access API.
- ~~Inspire Me~~ — **Implemented** (dashboard AI story concept generator with Quick Start / Write It Myself exits)

- **Inspire Me — Movie Trailer Narrator** — After the AI generates a story concept on the Inspire Me screen, a narrator automatically reads it aloud in a low, cinematic movie trailer voice before the user makes a choice. Uses the local Qwen TTS server with a specific `qwenInstruct` voice prompt (e.g. `"Deep, resonant male narrator voice. Movie trailer register. Slow, deliberate pacing. Gravitas."`) and a low voice seed. Should auto-trigger on concept reveal with no play button required — the concept text fades in while the narration plays. A subtle "▶ Replay" button replays on demand. Implementation: fire a `/api/qwen/speak` request with the full concept text and the narrator instruct on `onConceptGenerated`; stream audio via `TTSPlayer`; animate the concept text in sync.

- **iOS Player App** — Subscription iOS app delivering NodeWeaver-produced interactive stories to players. Architecture: thin native Swift shell (WKWebView wrapper) + NodeWeaver web player (TypeScript/React, CC maintains). Native shell handles App Store presence, StoreKit 2 subscriptions, push notifications, app lifecycle. Web player handles story playback, VFX pipeline, audio pipeline (pre-generated WAVs), character portraits. Monetisation: free tier (2–3 starter stories), subscription unlocks all content + future episodes; episodic release cadence. Story delivery: bundled assets or on-demand download from server; subscription state passed from Swift shell into web layer. Testing workflow: iOS Simulator (free, ships with Xcode) → direct Xcode install (plug in device, instant) → TestFlight (hours review) → App Store (1–7 days first, 24–48h updates). Apple Developer Program ($99/year) required for device testing + submission. Apple takes 30% (15% after year one). Open questions: bundled vs. on-demand stories; price point; iPhone/iPad/universal; rotating vs. fixed free tier.

- ~~**Loom — AI Developmental Editor**~~ — **Implemented.** A collapsible AI assistant panel at the bottom of the NodeEditorPanel. Understands both the current node and the full story graph (all nodes, characters, world data, branching structure). Auto-analyses on node open; writer can also ask freeform questions in a chat thread. Returns 2–5 structured insight cards with severity levels (warning/suggestion/info) and one-click apply actions (add choice, create twist node, add character line). System prompt embeds proven craft principles from McKee, Snyder, Truby, King, Le Guin. Always references specific character names and node titles — never generic. Key files: `apps/designer/src/components/panels/LoomPanel.tsx` (component), `apps/designer/src/app/api/ai/generate/route.ts` (`loom-analyse` + `loom-chat` modes).

- **Conditional Choices** — Choices that unlock/hide based on game state. Core types: `flag` (boolean), `stat` (numeric comparison), `visited` (node seen), `inventory` (item held). Each choice gets optional `conditions?: Condition[]` and `effects?: Effect[]` arrays on `NWVChoice`. Effects change state: `setFlag`, `changeStat`, `addItem`, `removeItem`. Runtime `GameState = { flags, stats, inventory, visitedNodes }` persists across nodes. Designer UX: choice cards show condition badge (lock icon when locked, dim when unmet); drag a condition pill onto a choice to set it. Condition editor in choice card expand. PlayMode evaluates `getAvailableChoices(node, state)` filtering by conditions, hides/disables unmet choices. Enables skill checks, delayed consequences, hidden paths.

- ~~Play From Here~~ — **Implemented** (▶ button on Story/Chat/Combat/Twist nodes → `playFromNodeId` store → PlayMode `startNodeId` prop)

- ~~Inline Audio Controls~~ — **Implemented** (▶/■/○ button in each CanvasBlock row, calls `/api/qwen/speak` or `/api/tts/elevenlabs`, plays via `new Audio()`)

- ~~Choice Pills on Graph Edges~~ — **Implemented** (ChoiceEdge already rendered pills; upgraded to violet-50/violet-700 styling for visibility)

- **Contextual AI Suggestions** — `[AI ▾]` dropdown button on each canvas node showing: "Suggest next choices", "Suggest a twist here", "Suggest ambience". Inline mini-panel with AI-generated options to accept/discard. Graph-context-aware (knows ancestors, current node type, story genre).

- **Scene Audio Visibility** — Visual indicator on canvas nodes that have ambient/music audio assigned (small speaker icon or teal dot). Currently there's no way to see at a glance which nodes have audio without opening the editor.

- **Live Narrative Simulation (Story Debugger)** — A "debug mode" overlay on the canvas that simulates a player walk-through in real time: active node glows, visited nodes dim to indicate they've been seen, chosen edges highlight in a traced path colour, hover over a node to see "reachable from X paths, visited Y times in Z playthroughs" stats. Run multiple simultaneous trace paths to visualize branching coverage. Helps writers identify unreachable nodes, dead ends, and overly linear sections.

- **Canopy (Story Co-Pilot)** — Persistent side panel or floating widget with graph-aware structural advice. Analyses the full story graph and flags: long linear runs with no branches ("consider a choice here"), nodes with too many choices (decision fatigue), unreachable orphan nodes, missing end nodes on branches, low twist density by act. Also proactively suggests where to place a twist or introduce a character callback. Different from the per-node Loom — this is story-level structural intelligence.

- **Audio-Driven Storytelling / Listen Mode** — An enhanced PlayMode variant where the story is presented as an interactive audio drama: ambient sound fades in before narration begins, music layers under dialogue, choices are read aloud by a neutral voice, user selects by voice or tap. Optimised for eyes-closed listening (phone in pocket / accessibility use case). Separate "Listen Mode" button in the story header alongside the existing Play button.

- **Story Lanes** — Visual horizontal bands on the canvas representing story acts or arcs. `NWVLane` type is already in the schema but lanes are not yet rendered as canvas regions. Implement as: coloured horizontal swim-lane bands behind the nodes, `+ Add Lane` button, drag nodes between lanes, lane label/description sidebar. Auto depth-based layout assigns nodes to lanes by BFS depth from start (Act 1 = depth 0–2, Act 2 = depth 3–5, etc.). Lane stats: node count, avg word count, estimated read time. Collapse/expand a lane to hide its nodes as a summary chip.

- **C3 Look-ahead TTS Pre-generation** — While block N is playing, synthesise block N+1 in the background via Qwen streaming + CTC alignment, storing both audio and word timestamps to IDB. By the time block N finishes, block N+1 is ready: audio plays immediately and word highlights sync from word 1 with no cascade. Works cleanly for linear sequences; for branches, pre-generate all immediate successor nodes (rarely more than 2–3). Pairs naturally with the streaming-path IDB timestamp cache added in Session 10 — look-ahead just warms it proactively.

- **Scene Panel v2 (audio + visual effects timeline)** — Split the node editor into two sections with different interaction models:
  - **Writing section** (unchanged): prose/line blocks stay exactly as-is. One new plain-text field added for **visual effects description** — natural language only (e.g. "recovering from a blow to the head, vision clearing"). Author writes intent; AI translates to CSS keyframes on the VFX track.
  - **Scene panel** (new, collapsible below writing section): horizontal DAW-style timeline. Five tracks:
    - **Dialogue** — locked sequential blocks (character name + duration), read-only
    - **Ambient** — draggable, loopable, fade in/out handles, waveform display
    - **Music** — draggable, loopable, fade in/out handles, waveform display
    - **SFX** — draggable point events placed at a timestamp
    - **Visual FX** — keyframe-based CSS effect states with transition durations; author drags keyframes to adjust timing
  - **CSS primitives**: blur · brightness · vignette · colour tint · flicker · shake · text opacity
  - **Visual effects model**: author writes natural language intent → AI translates to CSS keyframes on VFX track. Scene-level states only (not word-synced). Draggable keyframes set timing + transition duration. Player engine applies CSS transitions during playback.
  - **Timeline model**: scene duration = auto sum of TTS clip durations; manual end-point drag to extend; dialogue always sequential/no-overlap; shared playhead + scrub across all tracks; waveform via Web Audio API `decodeAudioData` + `<canvas>` amplitude draw
  - Open questions: (1) Existing schema for Ambient/Music/SFX on node, or needs adding? (2) Scene panel collapsed by default? (3) Ambient/music source — ElevenLabs, user upload, or both? (4) Timeline data stored per-node in `.nwv` or separately? (5) VFX keyframe schema — CSS property map with timestamps or higher-level abstraction? (6) Fixed CSS primitives allowlist or open-ended AI generation?

- **Path Heat Visualization** — After playtesting, overlay edge thickness / colour heat on the canvas proportional to how frequently each choice was taken. Thin cool-coloured edges = rarely chosen; thick warm edges = popular paths. Helps writers identify which branches players actually experience and which are "dead" despite existing. Data sourced from exported playtest logs or simulated via AI playthroughs.

- **Void Runner — Lighting, Visual Effects & Word-Sync System** — A word-level timing system that drives read-along highlighting, SFX triggers, and dynamic scene lighting from a single `requestAnimationFrame` loop. Key components:
  - **Word Timestamp Pipeline**: ElevenLabs characters get timestamps from the native API response; Qwen3-TTS runs `faster-whisper` on saved WAV (once at cache time, zero cost on replay). Format: `{word, start_ms, end_ms}[]`.
  - **RAF Playback Renderer**: Single loop drives word highlighting, SFX triggers, and lighting beats. Self-corrects on scrub/pause. One loop, N subscribers.
  - **Read-Along Highlighting**: Pre-wrapped `<span class="word">` elements with `.active` (current, glowing) / `.passed` (dimmed) / `.lit` (inside beam radius) CSS classes.
  - **Lighting System**: Two canvas layers (light-canvas with `screen` blend for warm glow, mask-canvas for darkness with radial cutout). Position lerps toward target each frame. Noise-based micro-flicker. Word proximity lighting checks DOM positions against beam centre.
  - **Lighting Config Schema (`.vrn`)**: Declarative JSON — `ambient` (start/end colours), `beam` (warmth, flicker, falloff), `beats[]` (word-anchored effects). Effect types: `flash`, `blackout`, `cold`, `swing`, `shrink`.
  - **Narrative Designer — Lighting Node**: First-class React Flow canvas node type (`LIGHTING`). Connects to prose node, receives word list. Freetext textarea for natural language intent → AI generates config JSON → beat chips show human-readable summary → "Apply to scene" pushes to renderer. Status dots: dim (no connection), amber (config ready), green (applied).
  - Config is fully declarative — adding new effect types means adding a handler in the renderer and a new valid effect value in the schema. The same RAF loop handles read-along, SFX, and lighting.

- ~~iPad / Local Network Access~~ — **HTTPS implemented in Session 17.** NodeWeaver runs on the Mac Mini and is accessed from an iPad over the home LAN. Dev server listens on `0.0.0.0:3000` with HTTPS via mkcert cert. See HTTPS setup below.

## HTTPS / LAN Setup

**One-time Mac setup:**
```bash
cd apps/designer
bash setup-https.sh     # installs mkcert, generates cert for localhost + LAN IP
mkcert -install         # run THIS line in your own terminal (needs password prompt)
```
After `mkcert -install`, restart the dev server. The server now runs at `https://localhost:3000` and `https://192.168.86.23:3000`.

**If LAN IP changes** — re-run `bash setup-https.sh` then restart dev server.

**One-time iPad trust setup:**
1. Find root CA: `open "$(mkcert -CAROOT)"` — AirDrop `rootCA.pem` to iPad
2. iPad → Settings → General → VPN & Device Management → tap downloaded profile → Install
3. iPad → Settings → General → About → Certificate Trust Settings → enable `mkcert …`
4. Bookmark `https://192.168.86.23:3000` in Safari

**Files:**
- `apps/designer/setup-https.sh` — setup/regeneration script
- `apps/designer/certs/` — generated cert + key (gitignored)
- `apps/designer/package.json` dev script — uses `--experimental-https-key/cert --hostname 0.0.0.0`

**LAN tip:** Assign the Mac a static local IP in router settings so the bookmark never breaks.

- ~~Speech-to-Text Dictation~~ — **Implemented in Session 12** (mic toggle in canvas toolbar, dictates to any focused contenteditable field, live interim text shown purple/italic)

- ~~Voice UI in Focus Mode~~ — **Implemented in Session 12** (wake word system with Claude AI command parsing, configurable wake word + assistant voice instruct + response mode toggle in Settings, VoiceHUD floating panel, canvas glow when listening)

- ~~Short voice prompts for Qwen stability~~ — **Done.** `qwenInstruct` limited to a single short phrase (5–12 tokens); AI voice mode enforces this. Bracket tags handle per-block delivery nuance.

- **World Builder** — Optional depth layer that appears after concept generation in Inspire Me and Quick Start flows — not a third dashboard entry point. Flow: concept presented → "Build the world first" path → World Builder wizard → canvas. Inspire Me and Quick Start behaviour unchanged; World Builder runs between concept and canvas.

  Wizard is AI-assisted, guided by the established concept. Develops: locations, factions, lore, world rules, key characters.

  Open questions:
  - Output format: structured data attached to project, reference nodes on canvas, or sidebar reference panel?
  - Editability: editable after initial setup or one-time wizard?
  - Context injection: does world builder output feed into AI writing prompts when authoring nodes?

- **Visual Effects Library** — Full catalogue of CSS-based scene-level effects for the VFX track in the AV FX panel. All effects use combinations of `filter: blur()`, `brightness()`, `contrast()`, `hue-rotate()`, `saturate()`, `sepia()` plus CSS animations. No canvas required. Authored via natural language → AI-translated to keyframes on the VFX track.

  **Ambient light**
  - *Candlelight* — warm amber flicker, subtle brightness pulse, vignette breathing
  - *Torch* — aggressive flicker, brightness spikes, strong vignette, orange tint
  - *Fireplace* — slow warm pulse, flicker bursts, deep vignette, embers tint
  - *Moonlight* — cool blue-white tint, static, deep vignette, minimal variation
  - *Fluorescent* — stutter flicker, cool white, random brief dimming
  - *Neon* — colour tint cycling, buzz-flicker, high contrast

  **Dramatic / narrative**
  - *Blackout* — instant or slow fade to black, snap back
  - *Fade in from black* — scene open, waking up, regaining consciousness
  - *Strobe* — rapid flicker. **Requires trigger warning before scene loads — use sparingly**
  - *Lightning flash* — single sharp white brightness spike then back to dark
  - *Power flicker* — lights stuttering, about to fail
  - *Emergency lighting* — dim red tint, slow pulse

  **Player state**
  - *Concussion* — blur, desaturated, slow clearing over time
  - *Drunk* — gentle sway, hue rotation, soft blur edges
  - *Poisoned* — green tint, pulsing, increasing blur
  - *Fear / tension* — vignette closing in slowly, slight desaturation
  - *Death approaching* — heavy vignette, desaturation, slow fade
  - *Euphoria* — warm brightness bloom, soft edges, colour saturation boost
  - *Adrenaline* — contrast up, slight zoom, heightened sharpness
  - *Exhaustion* — brightness slowly dropping, blur creeping in at edges
  - *Heartbeat* — rhythmic brightness pulse; BPM is a configurable parameter on the effect (not hardcoded); increase rate across a scene to build tension

  **Environmental**
  - *Underwater* — blue-green tint, subtle distortion ripple, brightness shimmer
  - *Smoke / fog* — reduced contrast, grey tint, soft blur
  - *Sunlight through window* — warm tint, bright directional highlight, dust particle effect via CSS
  - *Eclipse* — gradual dimming to near-black with deep orange edge tint
  - *Heat haze* — subtle vertical shimmer distortion

  **Psychological / horror**
  - *Paranoia* — vignette that pulses as if something is watching
  - *Dissociation* — slow gentle zoom in on text, dreamlike, slightly off
  - *Intrusive thought* — brief sharp invert flash, snaps back immediately (single keyframe spike, not a transition)
  - *The walls closing in* — vignette that very slowly narrows over a long scene

  **Sci-fi / tech**
  - *Hologram* — blue tint, scanlines overlay, slight transparency flicker
  - *Data corruption* — brief pixel-shift glitch frames, chromatic aberration
  - *System shutdown* — screen elements fade out sequentially
  - *Deep space* — extreme contrast, cold blue-black, near total vignette with bright text centre

  **Time / reality**
  - *Memory* — desaturated, slightly blurred, soft vignette, feels distant
  - *Dream* — soft bloom, pastel tint shift, gentle sway
  - *Déjà vu* — brief repeat flash of previous text state (single keyframe spike, not a transition)
  - *Time skip* — quick fade to white, fade back in

  **Text-specific** *(text-level effects, not scene-level — different implementation path)*
  - *Redacted* — words or lines blacked out, revealing as narrative unlocks them
  - *Typewriter glitch* — text briefly corrupts to random characters then resolves
  - *Ink bleed* — text blurs and bleeds at edges
  - *Faded manuscript* — low contrast, aged sepia, text feels like it's disappearing

  **Implementation notes**
  - Effects with sway or zoom must respect `prefers-reduced-motion` media query
  - Strobe trigger warning must appear player-facing before the scene loads
  - Déjà vu and Intrusive thought are instantaneous flashes — single keyframe spikes only
  - Redacted is text-level not scene-level — needs a separate implementation approach from all other effects

## Pending Setup

*One-time tasks that require manual action.*

- **Activate HTTPS on Mac** — Run in a terminal (needs your Mac password):
  ```bash
  mkcert -install
  ```
  Then restart the dev server. NodeWeaver will serve `https://localhost:3000`.

- **Trust cert on iPad** — After `mkcert -install`:
  1. `open "$(mkcert -CAROOT)"` → AirDrop `rootCA.pem` to iPad
  2. iPad → Settings → General → VPN & Device Management → tap profile → Install
  3. iPad → Settings → General → About → Certificate Trust Settings → enable `mkcert …`
  4. Bookmark `https://192.168.86.23:3000` in Safari — voice mode now works over LAN

## Known Bugs

- **Voice on iPad over LAN** — Resolved once mkcert CA is trusted on iPad (see Pending Setup above). After iPad trust is set up, voice mode works at `https://192.168.86.23:3000`.

- ~~**`middleware` deprecation warning on dev server start**~~ — Fixed in Session 20: renamed `src/middleware.ts` → `src/proxy.ts`.
