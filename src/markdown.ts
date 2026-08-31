import { PressDropError } from "./errors.ts";
import type { ArticleBlock, ImageBlock, JsonScalar } from "./model.ts";
import { parseFrontMatterDocument } from "./frontmatter.ts";

export interface ParsedMarkdown {
  title?: string;
  excerpt?: string;
  categories: string[];
  tags: string[];
  featuredImage?: string;
  meta: Record<string, JsonScalar>;
  blocks: ArticleBlock[];
}

const IMAGE_DIRECTIVE = /^\{\{image:([^{}]+)\}\}$/;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/;

function parseError(message: string, bodyLine?: number): never {
  throw new PressDropError("PARSE_ERROR", bodyLine ? `${message} (body line ${bodyLine})` : message);
}

function validateText(text: string, line: number): void {
  if (HTML_TAG.test(text)) {
    throw new PressDropError(
      "VALIDATION_ERROR",
      `Raw HTML is not supported in PressDrop Markdown v1 (body line ${line})`,
    );
  }
  if (/\{\{[^}]+\}\}/.test(text)) parseError("Unknown or malformed directive", line);
  if (/!\[[^\]]*\]\([^)]*\)/.test(text)) {
    parseError("Standard Markdown image syntax is not supported; use {{image:path}}", line);
  }
}

function parseImage(lines: string[], startIndex: number, pathValue: string): { block: ImageBlock; nextIndex: number } {
  const path = pathValue.trim();
  if (!path) parseError("Image directive path must not be empty", startIndex + 1);

  const fields: Partial<Record<"alt" | "caption" | "credit", string>> = {};
  let i = startIndex + 1;
  for (; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === "") break;
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) break;
    const [, key, value] = match;
    if (key !== "alt" && key !== "caption" && key !== "credit") {
      parseError(`Unknown image metadata field: ${key}`, i + 1);
    }
    if (Object.hasOwn(fields, key)) parseError(`Duplicate image metadata field: ${key}`, i + 1);
    if (!value.trim()) parseError(`Image metadata ${key} must not be empty`, i + 1);
    fields[key] = value.trim();
  }

  for (const required of ["alt", "caption", "credit"] as const) {
    if (!fields[required]) parseError(`Image directive requires ${required}: metadata`, startIndex + 1);
  }

  return {
    block: {
      type: "image",
      mediaRef: `media:${path.replaceAll("\\", "/")}`,
      alt: fields.alt!,
      caption: fields.caption!,
      credit: fields.credit!,
    },
    nextIndex: i,
  };
}

export function parseMarkdown(input: string): ParsedMarkdown {
  const { frontMatter, body } = parseFrontMatterDocument(input);
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const blocks: ArticleBlock[] = [];
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.map((line) => line.trim()).join(" ").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph.length = 0;
  };

  for (let i = 0; i < lines.length;) {
    const raw = lines[i];
    const lineNumber = i + 1;
    const trimmed = raw.trim();

    if (trimmed === "") {
      flushParagraph();
      i += 1;
      continue;
    }

    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      if (level !== 2 && level !== 3) {
        throw new PressDropError(
          "UNSUPPORTED_BLOCK",
          `Only H2 and H3 headings are supported in Markdown v1 (body line ${lineNumber})`,
        );
      }
      validateText(heading[2], lineNumber);
      blocks.push({ type: "heading", level, text: heading[2].trim() } as ArticleBlock);
      i += 1;
      continue;
    }

    const image = trimmed.match(IMAGE_DIRECTIVE);
    if (image) {
      flushParagraph();
      const parsed = parseImage(lines, i, image[1]);
      blocks.push(parsed.block);
      i = parsed.nextIndex;
      continue;
    }

    validateText(raw, lineNumber);
    paragraph.push(raw);
    i += 1;
  }

  flushParagraph();

  return {
    title: frontMatter.title,
    excerpt: frontMatter.excerpt,
    categories: frontMatter.categories ?? [],
    tags: frontMatter.tags ?? [],
    featuredImage: frontMatter.featured_image,
    meta: frontMatter.meta ?? {},
    blocks,
  };
}
