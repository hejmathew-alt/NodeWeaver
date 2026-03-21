# lib/ — Utility Modules

Shared business logic imported by components, store, and API routes. ~25 modules, no React dependencies.

## Module Groups

### TTS & Audio Playback
| File | Purpose |
|------|---------|
| `tts-player.ts` | TTSPlayer class — Web Audio API streaming from Qwen |
| `sfx-player.ts` | playOnce / playLooped / playFromUrl via Web Audio |
| `audio-storage.ts` | Server-side primary, IDB fallback; filename helpers |
| `batch-tts.ts` | FinaliseModal batch rendering (Qwen + EL providers) |
| `el-audio-cache.ts` | In-memory Map cache for EL TTS responses |
| `el-delivery-map.ts` | Maps Qwen emotion/tone -> EL stability/similarity/style |
| `char-seed.ts` | Deterministic voice seed hash per character ID (djb2) |

### AI
| File | Purpose |
|------|---------|
| `ai-prompts.ts` | All 14 Claude system prompts + 12 builder functions |
| `context-builder.ts` | BFS graph context (ancestors, siblings, twists) for AI writing |
| `voice-commands.ts` | Voice command intent parsing via Claude |

### Daemons (Node.js only — never import client-side)
| File | Purpose |
|------|---------|
| `qwen-daemon.ts` | Singleton subprocess for Qwen TTS (port 7862) |
| `comfyui-daemon.ts` | Singleton subprocess for ComfyUI (port 8188) |

### Canvas & Layout
| File | Purpose |
|------|---------|
| `layout.ts` | Dagre LR auto-layout + collision BFS (pushOverlaps) |
| `spine.ts` | DFS longest-path spine computation with author overrides |
| `flow-doc.ts` | NWVStory <-> plain-text FlowEditor format conversion |

### Data & Export
| File | Purpose |
|------|---------|
| `db.ts` | Dexie v4 schema (fileHandles table; stories/audioFiles deprecated) |
| `export.ts` | File System Access API save/open, .nwv JSON export |
| `blocks.ts` | deriveBody() + migrateNodeToBlocks() |
| `settings.ts` | useSettingsStore (persisted to localStorage) |
| `constants.ts` | DEBOUNCE_PERSIST, AI_MAX_TOKENS, AI_MAX_TOKENS_DEFAULT |
| `character-options.ts` | Shared EMOTION/TONE/VOICE_TEXTURE option arrays |

### VFX
| File | Purpose |
|------|---------|
| `vfx-engine.ts` | computeVFXState() keyframe interpolation + applyVFXToDOM() |
| `vfx-presets.ts` | 14 named VFX presets (Candlelight, Moonlight, etc.) |

### Voice
| File | Purpose |
|------|---------|
| `voice-recognition.ts` | webkitSpeechRecognition singleton + DictationTarget interface |
| `voice-commands.ts` | AI command interpretation + execution |

### Image Generation
| File | Purpose |
|------|---------|
| `comfyui.ts` | ComfyUI REST API client (portrait workflow, art styles) |

## Conventions
- Daemon modules are Node.js-only (`child_process`, `fs`, `net`). Never import in client components.
- Daemon paths: `os.homedir() + 'Documents/Claude Projects/NodeWeaver/servers/'`. Never hardcode absolute paths.
- Daemon env whitelist: only `PATH`, `HOME`, and service-specific vars. No `...process.env`.
- `settings.ts` exports `CANVAS_TEXT_CLASS` — literal Tailwind classes required for JIT compilation.
- All audio filenames validated by regex before disk access (see API route rules).
