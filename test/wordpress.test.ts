import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PressDropError } from "../src/errors.ts";
import { normalizeSiteProfile } from "../src/wordpress/site-profile.ts";
import { JsonSubmissionStateStore, MemorySubmissionStateStore } from "../src/wordpress/state.ts";
import { submitBundle } from "../src/wordpress/submit.ts";

const example = path.resolve("examples/basic");
const credentials = { username: "pressdrop-user", applicationPassword: "secret-app-password" };

interface MockOptions {
  missingTerm?: string;
  failPostAfterReceive?: boolean;
  authFailure?: boolean;
  failMediaAfterReceiveAt?: number;
}
interface MockCapture {
  taxonomyCalls: number;
  mediaCreateCalls: number;
  mediaUpdateCalls: Array<{ id: number; body: Record<string, unknown> }>;
  postCalls: number;
  postPayloads: Array<Record<string, unknown>>;
  authHeaders: string[];
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function startMock(options: MockOptions = {}) {
  const capture: MockCapture = {
    taxonomyCalls: 0,
    mediaCreateCalls: 0,
    mediaUpdateCalls: [],
    postCalls: 0,
    postPayloads: [],
    authHeaders: [],
  };
  let nextMediaId = 100;
  const termIds: Record<string, number> = { Workflow: 10, WordPress: 11, Markdown: 20, Gutenberg: 21 };
  const server = createServer(async (req, res) => {
    capture.authHeaders.push(String(req.headers.authorization ?? ""));
    if (options.authFailure) {
      json(res, 401, {
        code: "rest_not_logged_in",
        message: `bad credentials ${credentials.username} ${credentials.applicationPassword}`,
      });
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && (url.pathname.endsWith("/categories") || url.pathname.endsWith("/tags"))) {
      capture.taxonomyCalls += 1;
      const name = url.searchParams.get("search") ?? "";
      if (name === options.missingTerm) json(res, 200, []);
      else json(res, 200, termIds[name] ? [{ id: termIds[name], name }] : []);
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/media")) {
      capture.mediaCreateCalls += 1;
      await readBody(req);
      if (options.failMediaAfterReceiveAt === capture.mediaCreateCalls) {
        req.socket.destroy();
        return;
      }
      const id = nextMediaId++;
      const disposition = String(req.headers["content-disposition"] ?? "");
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `media-${id}.bin`;
      json(res, 201, { id, source_url: `https://cdn.example.test/${filename}` });
      return;
    }
    const mediaUpdate = /\/media\/(\d+)$/.exec(url.pathname);
    if (req.method === "POST" && mediaUpdate) {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      capture.mediaUpdateCalls.push({ id: Number(mediaUpdate[1]), body });
      json(res, 200, { id: Number(mediaUpdate[1]) });
      return;
    }
    if (req.method === "POST" && url.pathname.endsWith("/posts")) {
      capture.postCalls += 1;
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      capture.postPayloads.push(body);
      if (options.failPostAfterReceive) {
        req.socket.destroy();
        return;
      }
      json(res, 201, { id: 500, link: "https://wp.example.test/?p=500" });
      return;
    }
    json(res, 404, { code: "not_found", message: url.pathname });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock server did not bind");
  const profile = normalizeSiteProfile(
    { id: "mock-site", baseUrl: `http://127.0.0.1:${address.port}`, postType: "posts" },
    { allowInsecureHttpForTests: true },
  );
  return {
    capture,
    profile,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function assertPressDrop(error: unknown, code: string): asserts error is PressDropError {
  assert.ok(error instanceof PressDropError);
  assert.equal(error.code, code);
}

test("mock submission resolves taxonomy, uploads media, substitutes Gutenberg media, and creates draft", async () => {
  const mock = await startMock();
  try {
    const state = new MemorySubmissionStateStore();
    const result = await submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state });
    assert.equal(result.reused, false);
    assert.equal(result.post.id, 500);
    assert.equal(result.post.editUrl, `${mock.profile.baseUrl}/wp-admin/post.php?post=500&action=edit`);
    assert.deepEqual(result.categoryIds, [10, 11]);
    assert.deepEqual(result.tagIds, [20, 21]);
    assert.equal(mock.capture.mediaCreateCalls, 3);
    assert.equal(mock.capture.postCalls, 1);
    const post = mock.capture.postPayloads[0];
    assert.equal(post.status, "draft");
    assert.deepEqual(post.categories, [10, 11]);
    assert.deepEqual(post.tags, [20, 21]);
    assert.equal(post.featured_media, 100);
    assert.match(String(post.content), /wp:image \{"id":101,"sizeSlug":"full"\}/);
    assert.match(String(post.content), /https:\/\/cdn\.example\.test\/photo-01\.png/);
    assert.match(String(post.content), /Photo: PressDrop sample/);
    assert.deepEqual(
      mock.capture.mediaUpdateCalls.map((item) => item.body.alt_text),
      ["ノートPCの横に置かれた原稿メモ", "Gutenbergブロックの流れを示す図"],
    );
    assert.ok(mock.capture.authHeaders.every((value) => value.startsWith("Basic ")));
  } finally {
    await mock.close();
  }
});

test("missing taxonomy term blocks submission before media side effects", async () => {
  const mock = await startMock({ missingTerm: "WordPress" });
  try {
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: new MemorySubmissionStateStore() }),
      (error) => { assertPressDrop(error, "TAXONOMY_RESOLUTION_ERROR"); return true; },
    );
    assert.equal(mock.capture.mediaCreateCalls, 0);
    assert.equal(mock.capture.postCalls, 0);
  } finally {
    await mock.close();
  }
});

