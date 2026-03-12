import { NextRequest, NextResponse } from 'next/server';
import { ensureQwenReady, QWEN_SPEAK_URL } from '@/lib/qwen-daemon';

export async function POST(req: NextRequest) {
  try {
    await ensureQwenReady();
  } catch (err) {
    return NextResponse.json(
      { error: `Qwen failed to start: ${err instanceof Error ? err.message : String(err)}` },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const res = await fetch(`${QWEN_SPEAK_URL}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Qwen server returned ${res.status}` },
        { status: res.status }
      );
    }

    const wav = await res.arrayBuffer();
    return new NextResponse(wav, {
      headers: { 'content-type': 'audio/wav' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Qwen server unreachable after startup.' },
      { status: 503 }
    );
  }
}
