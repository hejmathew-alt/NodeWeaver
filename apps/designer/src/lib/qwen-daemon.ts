/**
 * Qwen TTS daemon manager for the Narrative Designer.
 *
 * Module-level singleton — persists across Next.js API route calls in dev mode.
 *
 * Priority:
 *  1. If Qwen is already responding on port 7862 (started externally), use it.
 *  2. Otherwise, spawn servers/qwen_server.py using servers/venv and wait for "Listening on".
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

const QWEN_PORT   = 7862;
const QWEN_URL    = `http://127.0.0.1:${QWEN_PORT}`;
const QWEN_PYTHON = path.join(os.homedir(), 'Documents/NodeWeaver/servers/venv/bin/python');
const QWEN_SCRIPT = path.join(os.homedir(), 'Documents/NodeWeaver/servers/qwen_server.py');

// ── Singleton state ──────────────────────────────────────────────────────────

let _ready  = false;
let _proc: ChildProcess | null = null;
let _starting: Promise<void> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the Qwen server is up and answering on /health. */
async function isAlreadyUp(): Promise<boolean> {
  try {
    const res = await fetch(`${QWEN_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Kill any stale process occupying QWEN_PORT by probing with a TCP connection.
 *  Uses only Node.js net — no shell interpolation. */
function freePort(): Promise<void> {
  return new Promise((resolve) => {
    const probe = net.createConnection({ port: QWEN_PORT, host: '127.0.0.1' });
    probe.on('connect', () => {
      // Something is listening — destroy the probe and let the server handle it.
      // We don't kill the process here; if it's a stale crashed proc the OS will
      // have already cleaned it up. If it's alive, isAlreadyUp() will catch it.
      probe.destroy();
      resolve();
    });
    probe.on('error', () => {
      // Nothing on the port — good to go.
      resolve();
    });
  });
}

/** Spawn qwen_server.py; resolve when "Listening on" appears on stderr (socket bound). */
async function spawnAndWait(): Promise<void> {
  if (!fs.existsSync(QWEN_PYTHON)) {
    throw new Error(`Qwen venv not found at ${QWEN_PYTHON}`);
  }
  if (!fs.existsSync(QWEN_SCRIPT)) {
    throw new Error(`qwen_server.py not found at ${QWEN_SCRIPT}`);
  }

  // Free any stale process on the port before binding
  await freePort();

  console.log('[designer] Starting Qwen TTS daemon…');
  return new Promise((resolve, reject) => {
    _proc = spawn(QWEN_PYTHON, [QWEN_SCRIPT, String(QWEN_PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => reject(new Error('Qwen startup timed out')), 120_000);

    _proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      process.stderr.write(msg);
      if (msg.includes('Listening on')) {
        clearTimeout(timeout);
        _ready = true;
        console.log('[designer] Qwen TTS ready');
        resolve();
      }
    });

    _proc.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));

    _proc.on('exit', (code) => {
      _ready = false;
      _proc = null;
      _starting = null;
      console.log(`[designer] Qwen TTS exited (${code})`);
    });

    _proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensures the Qwen daemon is running and ready.
 * Safe to call concurrently — subsequent calls await the same promise.
 */
export async function ensureQwenReady(): Promise<void> {
  if (_ready) return;

  // Check if already up (e.g. started by the game server)
  if (await isAlreadyUp()) {
    _ready = true;
    return;
  }

  // Deduplicate concurrent calls
  if (_starting) return _starting;
  _starting = spawnAndWait().catch((err) => {
    _starting = null;
    throw err;
  });
  return _starting;
}

export const QWEN_SPEAK_URL = QWEN_URL;