test("identical successful retry reuses state without duplicate REST side effects", async () => {
  const mock = await startMock();
  try {
    const state = new MemorySubmissionStateStore();
    const first = await submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state });
    const callsAfterFirst = {
      taxonomy: mock.capture.taxonomyCalls,
      media: mock.capture.mediaCreateCalls,
      post: mock.capture.postCalls,
    };
    const second = await submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state });
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.post.id, first.post.id);
    assert.deepEqual(second.categoryIds, [10, 11]);
    assert.deepEqual(second.tagIds, [20, 21]);
    assert.deepEqual(
      { taxonomy: mock.capture.taxonomyCalls, media: mock.capture.mediaCreateCalls, post: mock.capture.postCalls },
      callsAfterFirst,
    );
  } finally {
    await mock.close();
  }
});

test("credentials are redacted from remote auth errors", async () => {
  const mock = await startMock({ authFailure: true });
  try {
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: new MemorySubmissionStateStore() }),
      (error) => {
        assertPressDrop(error, "AUTH_ERROR");
        assert.doesNotMatch(error.message, /secret-app-password/);
        assert.doesNotMatch(error.message, /pressdrop-user/);
        return true;
      },
    );
  } finally {
    await mock.close();
  }
});

test("JSON submission state never stores WordPress credentials", async () => {
  const mock = await startMock();
  const temp = await mkdtemp(path.join(os.tmpdir(), "pressdrop-state-"));
  const statePath = path.join(temp, "state.json");
  try {
    await submitBundle({
      bundleDir: example,
      profile: mock.profile,
      credentials,
      stateStore: new JsonSubmissionStateStore(statePath),
    });
    const raw = await readFile(statePath, "utf8");
    assert.doesNotMatch(raw, /secret-app-password/);
    assert.doesNotMatch(raw, /pressdrop-user/);
    assert.match(raw, /"phase": "completed"/);
  } finally {
    await mock.close();
  }
});

test("uncertain media upload is recorded and retry refuses a possible duplicate upload", async () => {
  const mock = await startMock({ failMediaAfterReceiveAt: 2 });
  try {
    const state = new MemorySubmissionStateStore();
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state }),
      (error) => { assertPressDrop(error, "MEDIA_UPLOAD_ERROR"); return true; },
    );
    assert.equal(mock.capture.mediaCreateCalls, 2);
    assert.equal(mock.capture.postCalls, 0);
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state }),
      (error) => { assertPressDrop(error, "DUPLICATE_CANDIDATE"); assert.match(error.message, /possible duplicate/); return true; },
    );
    assert.equal(mock.capture.mediaCreateCalls, 2);
  } finally {
    await mock.close();
  }
});

test("uncertain post creation is recorded and retry refuses a possible duplicate", async () => {
  const mock = await startMock({ failPostAfterReceive: true });
  try {
    const state = new MemorySubmissionStateStore();
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state }),
      (error) => { assertPressDrop(error, "POST_CREATE_ERROR"); return true; },
    );
    assert.equal(mock.capture.postCalls, 1);
    assert.equal(mock.capture.mediaCreateCalls, 3);
    await assert.rejects(
      () => submitBundle({ bundleDir: example, profile: mock.profile, credentials, stateStore: state }),
      (error) => {
        assertPressDrop(error, "DUPLICATE_CANDIDATE");
        assert.match(error.message, /refusing to create a possible duplicate/);
        return true;
      },
    );
    assert.equal(mock.capture.postCalls, 1);
  } finally {
    await mock.close();
  }
});

test("site profile rejects HTTP outside explicit test mode", () => {
  assert.throws(
    () => normalizeSiteProfile({ id: "bad", baseUrl: "http://example.com", postType: "posts" }),
    (error: unknown) => { assertPressDrop(error, "SITE_PROFILE_ERROR"); return true; },
  );
});
