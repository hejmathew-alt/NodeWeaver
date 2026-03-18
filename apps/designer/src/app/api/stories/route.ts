import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function GET() {
  await ensureDataDir();
  let files: string[];
  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return NextResponse.json([]);
  }
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const stories = await Promise.all(
    jsonFiles.map(async (f) => {
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf-8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }),
  );
  const valid = stories.filter(Boolean);
  valid.sort((a, b) =>
    (b.metadata?.updatedAt ?? '') > (a.metadata?.updatedAt ?? '') ? 1 : -1,
  );
  return NextResponse.json(valid);
}

export async function POST(req: NextRequest) {
  await ensureDataDir();
  const story = await req.json();
  if (!story?.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const filePath = path.join(DATA_DIR, `${safeId(story.id)}.json`);
  await fs.writeFile(filePath, JSON.stringify(story, null, 2), 'utf-8');
  return NextResponse.json({ id: story.id }, { status: 201 });
}

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '');
}
