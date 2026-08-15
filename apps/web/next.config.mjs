/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Where the build is written.
   *
   * `next build` empties and rewrites this directory in place, and the running
   * `next start` reads its chunks from it lazily — so a build that dies
   * halfway leaves the *live* site serving HTML whose stylesheets no longer
   * exist. That is not hypothetical: it happened in production, and the site
   * came back as unstyled text.
   *
   * The deploy therefore builds into a scratch directory and swaps it in only
   * once the build succeeded (ops/deploy.sh). Unset — every local `next dev`
   * and `next start` — this stays `.next`, exactly as before.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // game-config ships TypeScript-built CJS from the workspace; Next needs to
  // run it through its own compiler pipeline.
  transpilePackages: ['@ambervale/game-config'],
  eslint: {
    // Linting is a root-level concern (`pnpm lint`), not part of `next build`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
