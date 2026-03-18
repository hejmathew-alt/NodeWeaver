import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Cap uploads at 10 MB — avatars are 512×512 PNG, typically <1 MB.
export const maxDuration = 30;
export const dynamic = 'force-dynamic';
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}

/** Validates that a filename matches the expected avatar pattern before touching disk. */
function safeAvatarFilename(filename: string): string | null {
  const valid = /^avatar-[a-zA-Z0-9_\-]+\.png$/.test(filename);
  return valid ? filename : null;
}

function avatarPath(storyId: string, filename: string) {
  return path.join(DATA_DIR, safeId(storyId), '_avatars', filename);
}

async function ensureAvatarDir(storyId: string) {
  await fs.mkdir(path.join(DATA_DIR, safeId(storyId), '_avatars'), { recursive: true });
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAvatarFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });
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
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAvatarFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });

  const ct = req.headers.get('content-type') ?? '';
  if (!ct.startsWith('image/png') && !ct.startsWith('application/octet-stream')) {
    return NextResponse.json({ error: 'Expected image/png' }, { status: 415 });
  }

  await ensureAvatarDir(id);
  const buf = Buffer.from(await req.arrayBuffer());
  // Atomic write: write to temp file then rename to avoid partial reads
  const target = avatarPath(id, filename);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, target);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get('file');
  const filename = raw ? safeAvatarFilename(raw) : null;
  if (!filename) return NextResponse.json({ error: 'Invalid or missing file param' }, { status: 400 });
  try {
    await fs.unlink(avatarPath(id, filename));
  } catch {
    // ignore missing
  }
  return NextResponse.json({ ok: true });
}
