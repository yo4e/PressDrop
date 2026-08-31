import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PressDropError } from "./errors.ts";
import { parseMarkdown } from "./markdown.ts";
import type { MediaItem, NormalizedArticle, PipelineResult } from "./model.ts";
import { resolveBundlePath, validateParsedMarkdown } from "./validation.ts";

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function getMediaPaths(parsed: ReturnType<typeof parseMarkdown>): string[] {
  const values = new Set<string>();
  if (parsed.featuredImage) values.add(normalizeRelativePath(parsed.featuredImage));
  for (const block of parsed.blocks) {
    if (block.type === "image") values.add(normalizeRelativePath(block.mediaRef.slice("media:".length)));
  }
  return [...values].sort();
}

async function fingerprintBundle(articleText: string, bundleDir: string, mediaPaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  hash.update("pressdrop-markdown-v1\0");
  hash.update(articleText, "utf8");
  for (const mediaPath of mediaPaths) {
    hash.update("\0media\0");
    hash.update(mediaPath, "utf8");
    hash.update("\0");
    hash.update(await readFile(resolveBundlePath(bundleDir, mediaPath)));
  }
  return `sha256:${hash.digest("hex")}`;
}

function buildMedia(parsed: ReturnType<typeof parseMarkdown>): MediaItem[] {
  const roles = new Map<string, Set<"featured" | "inline">>();
  const add = (mediaPath: string, role: "featured" | "inline") => {
    const normalized = normalizeRelativePath(mediaPath);
    const current = roles.get(normalized) ?? new Set<"featured" | "inline">();
    current.add(role);
    roles.set(normalized, current);
  };

  if (parsed.featuredImage) add(parsed.featuredImage, "featured");
  for (const block of parsed.blocks) {
    if (block.type === "image") add(block.mediaRef.slice("media:".length), "inline");
  }

  return [...roles.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mediaPath, mediaRoles]) => ({
      ref: `media:${mediaPath}`,
      path: mediaPath,
      role: mediaRoles.size === 2 ? "featured-and-inline" : mediaRoles.has("featured") ? "featured" : "inline",
    }));
}

export async function inspectBundle(bundleDir: string): Promise<PipelineResult> {
  const resolvedBundle = path.resolve(bundleDir);
  const manuscriptPath = path.join(resolvedBundle, "article.md");
  let articleText: string;
  try {
    articleText = await readFile(manuscriptPath, "utf8");
  } catch {
    throw new PressDropError("INPUT_READ_ERROR", `Cannot read manuscript: ${manuscriptPath}`);
  }

  const parsed = parseMarkdown(articleText);
  const warnings = await validateParsedMarkdown(parsed, resolvedBundle);
  const mediaPaths = getMediaPaths(parsed);
  const fingerprint = await fingerprintBundle(articleText, resolvedBundle, mediaPaths);
  const featuredPath = parsed.featuredImage ? normalizeRelativePath(parsed.featuredImage) : undefined;

  const blocks = parsed.blocks.map((block) => {
    if (block.type !== "image") return block;
    const mediaPath = normalizeRelativePath(block.mediaRef.slice("media:".length));
    return { ...block, mediaRef: `media:${mediaPath}` };
  });

  const article: NormalizedArticle = {
    schemaVersion: 1,
    source: {
      adapter: "markdown",
      sourceId: `markdown:${path.basename(resolvedBundle)}/article.md`,
      filename: "article.md",
      fingerprint,
    },
    title: parsed.title!,
    ...(parsed.excerpt ? { excerpt: parsed.excerpt } : {}),
    blocks,
    media: buildMedia(parsed),
    categories: parsed.categories,
    tags: parsed.tags,
    meta: parsed.meta,
    ...(featuredPath ? { featuredMediaRef: `media:${featuredPath}` } : {}),
  };

  return { article, warnings };
}
