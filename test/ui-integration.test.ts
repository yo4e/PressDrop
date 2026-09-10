import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { PressDropError } from "../src/errors.ts";
import { inspectBundle } from "../src/pipeline.ts";
import { createPressDropWebServer } from "../src/web-server.ts";
import { normalizeSiteProfile } from "../src/wordpress/site-profile.ts";
import { JsonSubmissionStateStore, MemorySubmissionStateStore, submissionKey } from "../src/wordpress/state.ts";
import { preflightBundle, submitBundle } from "../src/wordpress/submit.ts";

const example = path.resolve("examples/basic");
const profile = normalizeSiteProfile({ id: "ui-test", baseUrl: "https://wp.example.test", postType: "posts" });
const credentials = { username: "ui-user", applicationPassword: "ui-secret" };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function fakeWordPress() {
  const calls: Array<{ method: string; url: string }> = [];
  let mediaId = 100;
  const ids: Record<string, number> = { Workflow: 10, WordPress: 11, Markdown: 20, Gutenberg: 21 };
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    calls.push({ method, url: url.toString() });
    if (method === "GET" && (url.pathname.endsWith("/categories") || url.pathname.endsWith("/tags"))) {
      const name = url.searchParams.get("search") ?? "";
      return jsonResponse(ids[name] ? [{ id: ids[name], name }] : []);
    }
    if (method === "POST" && url.pathname.endsWith("/media")) {
      const id = mediaId++;
      return jsonResponse({ id, source_url: `https://cdn.example.test/${id}.png` }, 201);
    }
    if (method === "POST" && /\/media\/\d+$/.test(url.pathname)) return jsonResponse({ id: Number(url.pathname.split("/").at(-1)) });
    if (method === "POST" && url.pathname.endsWith("/posts")) return jsonResponse({ id: 500, link: "https://wp.example.test/?p=500" }, 201);
    return jsonResponse({ code: "not_found", message: url.pathname }, 404);
  };
  return { calls, fetchImpl };
}

async function startLocalServer(options = {}) {
  const server = createPressDropWebServer(options);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function writeProfileFixture(directory: string): Promise<string> {
  const profilePath = path.join(directory, "site.json");
  await writeFile(profilePath, `${JSON.stringify({ id: profile.id, baseUrl: profile.baseUrl, postType: profile.postType })}\n`, "utf8");
  return profilePath;
}

function submissionBody(profilePath: string, fingerprint: string) {
  return {
    bundleDir: example,
    profilePath,
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
    expectedSourceFingerprint: fingerprint,
  };
}

async function waitForJob(baseUrl: string, jobId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/submissions/${jobId}`);
    assert.equal(response.status, 200);
    const job = await response.json();
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("submission job did not finish");
}

test("local web API exposes the real normalized fixture instead of prototype sample state", async () => {
  const local = await startLocalServer();
  try {
    const response = await fetch(`${local.baseUrl}/api/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleDir: example }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.article.title, "PressDropで、原稿からWordPress入稿をほどく");
    assert.equal(payload.article.media.length, 3);
    assert.deepEqual(payload.article.categories, ["Workflow", "WordPress"]);
    assert.deepEqual(payload.article.tags, ["Markdown", "Gutenberg"]);
  } finally {
    await local.close();
  }
});

test("preflight resolves taxonomy through the real client without media or post side effects", async () => {
  const wp = fakeWordPress();
  const result = await preflightBundle({ bundleDir: example, profile, credentials, clientOptions: { fetchImpl: wp.fetchImpl } });
  assert.deepEqual(result.categoryIds, [10, 11]);
  assert.deepEqual(result.tagIds, [20, 21]);
  assert.equal(result.article.title, "PressDropで、原稿からWordPress入稿をほどく");
  assert.ok(wp.calls.every((call) => call.method === "GET"));
  assert.ok(wp.calls.every((call) => !new URL(call.url).pathname.endsWith("/media") && !new URL(call.url).pathname.endsWith("/posts")));
});

test("changed manuscript fingerprint blocks submission before any WordPress request", async () => {
  const wp = fakeWordPress();
  await assert.rejects(
    () => submitBundle({
      bundleDir: example,
      profile,
      credentials,
      stateStore: new MemorySubmissionStateStore(),
      clientOptions: { fetchImpl: wp.fetchImpl },
      expectedSourceFingerprint: "sha256:not-the-previewed-bundle",
    }),
    (error) => {
      assert.ok(error instanceof PressDropError);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.match(error.message, /changed after preview/);
      return true;
    },
  );
  assert.equal(wp.calls.length, 0);
});

