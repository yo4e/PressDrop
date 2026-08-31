import { readFile } from "node:fs/promises";
import path from "node:path";
import { PressDropError, type PressDropErrorCode } from "../errors.ts";
import type { WordPressSiteProfile } from "./site-profile.ts";

export interface WordPressCredentials {
  username: string;
  applicationPassword: string;
}

export interface UploadedMedia {
  id: number;
  url: string;
}

export interface CreatedDraft {
  id: number;
  link?: string;
  editUrl: string;
}

export interface DraftPayload {
  title: string;
  excerpt?: string;
  content: string;
  categoryIds: number[];
  tagIds: number[];
  featuredMediaId?: number;
}

export interface WordPressClientOptions {
  fetchImpl?: typeof fetch;
}

function mimeTypeFor(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    default: throw new PressDropError("MEDIA_UPLOAD_ERROR", `Unsupported image type: ${path.extname(filename) || "(none)"}`);
  }
}

function sanitizeHeaderFilename(filename: string): string {
  return filename.replace(/["\r\n]/g, "_");
}

export class WordPressClient {
  readonly profile: WordPressSiteProfile;
  readonly #credentials: WordPressCredentials;
  readonly #fetch: typeof fetch;

  constructor(profile: WordPressSiteProfile, credentials: WordPressCredentials, options: WordPressClientOptions = {}) {
    if (!credentials.username || !credentials.applicationPassword) {
      throw new PressDropError("AUTH_ERROR", "WordPress username and Application Password are required");
    }
    this.profile = profile;
    this.#credentials = credentials;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  #url(relative: string): string {
    return `${this.profile.baseUrl}${relative.startsWith("/") ? relative : `/${relative}`}`;
  }

  #authHeader(): string {
    return `Basic ${Buffer.from(`${this.#credentials.username}:${this.#credentials.applicationPassword}`, "utf8").toString("base64")}`;
  }

  #redact(value: string): string {
    let output = value;
    for (const secret of [this.#credentials.applicationPassword, this.#credentials.username, this.#authHeader()]) {
      if (secret) output = output.replaceAll(secret, "[redacted]");
    }
    return output;
  }

  async #requestJson<T>(relative: string, init: RequestInit, code: PressDropErrorCode): Promise<T> {
    let response: Response;
    try {
      response = await this.#fetch(this.#url(relative), {
        ...init,
        headers: {
          Authorization: this.#authHeader(),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? this.#redact(error.message) : "network request failed";
      throw new PressDropError(code, `WordPress request failed: ${message}`);
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = null; }
    }
    if (!response.ok) {
      const remote = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const remoteCode = typeof remote.code === "string" ? remote.code : undefined;
      const remoteMessage = typeof remote.message === "string" ? this.#redact(remote.message).slice(0, 300) : undefined;
      const failureCode: PressDropErrorCode = response.status === 401 || response.status === 403 ? "AUTH_ERROR" : code;
      throw new PressDropError(
        failureCode,
        `WordPress request returned HTTP ${response.status}${remoteMessage ? `: ${remoteMessage}` : ""}`,
        { status: response.status, ...(remoteCode ? { remoteCode } : {}) },
      );
    }
    return payload as T;
  }

  async resolveTerm(endpoint: "categories" | "tags", name: string): Promise<number> {
    const query = new URLSearchParams({ search: name, per_page: "100", _fields: "id,name" });
    const rows = await this.#requestJson<Array<{ id?: unknown; name?: unknown }>>(
      `/wp-json/wp/v2/${endpoint}?${query.toString()}`,
      { method: "GET" },
      "TAXONOMY_RESOLUTION_ERROR",
    );
    if (!Array.isArray(rows)) {
      throw new PressDropError("TAXONOMY_RESOLUTION_ERROR", `Unexpected WordPress ${endpoint} response`);
    }
    const exact = rows.filter((row) => row && row.name === name && Number.isInteger(row.id));
    if (exact.length === 0) {
      throw new PressDropError("TAXONOMY_RESOLUTION_ERROR", `WordPress ${endpoint} term does not exist: ${name}`, { taxonomy: endpoint, term: name });
    }
    if (exact.length > 1) {
      throw new PressDropError("TAXONOMY_RESOLUTION_ERROR", `WordPress ${endpoint} term is ambiguous: ${name}`, { taxonomy: endpoint, term: name });
    }
    return exact[0].id as number;
  }

  async resolveTerms(endpoint: "categories" | "tags", names: string[]): Promise<number[]> {
    const result: number[] = [];
    for (const name of names) result.push(await this.resolveTerm(endpoint, name));
    return result;
  }

  async uploadMedia(filePath: string, metadata: { alt?: string; caption?: string } = {}): Promise<UploadedMedia> {
    const bytes = await readFile(filePath);
    const filename = path.basename(filePath);
    const created = await this.#requestJson<{ id?: unknown; source_url?: unknown }>(
      "/wp-json/wp/v2/media",
      {
        method: "POST",
        headers: {
          "Content-Type": mimeTypeFor(filename),
          "Content-Disposition": `attachment; filename="${sanitizeHeaderFilename(filename)}"`,
        },
        body: bytes,
      },
      "MEDIA_UPLOAD_ERROR",
    );
    if (!Number.isInteger(created.id) || typeof created.source_url !== "string" || created.source_url === "") {
      throw new PressDropError("MEDIA_UPLOAD_ERROR", "WordPress media response is missing id/source_url");
    }
    const id = created.id as number;
    if (metadata.alt || metadata.caption) {
      await this.#requestJson(
        `/wp-json/wp/v2/media/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(metadata.alt ? { alt_text: metadata.alt } : {}),
            ...(metadata.caption ? { caption: metadata.caption } : {}),
          }),
        },
        "MEDIA_UPLOAD_ERROR",
      );
    }
    return { id, url: created.source_url };
  }

  async createDraft(payload: DraftPayload): Promise<CreatedDraft> {
    const created = await this.#requestJson<{ id?: unknown; link?: unknown }>(
      `/wp-json/wp/v2/${this.profile.postType}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          title: payload.title,
          ...(payload.excerpt ? { excerpt: payload.excerpt } : {}),
          content: payload.content,
          categories: payload.categoryIds,
          tags: payload.tagIds,
          ...(payload.featuredMediaId ? { featured_media: payload.featuredMediaId } : {}),
        }),
      },
      "POST_CREATE_ERROR",
    );
    if (!Number.isInteger(created.id)) {
      throw new PressDropError("POST_CREATE_ERROR", "WordPress post response is missing id");
    }
    const id = created.id as number;
    return {
      id,
      ...(typeof created.link === "string" ? { link: created.link } : {}),
      editUrl: `${this.profile.baseUrl}/wp-admin/post.php?post=${id}&action=edit`,
    };
  }
}
