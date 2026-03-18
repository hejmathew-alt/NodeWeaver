#!/bin/bash
cd "$(dirname "$0")/apps/designer"

echo "🧪 NodeWeaver Test Suite"
echo ""

# Start test server on port 4000 if not already running
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/stories 2>/dev/null | grep -q "200"; then
  echo "🚀 Starting test server on :4000..."
  pnpm test:serve &
  SERVER_PID=$!

  # Wait up to 30s for it to be ready
  for i in $(seq 1 30); do
    sleep 1
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/stories 2>/dev/null | grep -q "200"; then
      break
    fi
    if [ $i -eq 30 ]; then
      echo "❌ Test server failed to start after 30s. Check for errors above."
      read -p "Press Enter to exit..."
      exit 1
    fi
  done
  echo "✓ Test server ready on :4000"
else
  echo "✓ Test server already running on :4000"
  SERVER_PID=""
fi
echo ""

# Install playwright browser if needed
if ! ls "$HOME/Library/Caches/ms-playwright/chromium-"*/chrome-mac/Chromium.app 2>/dev/null | head -1 | grep -q "Chromium"; then
  echo "📥 Installing Playwright Chromium (first time only)..."
  npx playwright install chromium
  echo ""
fi

echo "▶ Running unit tests..."
pnpm test:unit
echo ""

echo "▶ Running integration tests..."
pnpm test:integration
echo ""

echo "▶ Running E2E tests..."
pnpm test:e2e
echo ""

echo "📋 Generating report..."
pnpm test:report
echo ""

# Stop the server if we started it
if [ -n "$SERVER_PID" ]; then
  echo "🛑 Stopping test server..."
  kill $SERVER_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Report saved → apps/designer/test-results/report.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Open report in default app
open test-results/report.md

read -p "Press Enter to close..."
