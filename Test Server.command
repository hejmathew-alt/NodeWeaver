#!/bin/bash
cd "$(dirname "$0")"
echo "🧪 Starting NodeWeaver test server on http://localhost:4000 ..."
echo ""
cd apps/designer && pnpm test:serve
