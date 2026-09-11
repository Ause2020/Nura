import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  images: {
    // 15.5.24 already disables AVIF optimization; keep it off as defense in depth.
    formats: ["image/webp"],
  },
};

export default nextConfig;
