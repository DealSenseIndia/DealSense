import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { listProducts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url.replace(/\/$/, "");
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/deals`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/analyze`, changeFrequency: "weekly", priority: 0.7 },
  ];

  try {
    const products = await listProducts(500);
    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "daily",
      priority: 0.8,
    }));
    return [...staticRoutes, ...productRoutes];
  } catch {
    return staticRoutes;
  }
}
