import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Cap uploads at 50 MB — audio files are typically <5 MB; this prevents DoS via huge uploads.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
// Next.js App Router body size limit (applies to PUT/POST)
export const config = { api: { bodyParser: { sizeLimit: '50mb' } } };

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}

/** Validates that a filename is a known audio/timestamp pattern before touching disk. */
function safeAudioFilename(filename: string): string | null {
  // Allow: tts_*, sfx_*, ambient_*, music_*, node_* (legacy), stream_* (cached stream timestamps)
  // Extensions: .wav, .mp3, .json
  const valid = /^(tts|sfx|ambient|music|node|stream)_[a-zA-Z0-9_\-]+\.(wav|mp3|json)$/.test(filename);
  return valid ? filename : null;
}

function audioPath(storyId: string, filename: string) {
  return path.join(DATA_DIR, safeId(storyId), '_audio', filename);
}

async function ensureAudioDir(storyId: string) {
  await fs.mkdir(path.join(DATA_DIR, safeId(storyId), '_audio'), { recursive: true });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAudioFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });
  try {
    const buf = await fs.readFile(audioPath(id, filename));
    const isJson = filename.endsWith('.json');
    const contentType = isJson
      ? 'application/json'
      : filename.endsWith('.mp3')
        ? 'audio/mpeg'
        : 'audio/wav';
    return new NextResponse(buf, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAudioFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });

  const ct = req.headers.get('content-type') ?? '';
  const isJson = filename.endsWith('.json');
  const allowed = isJson
    ? ct.startsWith('application/json') || ct.startsWith('text/plain')
    : ct.startsWith('audio/') || ct.startsWith('application/octet-stream');
  if (!allowed) {
    return NextResponse.json({ error: 'Invalid content-type for this file' }, { status: 415 });
  }

  await ensureAudioDir(id);
  const buf = Buffer.from(await req.arrayBuffer());
  // Atomic write: write to temp file then rename to avoid partial reads
  const target = audioPath(id, filename);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, target);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAudioFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });
  try {
    await fs.unlink(audioPath(id, filename));
  } catch {
    // ignore missing
  }
  return NextResponse.json({ ok: true });
}
