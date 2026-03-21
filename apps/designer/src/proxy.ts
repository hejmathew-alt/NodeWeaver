/**
 * Next.js proxy — CORS / origin guard.
 *
 * NodeWeaver is a local-only tool. All API requests must originate from:
 *   - The same machine (localhost / 127.0.0.1)
 *   - The local network (192.168.x.x) for iPad access over LAN
 *
 * Requests with no Origin header (curl, server-to-server, same-origin) are
 * always allowed — browsers always send Origin on cross-origin fetches.
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;

export default function proxy(req: NextRequest) {
  const origin = req.headers.get('origin');

  // No origin header → same-origin or non-browser request → allow
  if (!origin) return NextResponse.next();

  if (!ALLOWED_ORIGIN.test(origin)) {
    return NextResponse.json(
      { error: 'Forbidden: origin not allowed' },
      { status: 403 },
    );
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const res = NextResponse.next();
  res.headers.set('Access-Control-Allow-Origin', origin);
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
