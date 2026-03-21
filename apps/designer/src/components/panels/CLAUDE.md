# panels/ — Side Panels

Panels that open alongside the canvas for editing node content, settings, and world data.

## Components
| File | Purpose |
|------|---------|
| `NodeEditorPanel.tsx` | Block editor, choices, TTS playback, AI write, combat config (largest component) |
| `SettingsPanel.tsx` | TTS provider, canvas text size, API keys, voice settings, ComfyUI config |
| `WorldPanel.tsx` | Locations, factions, rules, lore with AI generation per section |
| `LoomPanel.tsx` | AI developmental editor (auto-analysis + chat thread) |
| `LanePanel.tsx` | Swim lane management |
| `EnemyPanel.tsx` | Enemy/encounter cards (HP, damage, art, taunts) |
| `CharacterPanel.tsx` | Legacy panel — mostly superseded by `pages/CharactersPage` |

## NodeEditorPanel Internals

**BlockTextEditor** — `contentEditable` div, ref-based (no controlled React state):
- Debounced word-span injection (`DEBOUNCE_SPANS` = 400ms)
- SFX word underlines via `data-wi` spans with coloured `border-bottom`
- `DictationTarget` interface for voice mode
- `onPaste` strips HTML -> plain text
- AI streaming updates div content directly via ref

**ChoiceCard** — choice label, flavour, consequence, combat outcome badges (green=victory, red=defeat, slate=escape).

**Combat section** — enemy picker, outcome routes (Victory/Defeat/Escape). Victory + Defeat choices are non-deletable.

**TTS playback routing**:
- Qwen characters: `TTSPlayer` streaming via `/api/qwen/stream`
- EL characters: `fetch('/api/tts/elevenlabs')` -> `new Audio(blobUrl)`

## Conventions
- `NODE_TYPE_COLOURS` record maps `NodeType` -> hex string
- Colour values in style attributes must be validated against `/^#[0-9a-f]{6}$/i`
- Use `useSettingsStore` for API keys and provider config
- Store selectors: granular (single field) not broad destructure
