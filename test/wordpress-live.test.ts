import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeSiteProfile } from "../src/wordpress/site-profile.ts";
import { JsonSubmissionStateStore } from "../src/wordpress/state.ts";
import { preflightBundle, submitBundle } from "../src/wordpress/submit.ts";

const endpoint = process.env.PRESSDROP_LIVE_BASE_URL ?? "";
const user = process.env.PRESSDROP_LIVE_USERNAME ?? "";
const token = process.env.PRESSDROP_LIVE_TOKEN ?? "";
const enabled = Boolean(endpoint && user && token);

test("PressDrop submits once to disposable real WordPress and reuses the completed result", { skip: !enabled }, async () => {
  const profile = normalizeSiteProfile(
    { id: "ci-real-wordpress", baseUrl: endpoint, postType: "posts" },
    { allowInsecureHttpForTests: true },
  );
  const credentials = { username: user, applicationPassword: token };
  const temp = await mkdtemp(path.join(os.tmpdir(), "pressdrop-live-"));
  const statePath = path.join(temp, "state.json");
  const stateStore = new JsonSubmissionStateStore(statePath);

  try {
    const probeResponse = await fetch(
      endpoint + "/wp-json/wp/v2/categories?search=Workflow&per_page=100&_fields=id%2Cname",
      {
        headers: {
          Authorization: "Basic " + Buffer.from(user + ":" + token, "utf8").toString("base64"),
        },
      },
    );
    const probeText = await probeResponse.text();
    assert.equal(
      probeResponse.ok,
      true,
      "WordPress taxonomy probe returned HTTP " + probeResponse.status + ": " + probeText.slice(0, 300),
    );
    let probePayload: unknown;
    try {
      probePayload = JSON.parse(probeText);
    } catch {
      assert.fail("WordPress taxonomy probe returned non-JSON: " + probeText.slice(0, 300));
    }
    assert.ok(
      Array.isArray(probePayload),
      "WordPress taxonomy probe returned unexpected JSON: " + JSON.stringify(probePayload).slice(0, 500),
    );

    const preflight = await preflightBundle({
      bundleDir: path.resolve("examples/basic"),
      profile,
      credentials,
    });
    assert.deepEqual(preflight.article.categories, ["Workflow", "WordPress"]);
    assert.deepEqual(preflight.article.tags, ["Markdown", "Gutenberg"]);

    const first = await submitBundle({
      bundleDir: path.resolve("examples/basic"),
      profile,
      credentials,
      stateStore,
      expectedSourceFingerprint: preflight.article.source.fingerprint,
    });
    assert.equal(first.reused, false);
    assert.ok(first.post.id > 0);
    assert.equal(first.post.editUrl, endpoint + "/wp-admin/post.php?post=" + first.post.id + "&action=edit");
    assert.equal(Object.keys(first.media).length, preflight.article.media.length);

    const second = await submitBundle({
      bundleDir: path.resolve("examples/basic"),
      profile,
      credentials,
      stateStore,
      expectedSourceFingerprint: preflight.article.source.fingerprint,
    });
    assert.equal(second.reused, true);
    assert.equal(second.post.id, first.post.id);
    assert.deepEqual(second.media, first.media);

    const rawState = await readFile(statePath, "utf8");
    assert.equal(rawState.includes(user), false);
    assert.equal(rawState.includes(token), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
