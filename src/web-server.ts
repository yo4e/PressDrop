import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { PressDropError } from "./errors.ts";
import { inspectBundle } from "./pipeline.ts";
import type { WordPressClientOptions } from "./wordpress/client.ts";
import { loadSiteProfile } from "./wordpress/site-profile.ts";
import { JsonSubmissionStateStore, submissionKey, type SubmissionStateRecord } from "./wordpress/state.ts";
import {
  preflightBundle,
  submitBundle,
  type SubmissionProgressPhase,
  type SubmissionResult,
} from "./wordpress/submit.ts";

const JSON_LIMIT = 64 * 1024;
const JOB_RETENTION_MS = 60 * 60 * 1000;

type JobPhase = "local_validation" | SubmissionProgressPhase;
type JobStatus = "running" | "completed" | "failed";
type RemoteMutation = "none" | "media_may_have_changed" | "media_changed_draft_may_exist" | "completed";

interface ApiFailure {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  phase: JobPhase;
  remoteMutation: RemoteMutation;
  duplicateKind?: "media_result_unknown" | "post_result_unknown";
}

interface SubmissionJob {
  id: string;
  status: JobStatus;
  phase: JobPhase;
  createdAt: string;
  result?: SubmissionResult;
  error?: ApiFailure;
}

interface WebServerOptions {
  stateFile?: string;
  webDistDir?: string;
  clientOptions?: WordPressClientOptions;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`${JSON.stringify(payload)}\n`);
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > JSON_LIMIT) throw new PressDropError("INPUT_READ_ERROR", "Request body is too large");
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PressDropError) throw error;
    throw new PressDropError("INPUT_READ_ERROR", "Request body must be a JSON object");
  }
}

function requireText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new PressDropError("INPUT_READ_ERROR", `${key} is required`);
  }
  return value.trim();
}

function remoteMutationFor(phase: JobPhase): RemoteMutation {
  if (phase === "uploading_media") return "media_may_have_changed";
  if (phase === "creating_post") return "media_changed_draft_may_exist";
  if (phase === "completed") return "completed";
  return "none";
}

function remoteMutationFromState(record: SubmissionStateRecord | undefined): RemoteMutation {
  if (!record) return "none";
  if (record.phase === "completed" && record.post) return "completed";
  if (record.phase === "creating_post") return "media_changed_draft_may_exist";
  if (record.pendingMediaRef || Object.keys(record.media).length > 0) return "media_may_have_changed";
  return "none";
}

function strongestRemoteMutation(...values: RemoteMutation[]): RemoteMutation {
  const rank: Record<RemoteMutation, number> = {
    none: 0,
    media_may_have_changed: 1,
    media_changed_draft_may_exist: 2,
    completed: 3,
  };
  return values.reduce((strongest, value) => rank[value] > rank[strongest] ? value : strongest, "none");
}

function apiFailure(error: unknown, phase: JobPhase, priorRemoteMutation: RemoteMutation = "none"): ApiFailure {
  if (error instanceof PressDropError) {
    const duplicateKind = error.code === "DUPLICATE_CANDIDATE"
      ? (typeof error.details?.mediaRef === "string" ? "media_result_unknown" : "post_result_unknown")
      : undefined;
    const currentRemoteMutation = error.code === "DUPLICATE_CANDIDATE"
      ? duplicateKind === "media_result_unknown" ? "media_may_have_changed" : "media_changed_draft_may_exist"
      : remoteMutationFor(phase);
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      phase,
      remoteMutation: strongestRemoteMutation(priorRemoteMutation, currentRemoteMutation),
      ...(duplicateKind ? { duplicateKind } : {}),
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "Unexpected PressDrop server error",
    phase,
    remoteMutation: strongestRemoteMutation(priorRemoteMutation, remoteMutationFor(phase)),
  };
}

function credentialsFrom(body: Record<string, unknown>) {
  return {
    username: requireText(body, "username"),
    applicationPassword: requireText(body, "applicationPassword"),
  };
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function serveWeb(res: ServerResponse, pathname: string, webDistDir: string): Promise<void> {
  const root = path.resolve(webDistDir);
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    sendJson(res, 404, { error: { code: "NOT_FOUND", message: "Not found" } });
    return;
  }
  try {
    const data = await readFile(candidate);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType(candidate));
    res.setHeader("Cache-Control", candidate.endsWith("index.html") ? "no-store" : "public, max-age=3600");
    res.end(data);
  } catch {
    try {
      const index = await readFile(path.join(root, "index.html"));
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(index);
    } catch {
      sendJson(res, 503, {
        error: {
          code: "WEB_NOT_BUILT",
          message: "PressDrop web assets are not built. Run `npm --prefix web run build` or use the Vite development server.",
        },
      });
    }
  }
}

