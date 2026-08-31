import { PressDropError } from "./errors.ts";
import type { JsonScalar } from "./model.ts";

export interface FrontMatter {
  title?: string;
  excerpt?: string;
  categories?: string[];
  tags?: string[];
  featured_image?: string;
  meta?: Record<string, JsonScalar>;
}

interface ParsedDocument {
  frontMatter: FrontMatter;
  body: string;
}

const ALLOWED_TOP_LEVEL = new Set([
  "title",
  "excerpt",
  "categories",
  "tags",
  "featured_image",
  "meta",
]);

function fail(message: string, line?: number): never {
  throw new PressDropError("PARSE_ERROR", line ? `${message} (front matter line ${line})` : message);
}

function parseQuoted(value: string, line: number): string {
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "string") fail("Expected a string scalar", line);
      return parsed;
    } catch {
      fail("Invalid double-quoted string", line);
    }
  }

  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) fail("Invalid single-quoted string", line);
    return value.slice(1, -1).replaceAll("''", "'");
  }

  return value;
}

function parseScalar(value: string, line: number): JsonScalar {
  const trimmed = value.trim();
  if (trimmed === "") fail("Empty scalar is not allowed here", line);
  if (trimmed === ">" || trimmed === "|" || trimmed.startsWith("&") || trimmed.startsWith("*")) {
    fail("This YAML feature is not supported by the PressDrop v1 front matter subset", line);
  }

  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return parseQuoted(trimmed, line);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function requireString(value: JsonScalar, key: string, line: number): string {
  if (typeof value !== "string") fail(`${key} must be a string`, line);
  return value;
}

export function parseFrontMatterDocument(input: string): ParsedDocument {
  const normalized = input.replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") fail("Markdown input must begin with YAML front matter delimited by ---");

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex < 0) fail("YAML front matter is missing its closing --- delimiter");

  const fmLines = lines.slice(1, closingIndex);
  const result: FrontMatter = {};
  const seen = new Set<string>();

  for (let i = 0; i < fmLines.length; i += 1) {
    const raw = fmLines[i];
    const lineNumber = i + 2;
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (/\t/.test(raw)) fail("Tabs are not allowed in front matter", lineNumber);
    if (/^\s/.test(raw)) fail("Unexpected indentation", lineNumber);

    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!match) fail("Malformed front matter entry", lineNumber);
    const [, key, rawValue = ""] = match;
    if (!ALLOWED_TOP_LEVEL.has(key)) fail(`Unknown front matter field: ${key}`, lineNumber);
    if (seen.has(key)) fail(`Duplicate front matter field: ${key}`, lineNumber);
    seen.add(key);

    if (key === "categories" || key === "tags") {
      if (rawValue.trim() !== "") fail(`${key} must use a YAML list`, lineNumber);
      const values: string[] = [];
      while (i + 1 < fmLines.length && /^\s+/.test(fmLines[i + 1])) {
        const itemRaw = fmLines[i + 1];
        const itemLine = i + 3;
        const itemMatch = itemRaw.match(/^  -\s+(.+)$/);
        if (!itemMatch) fail(`${key} entries must use two-space list indentation`, itemLine);
        const scalar = parseScalar(itemMatch[1], itemLine);
        values.push(requireString(scalar, key, itemLine));
        i += 1;
      }
      (result as Record<string, unknown>)[key] = values;
      continue;
    }

    if (key === "meta") {
      if (rawValue.trim() !== "") fail("meta must use an indented key/value mapping", lineNumber);
      const meta: Record<string, JsonScalar> = {};
      while (i + 1 < fmLines.length && /^\s+/.test(fmLines[i + 1])) {
        const itemRaw = fmLines[i + 1];
        const itemLine = i + 3;
        const itemMatch = itemRaw.match(/^  ([A-Za-z_][A-Za-z0-9_.-]*):\s*(.+)$/);
        if (!itemMatch) fail("meta entries must use two-space key/value indentation", itemLine);
        const [, metaKey, metaValue] = itemMatch;
        if (Object.hasOwn(meta, metaKey)) fail(`Duplicate meta field: ${metaKey}`, itemLine);
        meta[metaKey] = parseScalar(metaValue, itemLine);
        i += 1;
      }
      result.meta = meta;
      continue;
    }

    const scalar = parseScalar(rawValue, lineNumber);
    if (key === "title") result.title = requireString(scalar, key, lineNumber);
    if (key === "excerpt") result.excerpt = requireString(scalar, key, lineNumber);
    if (key === "featured_image") result.featured_image = requireString(scalar, key, lineNumber);
  }

  return {
    frontMatter: result,
    body: lines.slice(closingIndex + 1).join("\n").replace(/^\n+/, ""),
  };
}
