import { readFileSync } from 'fs';
import { resolve } from 'path';

export const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000';

/** Parse .env.local to get API keys for integration tests */
function loadEnvLocal(): Record<string, string> {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#\s][^=]*)=(.*)$/);
      if (match) vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
    return vars;
  } catch {
    return {};
  }
}

const _env = loadEnvLocal();
export const ELEVENLABS_KEY: string = _env.ELEVENLABS_API_KEY ?? '';

/** Generate a unique ID for a test story that won't collide with real stories */
export function makeTestStoryId(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Build a minimal valid NWVStory for API tests */
export function makeTestStory(id: string) {
  const now = new Date().toISOString();
  return {
    id,
    title: 'NW Automated Test Story',
    genre: 'sci-fi',
    nodes: [
      {
        id: 'node_start',
        type: 'start',
        title: 'Start',
        blocks: [],
        choices: [{ id: 'choice_begin', label: 'Begin', next: 'node_scene_1' }],
        position: { x: 0, y: 0 },
        status: 'draft',
      },
      {
        id: 'node_scene_1',
        type: 'story',
        title: 'Test Scene',
        blocks: [
          {
            id: 'block_1',
            type: 'prose',
            text: 'This is an automated test scene.',
            characterId: 'narrator',
          },
        ],
        body: 'This is an automated test scene.',
        choices: [],
        position: { x: 300, y: 0 },
        status: 'draft',
      },
    ],
    characters: [
      {
        id: 'narrator',
        name: 'Narrator',
        role: 'Omniscient story narrator',
        backstory: '',
        traits: [],
        qwenInstruct: 'Speak clearly and with gravitas.',
        ttsProvider: 'qwen',
      },
    ],
    lanes: [],
    enemies: {},
    metadata: {
      title: 'NW Automated Test Story',
      genre: 'sci-fi',
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** Build a minimal valid 44-byte WAV buffer (no audio data — headers only) */
export function makeMinimalWav(): Buffer {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36, 4);       // file size - 8
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);      // chunk size
  buf.writeUInt16LE(1, 20);       // PCM format
  buf.writeUInt16LE(1, 22);       // 1 channel (mono)
  buf.writeUInt32LE(44100, 24);   // sample rate
  buf.writeUInt32LE(88200, 28);   // byte rate
  buf.writeUInt16LE(2, 32);       // block align
  buf.writeUInt16LE(16, 34);      // bits per sample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(0, 40);       // 0 data bytes
  return buf;
}

/** Check whether a local service is reachable */
export async function isServiceUp(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
