import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PressDropError } from "../errors.ts";
import type { CreatedDraft, UploadedMedia } from "./client.ts";
import type { WordPressSiteProfile } from "./site-profile.ts";

export type SubmissionPhase = "uploading_media" | "creating_post" | "completed";

export interface SubmissionStateRecord {
  version: 1;
  key: string;
  profileId: string;
  baseUrl: string;
  sourceFingerprint: string;
  phase: SubmissionPhase;
  media: Record<string, UploadedMedia>;
  categoryIds?: number[];
  tagIds?: number[];
  pendingMediaRef?: string;
  post?: CreatedDraft;
}

export interface SubmissionStateStore {
  get(key: string): Promise<SubmissionStateRecord | undefined>;
  put(record: SubmissionStateRecord): Promise<void>;
}

export function submissionKey(profile: WordPressSiteProfile, sourceFingerprint: string): string {
  return `sha256:${createHash("sha256").update(`${profile.id}\0${profile.baseUrl}\0${sourceFingerprint}`, "utf8").digest("hex")}`;
}

export class MemorySubmissionStateStore implements SubmissionStateStore {
  readonly #records = new Map<string, SubmissionStateRecord>();
  async get(key: string): Promise<SubmissionStateRecord | undefined> {
    const value = this.#records.get(key);
    return value ? structuredClone(value) : undefined;
  }
  async put(record: SubmissionStateRecord): Promise<void> {
    this.#records.set(record.key, structuredClone(record));
  }
  snapshot(): Record<string, SubmissionStateRecord> {
    return Object.fromEntries([...this.#records].map(([key, value]) => [key, structuredClone(value)]));
  }
}

interface StateFile {
  version: 1;
  submissions: Record<string, SubmissionStateRecord>;
}

export class JsonSubmissionStateStore implements SubmissionStateStore {
  readonly filePath: string;
  constructor(filePath: string) { this.filePath = path.resolve(filePath); }

  async #read(): Promise<StateFile> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      const value = parsed as Record<string, unknown>;
      if (value.version !== 1 || !value.submissions || typeof value.submissions !== "object") throw new Error("unsupported shape");
      return value as unknown as StateFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { version: 1, submissions: {} };
      throw new PressDropError("STATE_ERROR", `Cannot read PressDrop submission state: ${this.filePath}`);
    }
  }

  async get(key: string): Promise<SubmissionStateRecord | undefined> {
    const state = await this.#read();
    const record = state.submissions[key];
    return record ? structuredClone(record) : undefined;
  }

  async put(record: SubmissionStateRecord): Promise<void> {
    const state = await this.#read();
    state.submissions[record.key] = structuredClone(record);
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temp, this.filePath);
    } catch {
      throw new PressDropError("STATE_ERROR", `Cannot write PressDrop submission state: ${this.filePath}`);
    }
  }
}
