---
paths:
  - "apps/designer/src/lib/ai-prompts.ts"
  - "apps/designer/src/lib/context-builder.ts"
  - "apps/designer/src/app/api/ai/**"
---

# AI Prompt Rules

## Architecture
- All Claude prompt text lives in `lib/ai-prompts.ts`. The route file (`app/api/ai/generate/route.ts`) handles HTTP plumbing only (~110 lines).
- Two main exports consumed by the route: `buildSystemPrompt(mode, prompt, context)` and `buildUserMessage(mode, prompt, context)`.
- `NON_STREAMING_MODES` array determines SSE vs JSON response format.

## Adding a New AI Mode (Checklist)
1. Add system prompt constant in `ai-prompts.ts` (e.g., `MY_MODE_SYSTEM`)
2. Add case to `buildSystemPrompt()` switch
3. Add case to `buildUserMessage()` switch
4. If non-streaming: add mode string to `NON_STREAMING_MODES` array
5. Add token limit entry in `lib/constants.ts` → `AI_MAX_TOKENS` record

## Context Builder
- `buildAIContext()` does BFS from roots through choices.
- Returns: ancestral path, sibling branches, downstream twist anchors, characters on path, genre brief, logline, target tone.
- Genre brief injected from `GENRE_META[genre].brief`. Custom genre uses story metadata.

## Prompt Style
- System prompts: describe role + constraints + output format.
- User messages: provide the data (node content, character info, context packet).
- Non-streaming modes return JSON — system prompt must specify exact JSON schema.
- Streaming modes return plain text via SSE.

## Token Limits
- Defined in `lib/constants.ts` as `AI_MAX_TOKENS: Record<string, number>`.
- Default fallback: `AI_MAX_TOKENS_DEFAULT = 500`.
- Always add an entry for new modes — don't rely on the default.
