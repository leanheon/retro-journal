import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext checks multipart requests before dispatching route handlers.
  // Allow an 8 MB image plus multipart headers; the upload route enforces 8 MB.
  experimental: { serverActions: { bodySizeLimit: '9mb' } },
};

export default nextConfig;
