import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";

/**
 * The blog is plain markdown on disk, rendered at build time.
 *
 * `export const dynamic = "force-static"` on the routes plus generateStaticParams
 * means these files are only ever read while building, so nothing here needs to
 * exist in the serverless bundle at request time — and a new article is simply a
 * new file and a deploy.
 */

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  tags: string[];
  /** Product slugs whose price history the article links into. */
  products: string[];
  /** Space keys whose room guide the article points at. */
  setups: string[];
  readingMinutes: number;
}

export interface BlogPost extends BlogPostMeta {
  html: string;
}

const DIR = path.join(process.cwd(), "content", "blog");
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/;

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text };
  const head = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, "");
  const meta: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body };
}

function build(slug: string, raw: string): BlogPost {
  const { meta, body } = splitFrontMatter(raw);
  const words = body.split(/\s+/).filter(Boolean).length;
  const html = marked.parse(body, { async: false, gfm: true }) as string;
  return {
    slug,
    title: meta.title ?? slug,
    description: meta.description ?? "",
    date: meta.date ?? "2026-10-01",
    updated: meta.updated,
    tags: list(meta.tags),
    products: list(meta.products),
    setups: list(meta.setups),
    readingMinutes: Math.max(2, Math.round(words / 200)),
    html,
  };
}

export function getAllPosts(): BlogPost[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const posts: BlogPost[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (!SLUG.test(slug)) continue;
    try {
      posts.push(build(slug, readFileSync(path.join(DIR, file), "utf8")));
    } catch {
      // One unreadable file must never take a product page down.
    }
  }
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Posts that name this product in their front matter, newest first.
 * Used to link a product page to the writing that discusses it.
 */
export function getPostsForProduct(productSlug: string): BlogPostMeta[] {
  if (!productSlug) return [];
  return getAllPosts()
    .filter((p) => p.products.includes(productSlug))
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date,
      updated: p.updated,
      tags: p.tags,
      products: p.products,
      setups: p.setups,
      readingMinutes: p.readingMinutes,
    }));
}

export function getPost(slug: string): BlogPost | null {
  if (!SLUG.test(slug)) return null;
  try {
    return build(slug, readFileSync(path.join(DIR, `${slug}.md`), "utf8"));
  } catch {
    return null;
  }
}

export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
