import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the local @nodeweaver/engine workspace package
  // (symlinked via pnpm workspaces — Turbopack handles the TypeScript source)
  transpilePackages: ["@nodeweaver/engine"],
};

export default nextConfig;
