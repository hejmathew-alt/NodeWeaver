# api/ — Next.js API Routes

Server-side route handlers. All use App Router convention (`route.ts` with named HTTP method exports).

## Route Groups

### /api/stories/ — Story CRUD + Assets
- `route.ts` — GET (list all) / POST (create new)
- `[id]/route.ts` — GET/PUT/DELETE single story JSON
- `[id]/audio/route.ts` — GET/PUT/DELETE audio files (WAV/MP3/JSON timestamps)
- `[id]/avatar/route.ts` — GET/PUT/DELETE character portrait PNGs

### /api/ai/generate/ — Claude AI Proxy
- Single POST handler for all AI modes
- Imports `buildSystemPrompt` / `buildUserMessage` from `lib/ai-prompts.ts`
- Streaming (SSE) for body/voice/line/inspire; non-streaming JSON for all others
- API key: prefers `.env.local` `ANTHROPIC_API_KEY`, falls back to client-supplied

### /api/qwen/ — Qwen TTS Proxy
- `speak/route.ts` — full WAV synthesis (POST body -> WAV response)
- `stream/route.ts` — streaming WAV synthesis (length-prefixed chunks)
- `timestamps/route.ts` — CTC/Whisper word-level alignment

### /api/avatar/generate/ — ComfyUI Portrait Proxy
- POST accepts `{ prompt, artStyle, seed?, comfyuiUrl, comfyuiModel }` -> PNG bytes
- SSRF guard: `ALLOWED_COMFYUI_HOST` regex rejects non-localhost/LAN URLs

## Security Patterns (MANDATORY)
- **Filename validation**: `safeAudioFilename()` / `safeAvatarFilename()` regex whitelist
- **ID sanitization**: `safeId()` strips non-alphanumeric chars
- **Body size limits**: audio 50MB, avatar 10MB
- **MIME validation**: check Content-Type matches expected type
- **Atomic writes**: write to temp file -> rename (audio + avatar routes)
- **SSRF**: validate user-provided URLs against localhost/LAN regex
- **Subprocess env**: whitelist only (PATH, HOME). Never `...process.env`
- **API keys**: from `.env.local` only. Never log. Never hardcode.

## Conventions
- RouteContext type: `{ params: Promise<{ id: string }> }` (Next.js 16 async params)
- `DATA_DIR`: `path.join(process.cwd(), 'data', 'stories')`
- `ensureDataDir` / `ensureAudioDir` with `{ recursive: true }`
- Error responses: `NextResponse.json({ error: string }, { status: number })`
- Daemon routes call `ensureQwenReady()` / `ensureComfyUIReady()` before proxying
