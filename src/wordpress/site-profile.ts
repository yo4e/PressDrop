import { readFile } from "node:fs/promises";
import { PressDropError } from "../errors.ts";

export interface WordPressSiteProfile {
  id: string;
  baseUrl: string;
  postType: "posts";
}

export interface SiteProfileOptions {
  allowInsecureHttpForTests?: boolean;
}

export function normalizeSiteProfile(input: unknown, options: SiteProfileOptions = {}): WordPressSiteProfile {
  if (!input || typeof input !== "object") {
    throw new PressDropError("SITE_PROFILE_ERROR", "Site profile must be a JSON object");
  }
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new PressDropError("SITE_PROFILE_ERROR", "Site profile id is required");
  }
  if (typeof value.baseUrl !== "string" || value.baseUrl.trim() === "") {
    throw new PressDropError("SITE_PROFILE_ERROR", "Site profile baseUrl is required");
  }
  const postType = value.postType ?? "posts";
  if (postType !== "posts") {
    throw new PressDropError("SITE_PROFILE_ERROR", "Only the standard WordPress posts endpoint is supported in this slice");
  }

  let url: URL;
  try {
    url = new URL(value.baseUrl);
  } catch {
    throw new PressDropError("SITE_PROFILE_ERROR", "Site profile baseUrl must be a valid absolute URL");
  }
  if (url.username || url.password) {
    throw new PressDropError("SITE_PROFILE_ERROR", "Credentials must not be embedded in site profile URLs");
  }
  if (url.protocol !== "https:" && !(options.allowInsecureHttpForTests && url.protocol === "http:")) {
    throw new PressDropError("SITE_PROFILE_ERROR", "WordPress baseUrl must use HTTPS");
  }
  url.hash = "";
  url.search = "";
  const normalized = url.toString().replace(/\/$/, "");
  return { id: value.id.trim(), baseUrl: normalized, postType };
}

export async function loadSiteProfile(filePath: string): Promise<WordPressSiteProfile> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new PressDropError("SITE_PROFILE_ERROR", `Cannot read site profile: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PressDropError("SITE_PROFILE_ERROR", `Site profile is not valid JSON: ${filePath}`);
  }
  return normalizeSiteProfile(parsed);
}
