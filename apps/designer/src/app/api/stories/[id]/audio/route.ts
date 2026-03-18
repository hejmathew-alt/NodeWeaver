import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}

function audioPath(storyId: string, filename: string) {
  return path.join(DATA_DIR, safeId(storyId), '_audio', path.basename(filename));
}

async function ensureAudioDir(storyId: string) {
  await fs.mkdir(path.join(DATA_DIR, safeId(storyId), '_audio'), { recursive: true });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });
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
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });
  await ensureAudioDir(id);
  const buf = Buffer.from(await req.arrayBuffer());
  await fs.writeFile(audioPath(id, filename), buf);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });
  try {
    await fs.unlink(audioPath(id, filename));
  } catch {
    // ignore missing
  }
  return NextResponse.json({ ok: true });
}
