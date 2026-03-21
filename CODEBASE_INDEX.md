# NodeWeaver Codebase Index

## Project Structure
```
apps/designer/     Next.js 16 authoring UI (port 3000)
packages/engine/   Shared types + constants (@nodeweaver/engine)
servers/           Python AI servers (Qwen TTS, Stable Audio, ComfyUI)
```

## Designer App — apps/designer/src/

### Pages & Routing
| File | Purpose |
|------|---------|
| `app/page.tsx` | Dashboard (story list, create flows) |
| `app/story/[id]/page.tsx` | Story editor (canvas + panels + play modes) |
| `app/layout.tsx` | Root layout |

### State
| File | Purpose |
|------|---------|
| `store/story.ts` | `useStoryStore` — all story CRUD, node/block/choice/character mutations |
| `store/voice.ts` | `useVoiceStore` — ephemeral mic/voice lifecycle |
| `lib/settings.ts` | `useSettingsStore` — persisted user prefs (localStorage) |

### Canvas System
| File | Purpose |
|------|---------|
| `components/canvas/StoryCanvas.tsx` | React Flow canvas + DnD + panel orchestration |
| `components/canvas/CanvasToolbar.tsx` | Node creation buttons, view toggles |
| `components/canvas/nodes/StartNode.tsx` | Story start node (source handle only) |
| `components/canvas/nodes/StoryNode.tsx` | Narrative node |
| `components/canvas/nodes/ChatNode.tsx` | Character dialogue node |
| `components/canvas/nodes/CombatNode.tsx` | Interactive combat node |
| `components/canvas/nodes/TwistNode.tsx` | Plot twist node (dashed border) |
| `components/canvas/nodes/EndNode.tsx` | Story ending node (target handle only) |
| `components/canvas/nodes/BlocksPreview.tsx` | Sortable block list inside nodes |
| `components/canvas/nodes/CanvasBlock.tsx` | Draggable block row |
| `components/canvas/edges/ChoiceEdge.tsx` | Custom edge with choice label pills |
| `components/canvas/ActBands.tsx` | Act column backgrounds |
| `components/canvas/ActHeader.tsx` | Pinned act headers |

### Panels
| File | Purpose |
|------|---------|
| `components/panels/NodeEditorPanel.tsx` | Block editor, choices, TTS, AI write, combat (largest file) |
| `components/panels/SettingsPanel.tsx` | Provider config, API keys, voice settings |
| `components/panels/WorldPanel.tsx` | Locations, factions, rules, lore |
| `components/panels/LoomPanel.tsx` | AI developmental editor |
| `components/panels/LanePanel.tsx` | Swim lane management |
| `components/panels/EnemyPanel.tsx` | Enemy/encounter cards |

### Full-Screen Pages
| File | Purpose |
|------|---------|
| `components/pages/CharactersPage.tsx` | Character management, voice design, avatar generation |
| `components/pages/EncountersPage.tsx` | Enemy/encounter management |

### Dashboard Modals
| File | Purpose |
|------|---------|
| `components/dashboard/InspireModal.tsx` | AI concept generator |
| `components/dashboard/QuickStartModal.tsx` | Brief -> skeleton story |
| `components/dashboard/SeedAIModal.tsx` | Multi-phase AI wizard (spark->premise->worldcast->arch->plant) |
| `components/dashboard/WorldBuilderModal.tsx` | AI-assisted world building |
| `components/dashboard/GlobalSettingsModal.tsx` | API keys + voice settings |
| `components/dashboard/StoryCard.tsx` | Story list card |

### Playback & AV
| File | Purpose |
|------|---------|
| `components/PlayMode.tsx` | Full-screen playback with TTS, SFX, VFX, choices |
| `components/CanvasPlayer.tsx` | Canvas-native playback HUD |
| `components/AVFXPanel.tsx` | DAW-style audio/VFX timeline |
| `components/AVFXPlayView.tsx` | Compact dark reader for AVFX top pane |
| `components/FinaliseModal.tsx` | Batch TTS rendering (Qwen + EL) |
| `components/VoiceHUD.tsx` | Floating voice mode HUD |

