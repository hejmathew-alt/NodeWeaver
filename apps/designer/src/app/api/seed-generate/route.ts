import { NextRequest, NextResponse } from 'next/server';
import { buildSeedGenerateSystem, buildSeedGenerateUser } from '@/lib/ai-prompts';

export const runtime = 'nodejs';

interface LockedState {
  premise: string | null;
  characters: { name: string; role: string; wound: string; want: string }[];
  worldFacts: string[];
  genre: string;
}

interface SeedGenerateRequest {
  type: 'premise' | 'premises' | 'cast' | 'architecture';
  conversationSummary: string;
  lockedState: LockedState;
  anthropicKey?: string;
}

export async function POST(req: NextRequest) {
  const body: SeedGenerateRequest | null = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const { type, conversationSummary, lockedState, anthropicKey: clientKey } = body;

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || clientKey?.trim();
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'No Anthropic API key — add ANTHROPIC_API_KEY to .env.local or enter one in Settings.' },
      { status: 400 },
    );
  }

  const systemPrompt = buildSeedGenerateSystem(type, lockedState);
  const userMessage = buildSeedGenerateUser(type, conversationSummary, lockedState);

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: false,
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

  const result = await anthropicRes.json().catch(() => null);
  const text = (result as { content?: { text?: string }[] })?.content?.[0]?.text ?? '';

  // Strip markdown fences and extract JSON
  const cleaned = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```$/im, '').trim();
  const jsonMatch = /\{[\s\S]*\}/.exec(cleaned);
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;

  try {
    const parsed = JSON.parse(jsonStr);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: `Failed to parse ${type} response.` }, { status: 500 });
  }
}
