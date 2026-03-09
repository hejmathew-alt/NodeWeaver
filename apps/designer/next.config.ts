import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local @void-runner/engine workspace package
  // (symlinked via pnpm workspaces — Turbopack handles the TypeScript source)
  transpilePackages: ["@void-runner/engine"],
};

export default nextConfig;
