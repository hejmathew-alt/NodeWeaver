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

/** True when the URL points to the local managed instance. */
function isLocalUrl(url: string): boolean {
  return (
    url.includes('localhost:8188') ||
    url.includes('127.0.0.1:8188') ||
    url === COMFYUI_BASE_URL
  );
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

  // Auto-start the managed daemon when using the default local URL
  if (isLocalUrl(comfyuiUrl)) {
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
    // External URL — just health-check
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
