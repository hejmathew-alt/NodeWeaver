# dashboard/ — Story Dashboard Modals

Modal dialogs shown on the story list / landing page before entering the canvas.

## Components
| File | Purpose |
|------|---------|
| `InspireModal.tsx` | AI concept generator (genre-specific prompts, trope rejection, variety rules) |
| `QuickStartModal.tsx` | Brief -> genre -> AI generates skeleton story -> canvas |
| `SeedModal.tsx` | Conversation-first story wizard (4 tabs: Conversation / Premise / Cast / Architecture -> planting) |
| `SeedAIModal.tsx` | Legacy multi-phase wizard (kept for reference, no longer imported) |
| `WorldBuilderModal.tsx` | AI-assisted world building (locations / factions / lore / rules) |
| `GlobalSettingsModal.tsx` | API keys + voice settings (accessible without opening a story) |
| `StoryCard.tsx` | Story list card on dashboard (thumbnail, title, genre, timestamps) |

## SeedModal Tabs
1. **Conversation** — freeform chat with Seed (phase-scoped: spark → premise → cast → architecture)
2. **Premise** — 3 structured premise cards ([who] wants [what] but [obstacle]), select to lock
3. **Cast** — 2–4 character cards with name, role, wound, want — fully editable
4. **Architecture** — act spine (Early / Middle / Late) + jaw-drop moments → "Plant this seed" button

## Seed API Routes
- `POST /api/seed-chat` — streaming conversational responses with multi-turn history
- `POST /api/seed-generate` — structured JSON generation (premises / cast / architecture)
- Legacy seed modes still available in `/api/ai/generate` (seed-spark, seed-premise, etc.)

## Conventions
- All modals receive `onClose` prop and optionally `onStoriesChanged` for dashboard refresh
- Seed chat calls go through `/api/seed-chat`; structured generation through `/api/seed-generate`
- Genre dropdown uses `GENRES` constant (matches `GenreSlug` union from engine)
- After story creation: `router.push(\`/story/\${id}\`)` navigates to canvas

## Tool Suite Naming
The AI tool suite uses an organic metaphor:
- **Seed** — plants the story (this module)
- **Loom** — weaves the nodes (per-node developmental editor)
- **Canopy** — watches the whole shape from above (story-level structural analysis)
- **Graft** — makes careful interventions that change direction (narrative tutor)
