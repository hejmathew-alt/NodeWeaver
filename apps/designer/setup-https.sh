#!/usr/bin/env bash
# setup-https.sh — Generate a locally-trusted TLS certificate for NodeWeaver
# Run this once, or re-run whenever your LAN IP changes.
#
# After running:
#   1. Restart the dev server  (pnpm dev / launch NodeWeaver.command)
#   2. Access from Mac:  https://localhost:3000
#   3. Access from iPad: https://192.168.x.x:3000
#      (see iPad trust instructions printed at the end)

set -e

CERTS_DIR="$(dirname "$0")/certs"

# ── 1. Install mkcert ─────────────────────────────────────────────────────────
if ! command -v mkcert &>/dev/null; then
  echo "📦  Installing mkcert via Homebrew…"
  brew install mkcert
fi

# ── 2. Install the local CA (prompts for system password once) ────────────────
echo "🔐  Installing local Certificate Authority (may ask for your Mac password)…"
mkcert -install

# ── 3. Detect current LAN IP ──────────────────────────────────────────────────
LAN_IP=$(ipconfig getifaddr en1 2>/dev/null \
      || ipconfig getifaddr en0 2>/dev/null \
      || echo "")

if [ -z "$LAN_IP" ]; then
  echo "⚠️   Could not detect LAN IP — cert will cover localhost only."
  echo "    Reconnect to Wi-Fi / Ethernet and re-run this script to add LAN support."
  HOSTS="localhost 127.0.0.1 ::1"
else
  echo "🌐  Detected LAN IP: $LAN_IP"
  HOSTS="localhost 127.0.0.1 ::1 $LAN_IP"
fi

# ── 4. Generate certificate ───────────────────────────────────────────────────
mkdir -p "$CERTS_DIR"

mkcert \
  -key-file  "$CERTS_DIR/key.pem" \
  -cert-file "$CERTS_DIR/cert.pem" \
  $HOSTS

echo ""
echo "✅  Certificate written to apps/designer/certs/"
echo ""

# ── 5. iPad trust instructions ────────────────────────────────────────────────
CA_ROOT=$(mkcert -CAROOT)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  iPad trust setup (one-time)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Root CA is at:"
echo "  $CA_ROOT/rootCA.pem"
echo ""
echo "  Steps:"
echo "  1. AirDrop  $CA_ROOT/rootCA.pem  to your iPad"
echo "  2. On iPad → Settings → General → VPN & Device Management"
echo "     → tap the downloaded profile → Install"
echo "  3. iPad → Settings → General → About"
echo "     → Certificate Trust Settings → enable 'mkcert …'"
echo ""
echo "  Then open  https://$LAN_IP:3000  in Safari on iPad."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Restart the dev server to pick up the new certificate."
echo ""
