import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}

function avatarPath(storyId: string, filename: string) {
  return path.join(DATA_DIR, safeId(storyId), '_avatars', path.basename(filename));
}

async function ensureAvatarDir(storyId: string) {
  await fs.mkdir(path.join(DATA_DIR, safeId(storyId), '_avatars'), { recursive: true });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });
  try {
    const buf = await fs.readFile(avatarPath(id, filename));
    return new NextResponse(buf, {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'no-cache',
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
  await ensureAvatarDir(id);
  const buf = Buffer.from(await req.arrayBuffer());
  await fs.writeFile(avatarPath(id, filename), buf);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) return NextResponse.json({ error: 'Missing file param' }, { status: 400 });
  try {
    await fs.unlink(avatarPath(id, filename));
  } catch {
    // ignore missing
  }
  return NextResponse.json({ ok: true });
}
