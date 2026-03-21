# @nodeweaver/engine — Shared Types & Constants

Source of truth for the NWV schema. Imported by the designer app and (future) game runtime.
**Zero runtime dependencies** — types and constants only.

## Structure
- `src/types/index.ts` — all NWV interfaces and type unions
- `src/constants/genres.ts` — `GENRE_META` with briefs, voice test lines, theme colours
- `src/index.ts` — re-exports from types + constants

## Key Types
| Type | Purpose |
|------|---------|
| `NWVStory` | Top-level: nodes[], characters[], lanes[], enemies{}, world, metadata |
| `NWVNode` | id, type, title, blocks[], choices[], position, status, vfxKeyframes[] |
| `NWVBlock` | type (prose\|line), text, characterId, delivery params, sfxCues[], ttsAudioFile |
| `NWVChoice` | label, flavour, next, effects, requires, combat, ending, combatOutcome |
| `NWVCharacter` | name, role, backstory, traits, qwenInstruct, TTS config, avatar fields |
| `NWVVFXKeyframe` | id, timeMs, effect (VFXEffectType), value, transitionMs |
| `NWVWorldData` | locations[], factions[], rules[], lore[] |

## Key Unions
- `NodeType` = `'story' | 'combat' | 'chat' | 'twist' | 'start' | 'end'`
- `GenreSlug` = 11 genre strings (sci-fi, fantasy, horror, etc.)
- `ArtStyle` = 8 portrait style strings
- `TTSProvider` = `'qwen' | 'elevenlabs'`
- `VFXEffectType` = blur, brightness, vignette, tint, flicker, shake, textOpacity, saturation, contrast

## Conventions
- Never add runtime dependencies — this package must remain type/constant only
- `NWVScriptLine` is DEPRECATED — kept for migration only. Use `NWVBlock[]`.
- `body` field on NWVNode is auto-derived from prose blocks via `deriveBody()`
- Narrator is a built-in character (id: `'narrator'`), auto-injected by store on load
- Types used across both packages; constants consumed by designer only (currently)
