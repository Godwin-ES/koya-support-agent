import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright e2e suite (tests/e2e/) runs the dev server on 127.0.0.1
  // and drives it from the same host - Next.js 16 blocks cross-origin dev
  // requests (HMR, RSC) by default, which silently breaks client-side JS
  // in exactly that setup without this.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
