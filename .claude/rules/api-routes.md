---
paths:
  - "apps/designer/src/app/api/**"
---

# API Route Rules

## Filename Validation (MANDATORY)
- ALWAYS validate user-supplied filenames with a strict regex whitelist before any filesystem operation.
- `path.basename()` alone is NOT sufficient — it doesn't prevent malicious patterns.
- Use `safeAudioFilename()` for audio, `safeAvatarFilename()` for avatars.
- Pattern: `/^(tts|sfx|ambient|music)_[a-z0-9]{16}[a-z0-9_-]*\.(wav|mp3|json)$/`

## ID Sanitization
- Use `safeId()`: `id.replace(/[^a-zA-Z0-9_\-]/g, '')` before constructing any file path from route params.

## Next.js 16 Async Params
- Route context type: `{ params: Promise<{ id: string }> }` — always `await params` before use.

## Body Size Limits
- Audio routes: 50 MB max.
- Avatar routes: 10 MB max.
- Enforce with `export const config = { api: { bodyParser: { sizeLimit: '...' } } }` or manual check.

## MIME Validation
- Check Content-Type header matches expected type before processing.
- Audio: `audio/wav`, `audio/mpeg`, `application/json`.
- Avatar: `image/png`.

## Atomic Writes
- Write to temp file first, then `rename()` to final path. Never write directly to the final destination.

## SSRF Prevention
- Any user-provided URL (ComfyUI, etc.) must be validated against `ALLOWED_COMFYUI_HOST` regex.
- Reject any non-localhost/LAN URL.

## Error Handling
- Response format: `NextResponse.json({ error: string }, { status: number })`.
- Catch blocks: type-narrow with `err instanceof Error ? err.message : String(err)`.
- Daemon proxy routes: call `ensureQwenReady()` / `ensureComfyUIReady()` first. Handle spawn failure as 503.

## Secrets
- API keys from `process.env` (`.env.local`) only. Never log. Never hardcode.
- Never spread `process.env` into subprocess env — whitelist explicitly.
