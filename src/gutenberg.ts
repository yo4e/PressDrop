import { PressDropError } from "./errors.ts";
import type { ArticleBlock, NormalizedArticle } from "./model.ts";

export interface GutenbergMedia {
  id: number;
  url: string;
}

export type GutenbergMediaMap = Readonly<Record<string, GutenbergMedia>>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mediaPlaceholder(mediaRef: string): string {
  const mediaPath = mediaRef.replace(/^media:/, "");
  return `pressdrop://${encodeURI(mediaPath).replaceAll('"', "%22")}`;
}

function serializeBlock(block: ArticleBlock, mediaMap?: GutenbergMediaMap): string {
  if (block.type === "paragraph") {
    return `<!-- wp:paragraph -->\n<p>${escapeHtml(block.text)}</p>\n<!-- /wp:paragraph -->`;
  }

  if (block.type === "heading") {
    return `<!-- wp:heading {"level":${block.level}} -->\n<h${block.level} class="wp-block-heading">${escapeHtml(block.text)}</h${block.level}>\n<!-- /wp:heading -->`;
  }

  const media = mediaMap?.[block.mediaRef];
  const src = media?.url ?? mediaPlaceholder(block.mediaRef);
  const attributes = media ? ` {"id":${media.id},"sizeSlug":"full"}` : "";
  const imageClass = media ? ` class="wp-image-${media.id}"` : "";
  const caption = `${escapeHtml(block.caption)} <span class="pressdrop-image-credit">${escapeHtml(block.credit)}</span>`;
  return `<!-- wp:image${attributes} -->\n<figure class="wp-block-image size-full"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt)}"${imageClass}/><figcaption class="wp-element-caption">${caption}</figcaption></figure>\n<!-- /wp:image -->`;
}

export function validateGutenbergSerialization(content: string, expectedBlocks: number): void {
  const opens = [...content.matchAll(/<!-- wp:([a-z]+)(?:\s+\{[^\n]*\})? -->/g)].map((match) => match[1]);
  const closes = [...content.matchAll(/<!-- \/wp:([a-z]+) -->/g)].map((match) => match[1]);
  if (opens.length !== expectedBlocks || closes.length !== expectedBlocks) {
    throw new PressDropError("GUTENBERG_VALIDATION_ERROR", "Serialized Gutenberg block count does not match normalized blocks");
  }
  if (opens.some((name, index) => name !== closes[index])) {
    throw new PressDropError("GUTENBERG_VALIDATION_ERROR", "Serialized Gutenberg block boundaries are unbalanced");
  }
}

export function generateGutenberg(article: NormalizedArticle, mediaMap?: GutenbergMediaMap): string {
  const content = article.blocks.map((block) => serializeBlock(block, mediaMap)).join("\n\n");
  validateGutenbergSerialization(content, article.blocks.length);
  return content;
}
