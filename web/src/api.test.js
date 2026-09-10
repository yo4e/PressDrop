import assert from "node:assert/strict";
import test from "node:test";
import { pressDropApi } from "./api.js";

test("concurrent identical UI submissions share one request", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  globalThis.fetch = async () => {
    calls += 1;
    await gate;
    return new Response(JSON.stringify({ jobId: "job-1", status: "running", phase: "local_validation" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  };

  const input = {
    bundleDir: "examples/basic",
    profilePath: "config/site.json",
    username: "user",
    applicationPassword: "secret",
    expectedSourceFingerprint: "sha256:example",
  };

  try {
    const first = pressDropApi.startSubmission(input);
    const second = pressDropApi.startSubmission(input);
    assert.equal(first, second);
    assert.equal(calls, 1);

    release();
    assert.deepEqual(await first, { jobId: "job-1", status: "running", phase: "local_validation" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const third = pressDropApi.startSubmission(input);
    assert.equal(calls, 2);
    assert.notEqual(third, first);
    await third;
  } finally {
    release();
    globalThis.fetch = originalFetch;
  }
});
