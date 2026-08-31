import { PressDropError } from "./errors.ts";
import type { ArticleBlock, NormalizedArticle } from "./model.ts";

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

function serializeBlock(block: ArticleBlock): string {
  if (block.type === "paragraph") {
    return `<!-- wp:paragraph -->\n<p>${escapeHtml(block.text)}</p>\n<!-- /wp:paragraph -->`;
  }

  if (block.type === "heading") {
    return `<!-- wp:heading {"level":${block.level}} -->\n<h${block.level} class="wp-block-heading">${escapeHtml(block.text)}</h${block.level}>\n<!-- /wp:heading -->`;
  }

  const src = mediaPlaceholder(block.mediaRef);
  const caption = `${escapeHtml(block.caption)} <span class="pressdrop-image-credit">${escapeHtml(block.credit)}</span>`;
  return `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${src}" alt="${escapeHtml(block.alt)}"/><figcaption class="wp-element-caption">${caption}</figcaption></figure>\n<!-- /wp:image -->`;
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

export function generateGutenberg(article: NormalizedArticle): string {
  const content = article.blocks.map(serializeBlock).join("\n\n");
  validateGutenbergSerialization(content, article.blocks.length);
  return content;
}
