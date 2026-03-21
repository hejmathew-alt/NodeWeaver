import { NextRequest, NextResponse } from 'next/server';
import type { ArtStyle } from '@nodeweaver/engine';
import {
  checkComfyUIHealth,
  buildPortraitWorkflow,
  buildFullPrompt,
  generatePortrait,
} from '@/lib/comfyui';
import {
  ensureComfyUIReady,
  findDefaultModel,
  COMFYUI_BASE_URL,
} from '@/lib/comfyui-daemon';

const ALLOWED_COMFYUI_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?(\/|$)/;

/** Returns true if the URL is a local/LAN address (safe to forward requests to). */
function isAllowedComfyUrl(url: string): boolean {
  try {
    // Ensure it parses as a valid URL first
    new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_COMFYUI_HOST.test(url);
}

export async function POST(req: NextRequest) {
  let body: {
    prompt: string;
    artStyle?: ArtStyle;
    seed?: number;
    comfyuiUrl?: string;
    comfyuiModel?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prompt, artStyle = 'realistic', comfyuiModel } = body;
  const comfyuiUrl = body.comfyuiUrl || COMFYUI_BASE_URL;

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  if (!isAllowedComfyUrl(comfyuiUrl)) {
    return NextResponse.json(
      { error: 'comfyuiUrl must be a localhost or LAN address' },
      { status: 400 },
    );
  }

  // Auto-start the managed daemon when using the default local URL
  const isManagedLocal =
    comfyuiUrl.includes('localhost:8188') ||
    comfyuiUrl.includes('127.0.0.1:8188') ||
    comfyuiUrl === COMFYUI_BASE_URL;

  if (isManagedLocal) {
    try {
      await ensureComfyUIReady();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Could not start ComfyUI: ${msg}` },
        { status: 503 },
      );
    }
  } else {
    // Non-managed local/LAN URL — just health-check
    const healthy = await checkComfyUIHealth(comfyuiUrl);
    if (!healthy) {
      return NextResponse.json(
        { error: `ComfyUI not reachable at ${comfyuiUrl}` },
        { status: 503 },
      );
    }
  }

  // Resolve seed
  const seed = body.seed ?? Math.floor(Math.random() * 2 ** 31);

  // Model: explicit setting → auto-detected first file → let ComfyUI decide
  const model = comfyuiModel?.trim() || findDefaultModel() || '';

  // Build full prompt with art style prefix
  const fullPrompt = buildFullPrompt(prompt.trim(), artStyle);

  // Build and run workflow
  const workflow = buildPortraitWorkflow(fullPrompt, seed, model);

  try {
    const pngBuffer = await generatePortrait(comfyuiUrl, workflow);
    return new NextResponse(pngBuffer, {
      headers: {
        'content-type': 'image/png',
        'x-used-seed': String(seed),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
