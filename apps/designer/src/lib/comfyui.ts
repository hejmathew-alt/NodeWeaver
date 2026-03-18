/**
 * ComfyUI integration utilities.
 * ComfyUI is an external process — we never spawn it, just communicate via REST API.
 * API pattern: POST /prompt → get prompt_id → poll /history/{id} → fetch /view?filename=...
 */
import type { ArtStyle } from '@nodeweaver/engine';

// ── Art style prompt prefixes ─────────────────────────────────────────────────

export const ART_STYLE_LABELS: Record<ArtStyle, string> = {
  realistic:    'Realistic',
  illustrated:  'Illustrated',
  manga:        'Manga / Anime',
  graphic_novel:'Graphic Novel',
  dark_fantasy: 'Dark Fantasy',
  ink_sketch:   'Ink Sketch',
  pixel_art:    'Pixel Art',
  chibi:        'Chibi',
};

const STYLE_PREFIXES: Record<ArtStyle, string> = {
  realistic:    'photorealistic portrait, dramatic studio lighting, detailed skin texture, 8k uhd',
  illustrated:  'illustrated character portrait, painterly digital art, concept art style, detailed',
  manga:        'manga art portrait, anime style, clean linework, cel shaded, detailed character design',
  graphic_novel:'graphic novel portrait, dark illustration, comic book style, ink and color',
  dark_fantasy: 'dark fantasy oil painting portrait, dramatic atmosphere, hyper detailed, moody lighting',
  ink_sketch:   'ink sketch portrait, fine linework, cross hatching, pencil drawing, detailed illustration',
  pixel_art:    'pixel art portrait, 16-bit retro game style, detailed pixels, game sprite',
  chibi:        'chibi character portrait, cute anime style, big eyes, simplified features, pastel colors',
};

const NEGATIVE_PROMPT =
  'blurry, deformed, ugly, watermark, text, logo, low quality, bad anatomy, extra limbs, disfigured, out of frame, full body, whole body, standing, legs, feet, wide shot, long shot';

// ── Health check ─────────────────────────────────────────────────────────────

export async function checkComfyUIHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Workflow builder ──────────────────────────────────────────────────────────

export function buildPortraitWorkflow(
  positivePrompt: string,
  seed: number,
  modelName: string,
): Record<string, unknown> {
  const ckpt = modelName.trim() || 'v1-5-pruned-emaonly.safetensors';
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: ckpt },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: positivePrompt,
        clip: ['1', 1],
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: NEGATIVE_PROMPT,
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 512, height: 512, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 20,
        cfg: 7,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1.0,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],
      },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'nw_avatar',
        images: ['6', 0],
      },
    },
  };
}

// ── Portrait generation ───────────────────────────────────────────────────────

interface ComfyImage {
  filename: string;
  subfolder: string;
  type: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyImage[] }>;
}

/**
 * Sends a workflow to ComfyUI, polls until complete, returns the PNG bytes.
 * Throws on timeout (90s) or if ComfyUI returns an error.
 */
export async function generatePortrait(
  comfyuiUrl: string,
  workflow: Record<string, unknown>,
): Promise<ArrayBuffer> {
  const clientId = crypto.randomUUID();

  // 1. Queue the prompt
  const queueRes = await fetch(`${comfyuiUrl}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!queueRes.ok) {
    const body = await queueRes.text().catch(() => `HTTP ${queueRes.status}`);
    throw new Error(`ComfyUI queue error: ${body}`);
  }
  const { prompt_id } = (await queueRes.json()) as { prompt_id: string };

  // 2. Poll history until complete (max 90s)
  const deadline = Date.now() + 90_000;
  let outputImages: ComfyImage[] | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const histRes = await fetch(`${comfyuiUrl}/history/${prompt_id}`);
    if (!histRes.ok) continue;
    const hist = (await histRes.json()) as Record<string, ComfyHistoryEntry>;
    const entry = hist[prompt_id];
    if (!entry) continue;
    // Detect ComfyUI execution errors immediately — don't wait out the full 90s deadline
    const status = (entry as { status?: { status_str?: string; messages?: [string, Record<string, unknown>][] } }).status;
    if (status?.status_str === 'error') {
      const errMsg = status.messages?.find(([t]) => t === 'execution_error')?.[1];
      const detail = (errMsg as { exception_message?: string } | undefined)?.exception_message ?? 'unknown error';
      const nodeType = (errMsg as { node_type?: string } | undefined)?.node_type ?? '?';
      throw new Error(`ComfyUI execution error (${nodeType}): ${detail.trim()}`);
    }
    // Find output images from any node
    for (const nodeOut of Object.values(entry.outputs ?? {})) {
      if (nodeOut.images && nodeOut.images.length > 0) {
        outputImages = nodeOut.images;
        break;
      }
    }
    if (outputImages) break;
  }

  if (!outputImages || outputImages.length === 0) {
    throw new Error('ComfyUI generation timed out or produced no output.');
  }

  // 3. Fetch the PNG
  const img = outputImages[0];
  const viewUrl = `${comfyuiUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder ?? '')}&type=${encodeURIComponent(img.type ?? 'output')}&format=png`;
  const imgRes = await fetch(viewUrl);
  if (!imgRes.ok) throw new Error(`ComfyUI view error: HTTP ${imgRes.status}`);
  return imgRes.arrayBuffer();
}

// ── Full prompt builder ───────────────────────────────────────────────────────

export function buildFullPrompt(characterPrompt: string, artStyle: ArtStyle): string {
  const prefix = STYLE_PREFIXES[artStyle] ?? STYLE_PREFIXES.realistic;
  return `headshot, close-up portrait, face and shoulders, ${prefix}, ${characterPrompt}`;
}