test("submission progress comes from the real pipeline and completed retry is reused", async () => {
  const wp = fakeWordPress();
  const state = new MemorySubmissionStateStore();
  const phases: string[] = [];
  const first = await submitBundle({
    bundleDir: example,
    profile,
    credentials,
    stateStore: state,
    clientOptions: { fetchImpl: wp.fetchImpl },
    onProgress: (phase) => phases.push(phase),
  });
  assert.equal(first.reused, false);
  assert.deepEqual(phases, ["resolving_taxonomy", "uploading_media", "creating_post", "completed"]);
  const callCount = wp.calls.length;

  const retryPhases: string[] = [];
  const second = await submitBundle({
    bundleDir: example,
    profile,
    credentials,
    stateStore: state,
    clientOptions: { fetchImpl: wp.fetchImpl },
    onProgress: (phase) => retryPhases.push(phase),
  });
  assert.equal(second.reused, true);
  assert.deepEqual(retryPhases, ["completed"]);
  assert.equal(wp.calls.length, callCount);
});

test("local web API refuses a second identical submission while the first is active", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pressdrop-ui-lock-"));
  const profilePath = await writeProfileFixture(temp);
  const stateFile = path.join(temp, "state.json");
  const inspected = await inspectBundle(example);
  const wp = fakeWordPress();
  let releaseTaxonomy!: () => void;
  const taxonomyGate = new Promise<void>((resolve) => { releaseTaxonomy = resolve; });
  let blocked = true;
  const blockingFetch: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    if (blocked && method === "GET" && url.pathname.endsWith("/categories")) {
      await taxonomyGate;
      blocked = false;
    }
    return wp.fetchImpl(input, init);
  };
  const local = await startLocalServer({ stateFile, clientOptions: { fetchImpl: blockingFetch } });
  const body = submissionBody(profilePath, inspected.article.source.fingerprint);
  try {
    const first = await fetch(`${local.baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(first.status, 202);
    const firstPayload = await first.json();

    const second = await fetch(`${local.baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(second.status, 400);
    const secondPayload = await second.json();
    assert.equal(secondPayload.error.code, "STATE_ERROR");
    assert.match(secondPayload.error.message, /already running/);

    releaseTaxonomy();
    const finished = await waitForJob(local.baseUrl, firstPayload.jobId);
    assert.equal(finished.status, "completed");
    assert.equal(wp.calls.filter((call) => call.method === "POST" && new URL(call.url).pathname.endsWith("/media")).length, 3);
    assert.equal(wp.calls.filter((call) => call.method === "POST" && new URL(call.url).pathname.endsWith("/posts")).length, 1);
  } finally {
    releaseTaxonomy();
    await local.close();
  }
});

test("resumed submission preserves prior media side effects when taxonomy/auth later fails", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "pressdrop-ui-state-"));
  const profilePath = await writeProfileFixture(temp);
  const stateFile = path.join(temp, "state.json");
  const inspected = await inspectBundle(example);
  const key = submissionKey(profile, inspected.article.source.fingerprint);
  const stateStore = new JsonSubmissionStateStore(stateFile);
  await stateStore.put({
    version: 1,
    key,
    profileId: profile.id,
    baseUrl: profile.baseUrl,
    sourceFingerprint: inspected.article.source.fingerprint,
    phase: "uploading_media",
    media: {
      "media:already-uploaded.png": { id: 77, url: "https://wp.example.test/uploads/already-uploaded.png" },
    },
  });
  const authFailureFetch: typeof fetch = async () => jsonResponse({ code: "rest_not_logged_in", message: "bad credentials" }, 401);
  const local = await startLocalServer({ stateFile, clientOptions: { fetchImpl: authFailureFetch } });
  try {
    const response = await fetch(`${local.baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submissionBody(profilePath, inspected.article.source.fingerprint)),
    });
    assert.equal(response.status, 202);
    const started = await response.json();
    const finished = await waitForJob(local.baseUrl, started.jobId);
    assert.equal(finished.status, "failed");
    assert.equal(finished.phase, "resolving_taxonomy");
    assert.equal(finished.error.code, "AUTH_ERROR");
    assert.equal(finished.error.remoteMutation, "media_may_have_changed");
  } finally {
    await local.close();
  }
});