export function createPressDropWebServer(options: WebServerOptions = {}) {
  const stateFile = options.stateFile ?? process.env.PRESSDROP_STATE_FILE ?? ".pressdrop/state.json";
  const webDistDir = options.webDistDir ?? path.resolve("web/dist");
  const jobs = new Map<string, SubmissionJob>();
  const activeSubmissionKeys = new Set<string>();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname.startsWith("/api/") && !isLocalOrigin(req.headers.origin)) {
        sendJson(res, 403, { error: { code: "ORIGIN_REJECTED", message: "PressDrop local API only accepts localhost origins" } });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/inspect") {
        const body = await readJson(req);
        const result = await inspectBundle(requireText(body, "bundleDir"));
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/preflight") {
        const body = await readJson(req);
        const bundleDir = requireText(body, "bundleDir");
        const profile = await loadSiteProfile(requireText(body, "profilePath"));
        const result = await preflightBundle({
          bundleDir,
          profile,
          credentials: credentialsFrom(body),
          clientOptions: options.clientOptions,
        });
        sendJson(res, 200, { ...result, profile });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/submissions") {
        const body = await readJson(req);
        const bundleDir = requireText(body, "bundleDir");
        const expectedSourceFingerprint = requireText(body, "expectedSourceFingerprint");
        const profile = await loadSiteProfile(requireText(body, "profilePath"));
        const credentials = credentialsFrom(body);
        const key = submissionKey(profile, expectedSourceFingerprint);
        if (activeSubmissionKeys.has(key)) {
          throw new PressDropError(
            "STATE_ERROR",
            "An identical submission is already running; wait for it to finish before retrying",
            { submissionKey: key },
          );
        }
        activeSubmissionKeys.add(key);

        const stateStore = new JsonSubmissionStateStore(stateFile);
        let priorRemoteMutation: RemoteMutation;
        try {
          priorRemoteMutation = remoteMutationFromState(await stateStore.get(key));
        } catch (error) {
          activeSubmissionKeys.delete(key);
          throw error;
        }

        const id = randomUUID();
        const job: SubmissionJob = {
          id,
          status: "running",
          phase: "local_validation",
          createdAt: new Date().toISOString(),
        };
        jobs.set(id, job);
        const cleanup = setTimeout(() => jobs.delete(id), JOB_RETENTION_MS);
        cleanup.unref();

        void submitBundle({
          bundleDir,
          profile,
          credentials,
          stateStore,
          clientOptions: options.clientOptions,
          expectedSourceFingerprint,
          onProgress: (phase) => { job.phase = phase; },
        }).then((result) => {
          job.phase = "completed";
          job.status = "completed";
          job.result = result;
        }).catch((error: unknown) => {
          job.status = "failed";
          job.error = apiFailure(error, job.phase, priorRemoteMutation);
        }).finally(() => {
          activeSubmissionKeys.delete(key);
        });

        sendJson(res, 202, { jobId: id, status: job.status, phase: job.phase });
        return;
      }

      const jobMatch = /^\/api\/submissions\/([0-9a-f-]+)$/.exec(url.pathname);
      if (req.method === "GET" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        if (!job) {
          sendJson(res, 404, { error: { code: "JOB_NOT_FOUND", message: "Submission job was not found" } });
          return;
        }
        sendJson(res, 200, job);
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        sendJson(res, 404, { error: { code: "NOT_FOUND", message: "API route not found" } });
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        await serveWeb(res, url.pathname, webDistDir);
        return;
      }

      sendJson(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed" } });
    } catch (error: unknown) {
      sendJson(res, 400, { error: apiFailure(error, "local_validation") });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.PRESSDROP_HOST ?? "127.0.0.1";
  const port = Number(process.env.PRESSDROP_PORT ?? "43110");
  const server = createPressDropWebServer();
  server.listen(port, host, () => {
    console.log(`PressDrop local UI: http://${host}:${port}`);
  });
}
