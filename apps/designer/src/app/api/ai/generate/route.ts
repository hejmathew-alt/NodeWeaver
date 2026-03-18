import { NextRequest, NextResponse } from 'next/server';
import { AI_MAX_TOKENS, AI_MAX_TOKENS_DEFAULT } from '@/lib/constants';
import { buildSystemPrompt, buildUserMessage, NON_STREAMING_MODES } from '@/lib/ai-prompts';

export const runtime = 'nodejs';

interface GenerateRequest {
  mode: string;
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

  const systemPrompt = buildSystemPrompt(mode, prompt, context);
  const userMessage = buildUserMessage(mode, prompt, context);
  const isNonStreaming = NON_STREAMING_MODES.includes(mode);
  const maxTokens = AI_MAX_TOKENS[mode] ?? AI_MAX_TOKENS_DEFAULT;

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
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: !isNonStreaming,
      }),
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach Anthropic API.' }, { status: 503 });
  }

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({}));
    const msg =
      (err as { error?: { message?: string } }).error?.message ?? `HTTP ${anthropicRes.status}`;
    return NextResponse.json({ error: msg }, { status: anthropicRes.status });
  }

  // Non-streaming modes
  if (isNonStreaming) {
    const result = await anthropicRes.json().catch(() => null);
    const text = (result as { content?: { text?: string }[] })?.content?.[0]?.text ?? '';
    if (mode === 'story-gen') return NextResponse.json({ story: text });
    if (mode === 'avatar-prompt') return NextResponse.json({ text: text.trim() });
    // Strip markdown fences Claude sometimes adds despite being told not to
    const cleaned = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim();
    if (mode === 'command-interpret') return NextResponse.json({ command: cleaned });
    if (mode === 'world-step' || mode === 'world-recycle') return NextResponse.json({ world: cleaned });
    return NextResponse.json({ suggestions: cleaned });
  }

  if (!anthropicRes.body) {
    return NextResponse.json({ error: 'No response body' }, { status: 502 });
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
