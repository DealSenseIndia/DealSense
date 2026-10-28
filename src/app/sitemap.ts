import type { MetadataRoute } from "next";
import { site } from "@/lib/config";
import { listProducts } from "@/lib/db/queries";
import { listCategoryPages } from "@/lib/db/categoryPages";
import { listBrandPages } from "@/lib/db/brandPages";
import { getAllPosts } from "@/lib/blog";
import { setupGuidePaths } from "@/lib/setups/seo";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url.replace(/\/$/, "");
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/deals`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/live`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/setups`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/brands`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/price-history`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/analyze`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ];

  // The room guides and the journal are constants of the build, not of the
  // database, so they are always listed even if the catalogue read fails.
  const setupRoutes: MetadataRoute.Sitemap = setupGuidePaths().map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "daily",
    priority: 0.85,
  }));
  const blogRoutes: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(`${post.updated ?? post.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  try {
    const [products, categories, brands] = await Promise.all([
      listProducts(5000),
      listCategoryPages(),
      listBrandPages(),
    ]);
    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "daily",
      priority: 0.8,
    }));
    const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${base}/categories/${c.slug}`,
      changeFrequency: "daily",
      priority: 0.75,
    }));
    const brandRoutes: MetadataRoute.Sitemap = brands.map((b) => ({
      url: `${base}/brands/${b.slug}`,
      changeFrequency: "daily",
      priority: 0.7,
    }));
    return [
      ...staticRoutes,
      ...setupRoutes,
      ...blogRoutes,
      ...categoryRoutes,
      ...brandRoutes,
      ...productRoutes,
    ];
  } catch {
    return [...staticRoutes, ...setupRoutes, ...blogRoutes];
  }
}
