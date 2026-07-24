import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Images are downscaled client-side before upload, but allow headroom for
    // the Server Action payload (default is 1MB, which a raw photo exceeds).
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
