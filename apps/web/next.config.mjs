/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // game-config ships TypeScript-built CJS from the workspace; Next needs to
  // run it through its own compiler pipeline.
  transpilePackages: ['@ambervale/game-config'],
  eslint: {
    // Linting is a root-level concern (`pnpm lint`), not part of `next build`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
