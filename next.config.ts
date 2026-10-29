import type { NextConfig } from "next";
import productRedirects from "./data/product-redirects.json";

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
      { protocol: "https", hostname: "assets.myntassets.com" },
      { protocol: "https", hostname: "images-static.nykaa.com" },
      { protocol: "https", hostname: "cdn.fcglcdn.com" },
      { protocol: "https", hostname: "www.libas.in" },
      { protocol: "https", hostname: "img.tatacliq.com" },
      { protocol: "https", hostname: "assets.ajio.com" },
      { protocol: "https", hostname: "images.biba.in" },
      { protocol: "https", hostname: "cdn.jiostore.online" },
    ],
  },
  // The blog reads markdown from disk at build time, and the sitemap reads the
  // same folder at request time. Keep those files in the serverless bundle.
  outputFileTracingIncludes: {
    "/sitemap.xml": ["./content/blog/**/*.md"],
    "/blog/**": ["./content/blog/**/*.md"],
    // Product and category pages read journal front matter for related posts.
    "/product/**": ["./content/blog/**/*.md"],
    "/categories/**": ["./content/blog/**/*.md"],
  },
  // Leaves that were merged into their canonical name keep their old URLs.
  async redirects() {
    return [
      ...productRedirects,
      { source: "/categories/traditional-laptops", destination: "/categories/laptops", permanent: true },
      { source: "/categories/in-ear", destination: "/categories/earbuds", permanent: true },
      { source: "/categories/smartwatches", destination: "/categories/smart-watches", permanent: true },
      { source: "/categories/induction-cooktop", destination: "/categories/induction-cooktops", permanent: true },
    ];
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
