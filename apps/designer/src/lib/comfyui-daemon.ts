/**
 * ComfyUI daemon manager for NodeWeaver.
 *
 * Auto-starts ComfyUI (from servers/comfyui/) on first portrait generation request.
 * Follows the same singleton pattern as qwen-daemon.ts and audiocraft-daemon.ts.
 *
 * Prerequisites: run `bash servers/setup-comfyui.sh` once to clone + install.
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

const COMFYUI_PORT   = 8188;
const COMFYUI_URL    = `http://127.0.0.1:${COMFYUI_PORT}`;
const COMFYUI_PYTHON = path.join(os.homedir(), 'Documents/NodeWeaver/servers/venv/bin/python');
const COMFYUI_SCRIPT = path.join(os.homedir(), 'Documents/NodeWeaver/servers/comfyui/main.py');
const COMFYUI_MODELS = path.join(os.homedir(), 'Documents/NodeWeaver/servers/comfyui/models/checkpoints');

// ── Singleton state ──────────────────────────────────────────────────────────

let _ready    = false;
let _proc: ChildProcess | null = null;
let _starting: Promise<void> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function isAlreadyUp(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFYUI_URL}/system_stats`, {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Probe COMFYUI_PORT with a TCP connection — no shell interpolation. */
function freePort(): Promise<void> {
  return new Promise((resolve) => {
    const probe = net.createConnection({ port: COMFYUI_PORT, host: '127.0.0.1' });
    probe.on('connect', () => { probe.destroy(); resolve(); });
    probe.on('error', () => resolve());
  });
}

/**
 * Returns the first model filename found in the checkpoints directory.
 * ComfyUI lazy-loads models at inference time, so no model = no error at startup.
 */
export function findDefaultModel(): string | null {
  try {
    const files = fs.readdirSync(COMFYUI_MODELS)
      .filter(f => f.endsWith('.safetensors') || f.endsWith('.ckpt'));
    return files[0] ?? null;
  } catch {
    return null;
  }
}

/** Poll /system_stats until ComfyUI is reachable or deadline passes. */
async function waitUntilReady(deadlineMs: number): Promise<boolean> {
  while (Date.now() < deadlineMs) {
    await new Promise(r => setTimeout(r, 1500));
    if (await isAlreadyUp()) return true;
  }
  return false;
}

async function spawnAndWait(): Promise<void> {
  if (!fs.existsSync(COMFYUI_PYTHON)) {
    throw new Error(
      'NodeWeaver venv not found. Run: pnpm install (or check servers/venv exists)',
    );
  }
  if (!fs.existsSync(COMFYUI_SCRIPT)) {
    throw new Error(
      'ComfyUI not installed. Run: bash servers/setup-comfyui.sh',
    );
  }

  await freePort();

  console.log('[designer] Starting ComfyUI daemon…');

  return new Promise<void>((resolve, reject) => {
    _proc = spawn(
      COMFYUI_PYTHON,
      [
        COMFYUI_SCRIPT,
        '--listen', '127.0.0.1',
        '--port', String(COMFYUI_PORT),
        '--preview-method', 'none',
        '--force-fp16',  // prevents BrokenPipeError on Apple Silicon MPS (fp16 ops have full MPS kernel coverage)
      ],
      {
        // Run from comfyui/ directory so it resolves relative model paths
        cwd: path.dirname(COMFYUI_SCRIPT),
        stdio: ['ignore', 'pipe', 'pipe'],
        // Explicit env whitelist — do not spread process.env to avoid leaking
        // API keys and other secrets into the ComfyUI subprocess.
        env: {
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
          // Allow MPS ops that lack native kernels to fall back to CPU
          // instead of raising BrokenPipeError / RuntimeError during KSampler
          PYTORCH_ENABLE_MPS_FALLBACK: '1',
        },
      },
    );

    let settled = false;
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      if (err) reject(err);
      else resolve();
    };

    // Hard 90s timeout (ComfyUI starts fast — only slow if something is wrong)
    const hardTimer = setTimeout(
      () => settle(new Error('ComfyUI startup timed out after 90s')),
      90_000,
    );

    _proc.stderr?.on('data', (c: Buffer) => process.stderr.write(c));
    _proc.stdout?.on('data', (c: Buffer) => process.stdout.write(c));

    _proc.on('error', (err) => settle(err));

    _proc.on('exit', (code) => {
      _ready = false;
      _proc = null;
      _starting = null;
      if (!settled) settle(new Error(`ComfyUI exited prematurely (code ${code})`));
      else console.log(`[designer] ComfyUI exited (${code})`);
    });

    // Poll /system_stats — more reliable than string-matching stdout
    const deadline = Date.now() + 85_000;
    waitUntilReady(deadline).then((up) => {
      if (up) {
        _ready = true;
        console.log('[designer] ComfyUI ready');
        settle();
      } else {
        settle(new Error('ComfyUI did not become ready in time'));
      }
    });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensures ComfyUI is running and ready.
 * Safe to call concurrently — subsequent calls await the same promise.
 */
export async function ensureComfyUIReady(): Promise<void> {
  if (_ready) return;

  if (await isAlreadyUp()) {
    _ready = true;
    return;
  }

  if (_starting) return _starting;
  _starting = spawnAndWait().catch((err) => {
    _starting = null;
    throw err;
  });
  return _starting;
}

export const COMFYUI_BASE_URL = COMFYUI_URL;
