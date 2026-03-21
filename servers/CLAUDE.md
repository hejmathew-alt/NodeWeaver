# servers/ — Python AI Servers

Local Python servers for TTS, audio generation, and image generation.
All run on Apple Silicon (M4 Mac Mini, 32GB RAM, MPS GPU).

## Servers

### qwen_server.py (port 7862)
- **Model**: mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit
- **Endpoints**: `GET /health`, `POST /` (full WAV), `POST /stream`, `POST /timestamps`
- Lazy model loading with threading lock
- `TRIM_START_MS = 200` (trims instruct bleed from first audio chunk)
- **Managed by**: `lib/qwen-daemon.ts` (auto-spawns on first TTS request)
- **Venv**: `servers/qwen_venv/`

### audiocraft_server.py (port 7863)
- **Model**: `stabilityai/stable-audio-open-1.0` via `diffusers.StableAudioPipeline`
- **Endpoints**: `GET /health`, `POST /sfx`, `POST /ambient`, `POST /music`
- MPS accelerated, 44.1kHz stereo -> mono WAV output
- **Managed by**: `lib/audiocraft-daemon.ts`
- **Venv**: `servers/venv/`

### comfyui/ (port 8188)
- External clone (setup via `setup-comfyui.sh`), not our code
- **Managed by**: `lib/comfyui-daemon.ts` (`--force-fp16` for MPS compatibility)
- **Venv**: `servers/venv/`

## Virtual Environments
- `servers/venv/` — shared venv for audiocraft + comfyui (Python 3.11, torch 2.10)
- `servers/qwen_venv/` — separate venv for Qwen (MLX dependencies)
- Both are gitignored. Never commit.

## Conventions
- All daemon managers in `lib/` follow the same singleton pattern:
  `isAlreadyUp()` -> health check -> `freePort()` -> `spawn()` -> wait for ready signal
- Subprocess env: whitelist `PATH` + `HOME` only. No `...process.env` spread.
- Never hardcode absolute paths. Use `os.homedir()` + relative from project root.
- Python servers use `http.server.HTTPServer` (stdlib), not Flask/FastAPI.
