import { NextRequest, NextResponse } from 'next/server';
import * as http from 'node:http';
import { ensureQwenReady } from '@/lib/qwen-daemon';

const QWEN_HOST = '127.0.0.1';
const QWEN_PORT = 7862;

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
    const bodyStr = JSON.stringify(body);

    // Use node:http directly — no undici body timeout
    const nodeStream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const httpReq = http.request(
        {
          hostname: QWEN_HOST,
          port: QWEN_PORT,
          path: '/stream',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(bodyStr),
          },
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Qwen stream returned ${res.statusCode}`));
            res.destroy();
          } else {
            resolve(res);
          }
        }
      );
      httpReq.on('error', reject);
      httpReq.write(bodyStr);
      httpReq.end();
    });

    // Close Qwen connection when the client aborts (character switch, stop, etc.)
    req.signal.addEventListener('abort', () => nodeStream.destroy(), { once: true });

    // Wrap the Node.js readable in a Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', () => controller.close());   // closed by abort → just close cleanly
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return new NextResponse(webStream, {
      headers: { 'content-type': 'application/octet-stream' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Qwen server unreachable.' },
      { status: 503 }
    );
  }
}
