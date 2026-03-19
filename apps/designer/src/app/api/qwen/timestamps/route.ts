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
    const res = await fetch(`${QWEN_SPEAK_URL}/timestamps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Qwen timestamps returned ${res.status}` },
        { status: res.status }
      );
    }

    const timestamps = await res.json();
    return NextResponse.json(timestamps);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Qwen timestamps unreachable.' },
      { status: 503 }
    );
  }
}
