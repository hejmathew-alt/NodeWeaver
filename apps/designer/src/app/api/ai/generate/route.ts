import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ── System prompts ────────────────────────────────────────────────────────────

const VOICE_SYSTEM = `You are a professional voice director specializing in text-to-speech voice design for audio dramas and interactive fiction.

Write a concise Qwen TTS instruct prompt (3–5 sentences) that reliably reproduces a specific vocal quality.

Rules:
- Describe pitch, timbre, age, accent/dialect, pacing, and emotional register
- Be specific and technical ("low, gravelly baritone" not "interesting sounding")
- Never mention the character's name, their backstory, or story plot — voice only
- End with "Studio-quality recording."
- Return only the instruct prompt, no preamble or explanation`;

const BODY_SYSTEM_BASE = `You are a narrative writer for an interactive fiction story.

Write or rewrite scene body text for story nodes in this style:
- Second-person present tense ("You step into…", "The door slides open…")
- Terse, evocative prose — vivid but not overwrought
- Grounded sensory details (light, sound, smell, texture)
- Match the tension and mood of surrounding scenes
- Do NOT include player choices, dialogue options, or meta-commentary
- Return only the scene text`;

const LINE_SYSTEM_BASE = `You are a dialogue writer for an interactive fiction story.

Write a single line of character dialogue:
- Write only the spoken words — no speech tags, no quotation marks, no action descriptions
- Match the character's role, personality, and speech patterns
- Keep it concise — 1–3 sentences maximum
- Match the tension and mood of the surrounding scene
- Use natural speech appropriate to the character's background
- Do NOT include stage directions, action beats, or meta-commentary
- Return only the dialogue text`;

// ── Route ─────────────────────────────────────────────────────────────────────

interface GenerateRequest {
  mode: 'voice' | 'body' | 'line';
  prompt: string;
  anthropicKey: string;
  context?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const body: GenerateRequest = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { mode, prompt, anthropicKey: clientKey, context } = body;

  // Prefer the key baked into .env.local (persists across browser sessions);
  // fall back to whatever the Settings panel supplied.
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || clientKey?.trim();

  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key — add ANTHROPIC_API_KEY to .env.local or enter one in Settings.' },
      { status: 400 },
    );
  }

  const systemPrompt =
    mode === 'voice' ? VOICE_SYSTEM :
    mode === 'line'  ? buildLineSystem(context) :
                       buildBodySystem(context);
  const userMessage =
    mode === 'voice'
      ? `Voice concept: ${prompt?.trim() || '(none — write a neutral narrator voice)'}`
      : mode === 'line'
      ? `Current line:\n${prompt?.trim() || '(empty)'}\n\nWrite a single line of dialogue for this character in this scene.`
      : `Current body text:\n${prompt?.trim() || '(empty)'}\n\nWrite improved or new body text for this scene.`;

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: mode === 'voice' ? 300 : mode === 'line' ? 200 : 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach Anthropic API.' }, { status: 503 });
  }

  if (!anthropicRes.ok || !anthropicRes.body) {
    const err = await anthropicRes.json().catch(() => ({}));
    const msg =
      (err as { error?: { message?: string } }).error?.message ?? `HTTP ${anthropicRes.status}`;
    return NextResponse.json({ error: msg }, { status: anthropicRes.status });
  }

  // Strip SSE envelope and stream raw text deltas to client
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (json === '[DONE]') continue;
            try {
              const evt = JSON.parse(json);
              if (
                evt.type === 'content_block_delta' &&
                evt.delta?.type === 'text_delta'
              ) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch { /* skip malformed SSE line */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

// ── Dynamic base builders (genre-aware) ──────────────────────────────────────

function dynamicBodyBase(ctx: Record<string, unknown>): string {
  const genre = ctx.genre as string | undefined;
  const title = ctx.storyTitle as string | undefined;
  const brief = ctx.genreBrief as string | undefined;
  const gameDesc = title ? `${title}, a ${genre ?? 'text'} RPG` : `a ${genre ?? 'text'} RPG`;

  let base = `You are a narrative writer for ${gameDesc}.

Write or rewrite scene body text for story nodes in this style:
- Second-person present tense ("You step into…", "The door slides open…")
- Terse, evocative prose — vivid but not overwrought
- Grounded sensory details (light, sound, smell, texture)
- Match the tension and mood of surrounding scenes
- Do NOT include player choices, dialogue options, or meta-commentary
- Return only the scene text`;

  if (brief) base += `\n\nGENRE VOICE: ${brief}`;
  return base;
}

function dynamicLineBase(ctx: Record<string, unknown>): string {
  const genre = ctx.genre as string | undefined;
  const title = ctx.storyTitle as string | undefined;
  const brief = ctx.genreBrief as string | undefined;
  const gameDesc = title ? `${title}, a ${genre ?? 'text'} RPG` : `a ${genre ?? 'text'} RPG`;

  let base = `You are a dialogue writer for ${gameDesc}.

Write a single line of character dialogue:
- Write only the spoken words — no speech tags, no quotation marks, no action descriptions
- Match the character's role, personality, and speech patterns
- Keep it concise — 1–3 sentences maximum
- Match the tension and mood of the surrounding scene
- Use natural speech appropriate to the character's background
- Do NOT include stage directions, action beats, or meta-commentary
- Return only the dialogue text`;

  if (brief) base += `\n\nGENRE VOICE: ${brief}`;
  return base;
}

// ── Story context builders ────────────────────────────────────────────────────

function buildLineSystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return LINE_SYSTEM_BASE;
  const base = dynamicLineBase(ctx);
  const parts: string[] = [];
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.nodeTitle)
    parts.push(`Scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`);
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (ctx.speakingCharacterName)
    parts.push(`Speaking character: "${ctx.speakingCharacterName}"${ctx.speakingCharacterRole ? ` — ${ctx.speakingCharacterRole}` : ''}`);
  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length) {
    const prev = ctx.prevNodes as { title: string; body: string }[];
    const summary = prev.map((p) => `"${p.title}": ${(p.body ?? '').slice(0, 150)}`).join('\n  ');
    parts.push(`Recent scenes leading here:\n  ${summary}`);
  }
  return parts.length ? `${base}\n\nCONTEXT:\n${parts.join('\n')}` : base;
}

