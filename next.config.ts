import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-eu.ssl-images-amazon.com" },
      { protocol: "https", hostname: "rukminim1.flixcart.com" },
      { protocol: "https", hostname: "rukminim2.flixcart.com" },
      { protocol: "https", hostname: "**.flixcart.com" },
      { protocol: "https", hostname: "**.media-amazon.com" },
    ],
  },
  // The blog reads markdown from disk at build time, and the sitemap reads the
  // same folder at request time. Keep those files in the serverless bundle.
  outputFileTracingIncludes: {
    "/sitemap.xml": ["./content/blog/**/*.md"],
    "/blog/**": ["./content/blog/**/*.md"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
