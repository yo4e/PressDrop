import { access, stat } from "node:fs/promises";
import path from "node:path";
import { PressDropError } from "./errors.ts";
import type { ParsedMarkdown } from "./markdown.ts";

function validateTaxonomy(values: string[], name: "categories" | "tags"): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new PressDropError("VALIDATION_ERROR", `${name} values must be non-empty strings`);
    }
    if (value !== value.trim()) {
      throw new PressDropError("VALIDATION_ERROR", `${name} values must not have surrounding whitespace: ${JSON.stringify(value)}`);
    }
    if (seen.has(value)) {
      throw new PressDropError("VALIDATION_ERROR", `${name} must not contain duplicate value: ${value}`);
    }
    seen.add(value);
  }
}

export function resolveBundlePath(bundleDir: string, relativePath: string): string {
  if (relativePath.trim() === "") {
    throw new PressDropError("VALIDATION_ERROR", "Image path must not be empty");
  }
  if (path.isAbsolute(relativePath)) {
    throw new PressDropError("VALIDATION_ERROR", `Image path must be relative to the manuscript bundle: ${relativePath}`);
  }

  const root = path.resolve(bundleDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new PressDropError("VALIDATION_ERROR", `Image path escapes the manuscript bundle: ${relativePath}`);
  }
  return resolved;
}

export async function validateParsedMarkdown(parsed: ParsedMarkdown, bundleDir: string): Promise<string[]> {
  const warnings: string[] = [];
  if (!parsed.title || parsed.title.trim() === "") {
    throw new PressDropError("VALIDATION_ERROR", "Front matter field title is required and must not be empty");
  }
  if (parsed.blocks.length === 0) {
    throw new PressDropError("VALIDATION_ERROR", "Article body must contain at least one supported content block");
  }

  validateTaxonomy(parsed.categories, "categories");
  validateTaxonomy(parsed.tags, "tags");

  const paths = new Set<string>();
  if (parsed.featuredImage) paths.add(parsed.featuredImage);
  for (const block of parsed.blocks) {
    if (block.type === "heading" && !block.text.trim()) {
      throw new PressDropError("VALIDATION_ERROR", "Heading text must not be empty");
    }
    if (block.type === "paragraph" && !block.text.trim()) {
      throw new PressDropError("VALIDATION_ERROR", "Paragraph text must not be empty");
    }
    if (block.type === "image") {
      const mediaPath = block.mediaRef.slice("media:".length);
      paths.add(mediaPath);
      if (!block.alt.trim() || !block.caption.trim() || !block.credit.trim()) {
        throw new PressDropError("VALIDATION_ERROR", `Image metadata is incomplete: ${mediaPath}`);
      }
    }
  }

  for (const relativePath of paths) {
    const resolved = resolveBundlePath(bundleDir, relativePath);
    try {
      await access(resolved);
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      throw new PressDropError("MISSING_MEDIA", `Referenced image file does not exist: ${relativePath}`, {
        path: relativePath,
      });
    }
  }

  if (!parsed.excerpt) warnings.push("Front matter excerpt is not set");
  if (!parsed.featuredImage) warnings.push("Front matter featured_image is not set");
  return warnings;
}