function buildBodySystem(ctx?: Record<string, unknown>): string {
  if (!ctx) return BODY_SYSTEM_BASE;
  const base = dynamicBodyBase(ctx);
  const parts: string[] = [];
  if (ctx.logline) parts.push(`Logline: ${ctx.logline}`);
  if (ctx.targetTone) parts.push(`Tone: ${ctx.targetTone}`);
  if (ctx.nodeTitle)
    parts.push(
      `Current scene: "${ctx.nodeTitle}" [${ctx.nodeType ?? 'story'}${ctx.nodeLocation ? ` · ${ctx.nodeLocation}` : ''}]`,
    );
  if (ctx.nodeMood) parts.push(`Scene mood: ${ctx.nodeMood}`);
  if (Array.isArray(ctx.characters) && ctx.characters.length) {
    const chars = ctx.characters as { name: string; role: string }[];
    parts.push(`Characters on this path: ${chars.map((c) => `${c.name} (${c.role})`).join(', ')}`);
  }
  if (Array.isArray(ctx.prevNodes) && ctx.prevNodes.length) {
    const prev = ctx.prevNodes as { title: string; body: string }[];
    const summary = prev.map((p) => `"${p.title}": ${(p.body ?? '').slice(0, 150)}`).join('\n  ');
    parts.push(`Ancestral path (recent scenes leading here):\n  ${summary}`);
  }
  if (Array.isArray(ctx.siblings) && ctx.siblings.length) {
    const sibs = ctx.siblings as { title: string; type: string }[];
    parts.push(`Sibling branches: ${sibs.map((s) => `"${s.title}" [${s.type}]`).join(', ')}`);
  }
  if (Array.isArray(ctx.nextNodes) && ctx.nextNodes.length) {
    const next = ctx.nextNodes as { title: string; type: string }[];
    parts.push(`Leads to: ${next.map((n) => `"${n.title}" [${n.type}]`).join(', ')}`);
  }
  if (Array.isArray(ctx.twistNodes) && ctx.twistNodes.length) {
    const twists = ctx.twistNodes as { title: string; body?: string }[];
    parts.push(`Downstream twist anchors (write TOWARD these):\n  ${twists.map((t) => `"${t.title}"${t.body ? `: ${t.body}` : ''}`).join('\n  ')}`);
  }
  return parts.length ? `${base}\n\nSTORY CONTEXT:\n${parts.join('\n')}` : base;
}
