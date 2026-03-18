#!/usr/bin/env bash
# NodeWeaver — ComfyUI setup script
# Run once from the NodeWeaver root or servers/ directory.
# Clones ComfyUI, installs Python deps, and downloads the default SD 1.5 portrait model.

set -e

SERVERS="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$SERVERS/venv/bin/python"
COMFYUI="$SERVERS/comfyui"
MODEL_DIR="$COMFYUI/models/checkpoints"

echo ""
echo "=== NodeWeaver: ComfyUI Setup ==="
echo ""

# ── 1. Clone ComfyUI ─────────────────────────────────────────────────────────

if [ ! -d "$COMFYUI" ]; then
  echo "Cloning ComfyUI (shallow)…"
  git clone --depth=1 https://github.com/comfyanonymous/ComfyUI "$COMFYUI"
  echo "Done."
else
  echo "ComfyUI already present — skipping clone."
fi

# ── 2. Install Python dependencies ───────────────────────────────────────────

echo ""
echo "Installing ComfyUI Python requirements into venv…"
"$PYTHON" -m pip install -r "$COMFYUI/requirements.txt" -q
echo "Done."

# ── 3. Download default portrait model (~2 GB, one-time) ─────────────────────

mkdir -p "$MODEL_DIR"
MODEL_FILE="$MODEL_DIR/v1-5-pruned-emaonly.safetensors"

if [ -f "$MODEL_FILE" ]; then
  echo ""
  echo "Default model already present — skipping download."
else
  echo ""
  echo "Downloading Stable Diffusion 1.5 portrait model (~2 GB)…"
  echo "This is a one-time download — grab a coffee."
  echo ""
  "$PYTHON" - "$MODEL_DIR" <<'PYEOF'
import sys, os
model_dir = sys.argv[1]
try:
    from huggingface_hub import hf_hub_download
    hf_hub_download(
        repo_id="runwayml/stable-diffusion-v1-5",
        filename="v1-5-pruned-emaonly.safetensors",
        local_dir=model_dir,
        local_dir_use_symlinks=False,
    )
    print("Model downloaded successfully.")
except Exception as e:
    print(f"Auto-download failed: {e}")
    print()
    print("No problem — place any .safetensors or .ckpt checkpoint manually into:")
    print(f"  {model_dir}/")
    print("and NodeWeaver will pick it up automatically.")
PYEOF
fi

echo ""
echo "=== ComfyUI setup complete! ==="
echo ""
echo "NodeWeaver will auto-start ComfyUI when you generate a portrait."
echo "Portrait models live in:"
echo "  $MODEL_DIR"
echo "Drop any .safetensors checkpoint there to swap models."
echo ""
