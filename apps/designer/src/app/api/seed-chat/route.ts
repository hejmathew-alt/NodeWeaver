import { NextRequest, NextResponse } from 'next/server';
import { buildSeedChatSystem } from '@/lib/ai-prompts';

export const runtime = 'nodejs';

interface SeedChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LockedState {
  premise: string | null;
  characters: { name: string; role: string; wound: string; want: string }[];
  worldFacts: string[];
  genre: string;
}

interface SeedChatRequest {
  phase: 'spark' | 'premise' | 'cast' | 'architecture';
  history: SeedChatMessage[];
  locked: LockedState;
  message: string;
  anthropicKey?: string;
}

export async function POST(req: NextRequest) {
  const body: SeedChatRequest | null = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { phase, history, locked, message, anthropicKey: clientKey } = body;

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || clientKey?.trim();
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key — add ANTHROPIC_API_KEY to .env.local or enter one in Settings.' },
      { status: 400 },
    );
  }

  const systemPrompt = buildSeedChatSystem(phase, locked);

  // Build messages array: history + new user message
  const messages: SeedChatMessage[] = [
    ...history,
    { role: 'user', content: message },
  ];

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
        max_tokens: 500,
        system: systemPrompt,
        messages,
        stream: true,
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
