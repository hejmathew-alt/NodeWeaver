import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}

function storyPath(id: string) {
  return path.join(DATA_DIR, `${safeId(id)}.json`);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const raw = await fs.readFile(storyPath(id), 'utf-8');
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  await fs.mkdir(DATA_DIR, { recursive: true });
  const story = await req.json();
  await fs.writeFile(storyPath(id), JSON.stringify(story, null, 2), 'utf-8');
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const safe = safeId(id);
  try {
    await fs.unlink(storyPath(id));
  } catch {
    // ignore missing file
  }
  try {
    // Remove the story's audio directory if it exists
    await fs.rm(path.join(DATA_DIR, safe), { recursive: true, force: true });
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: true });
}
