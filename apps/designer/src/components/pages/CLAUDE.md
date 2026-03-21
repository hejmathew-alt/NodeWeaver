# pages/ — Full-Screen Data Management Pages

Full-screen views swapped via `activeView` state (not separate routes).
Accessed from CanvasToolbar view toggles.

## Components

### CharactersPage.tsx
Character list with expandable cards. Handles:
- **Voice design**: Qwen instruct editing, EL voice design API, voice test playback
- **Avatar**: AI prompt generation -> ComfyUI portrait -> preview/accept flow
- **Art style picker**: project-level on `NWVStoryMetadata.artStyle`
- Narrator excluded from portrait UI
- Shared options from `lib/character-options.ts` (EMOTION/TONE/VOICE_TEXTURE)

### EncountersPage.tsx
Enemy/encounter management cards:
- CRUD: name, HP, damage range, ASCII art, taunts
- Uses `slugify()` for enemy keys

## Conventions
- Both pages read store via `useStoryStore` granular selectors
- Character voice test uses `charSeed()` for deterministic voice consistency
- Avatar flow: AI prompt -> ComfyUI generate -> client preview -> Accept (PUT to `/api/stories/[id]/avatar`)
- Never auto-play audio — always use explicit button (browser gesture requirement)