### Lib — Utilities
| File | Purpose |
|------|---------|
| `lib/ai-prompts.ts` | All Claude system prompts + builders (14 prompts, 12 builders) |
| `lib/context-builder.ts` | BFS graph context for AI writing |
| `lib/tts-player.ts` | TTSPlayer class (Web Audio streaming) |
| `lib/sfx-player.ts` | Web Audio SFX playback |
| `lib/audio-storage.ts` | Server-primary audio file storage + IDB fallback |
| `lib/batch-tts.ts` | Finalise batch TTS utilities |
| `lib/qwen-daemon.ts` | Qwen TTS subprocess manager (port 7862) |
| `lib/comfyui-daemon.ts` | ComfyUI subprocess manager (port 8188) |
| `lib/comfyui.ts` | ComfyUI REST API client |
| `lib/layout.ts` | Dagre auto-layout + collision resolution |
| `lib/spine.ts` | Critical path (spine) computation |
| `lib/vfx-engine.ts` | VFX keyframe interpolation + DOM application |
| `lib/vfx-presets.ts` | 14 named VFX presets |
| `lib/blocks.ts` | deriveBody() + migrateNodeToBlocks() |
| `lib/export.ts` | File System Access API save/open |
| `lib/flow-doc.ts` | Story <-> plain-text conversion |
| `lib/db.ts` | Dexie v4 schema (fileHandles table) |
| `lib/constants.ts` | Timing + AI token limit constants |
| `lib/char-seed.ts` | Deterministic voice seed per character |
| `lib/el-delivery-map.ts` | Qwen delivery -> EL voice_settings mapping |
| `lib/el-audio-cache.ts` | In-memory EL TTS cache |
| `lib/voice-recognition.ts` | Speech recognition singleton |
| `lib/voice-commands.ts` | Voice command parsing + execution |
| `lib/character-options.ts` | Shared EMOTION/TONE/VOICE_TEXTURE arrays |

### API Routes
| File | Purpose |
|------|---------|
| `app/api/ai/generate/route.ts` | Claude AI proxy (all modes, streaming + JSON) |
| `app/api/qwen/speak/route.ts` | Full WAV synthesis proxy |
| `app/api/qwen/stream/route.ts` | Streaming WAV synthesis proxy |
| `app/api/qwen/timestamps/route.ts` | CTC/Whisper alignment proxy |
| `app/api/stories/route.ts` | Story list + create |
| `app/api/stories/[id]/route.ts` | Story CRUD |
| `app/api/stories/[id]/audio/route.ts` | Audio file storage |
| `app/api/stories/[id]/avatar/route.ts` | Avatar PNG storage |
| `app/api/avatar/generate/route.ts` | ComfyUI portrait proxy |

## Engine Package — packages/engine/src/
| File | Purpose |
|------|---------|
| `types/index.ts` | All NWV interfaces (single source of truth) |
| `constants/genres.ts` | GENRE_META per genre (briefs, voice lines, themes) |

## Python Servers — servers/
| File | Port | Purpose |
|------|------|---------|
| `qwen_server.py` | 7862 | Qwen3-TTS synthesis + CTC word alignment |
| `audiocraft_server.py` | 7863 | Stable Audio Open (SFX/ambient/music) |
| `comfyui/` | 8188 | ComfyUI portrait generation |

## Key Exported Types (from @nodeweaver/engine)
`NWVStory` `NWVNode` `NWVBlock` `NWVChoice` `NWVCharacter` `NWVSFXCue` `NWVVFXKeyframe` `NWVWorldData` `NWVEnemy` `NWVStoryMetadata` `NWVLane` `ActColumn` `NodeType` `GenreSlug` `ArtStyle` `TTSProvider` `WordTimestamp` `VFXEffectType` `NodeStatus`
