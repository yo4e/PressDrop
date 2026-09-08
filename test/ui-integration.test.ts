import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createPressDropWebServer } from "../src/web-server.ts";
import { normalizeSiteProfile } from "../src/wordpress/site-profile.ts";
import { MemorySubmissionStateStore } from "../src/wordpress/state.ts";
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

test("local web API exposes the real normalized fixture instead of prototype sample state", async () => {
  const server = createPressDropWebServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/inspect`, {
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
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
