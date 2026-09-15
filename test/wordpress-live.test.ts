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
const authorization = "Basic " + Buffer.from(user + ":" + token, "utf8").toString("base64");

async function wpJson(relative: string): Promise<unknown> {
  const response = await fetch(endpoint + relative, {
    headers: { Authorization: authorization },
  });
  const text = await response.text();
  assert.equal(
    response.ok,
    true,
    "WordPress GET " + relative + " returned HTTP " + response.status + ": " + text.slice(0, 300),
  );
  try {
    return JSON.parse(text);
  } catch {
    assert.fail("WordPress GET " + relative + " returned non-JSON: " + text.slice(0, 300));
  }
}

async function remoteCounts(): Promise<{ drafts: number; media: number }> {
  const drafts = await wpJson("/wp-json/wp/v2/posts?context=edit&status=draft&per_page=100&_fields=id");
  const media = await wpJson("/wp-json/wp/v2/media?context=edit&per_page=100&_fields=id");
  assert.ok(Array.isArray(drafts));
  assert.ok(Array.isArray(media));
  return { drafts: drafts.length, media: media.length };
}

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
    const taxonomyProbe = await wpJson(
      "/wp-json/wp/v2/categories?search=Workflow&per_page=100&_fields=id%2Cname",
    );
    assert.ok(Array.isArray(taxonomyProbe));

    const before = await remoteCounts();
    const preflight = await preflightBundle({
      bundleDir: path.resolve("examples/basic"),
      profile,
      credentials,
    });
    assert.deepEqual(preflight.article.categories, ["Workflow", "WordPress"]);
    assert.deepEqual(preflight.article.tags, ["Markdown", "Gutenberg"]);
    assert.deepEqual(await remoteCounts(), before, "taxonomy preflight must be read-only");

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

    const post = await wpJson(
      "/wp-json/wp/v2/posts/" + first.post.id + "?context=edit&_fields=id,status,content,featured_media,categories,tags",
    ) as {
      id: number;
      status: string;
      content: { raw?: string };
      featured_media: number;
      categories: number[];
      tags: number[];
    };
    assert.equal(post.id, first.post.id);
    assert.equal(post.status, "draft");
    assert.deepEqual(post.categories, first.categoryIds);
    assert.deepEqual(post.tags, first.tagIds);

    const rawContent = post.content.raw ?? "";
    assert.match(rawContent, /<!-- wp:heading/);
    assert.match(rawContent, /<!-- wp:image/);
    assert.ok(rawContent.includes("Photo: PressDrop sample"));
    assert.ok(rawContent.includes("Illustration: PressDrop sample"));

    assert.ok(preflight.article.featuredMediaRef);
    const featured = first.media[preflight.article.featuredMediaRef];
    assert.ok(featured);
    assert.equal(post.featured_media, featured.id);

    for (const block of preflight.article.blocks) {
      if (block.type !== "image") continue;
      const uploaded = first.media[block.mediaRef];
      assert.ok(uploaded);
      const media = await wpJson(
        "/wp-json/wp/v2/media/" + uploaded.id + "?context=edit&_fields=id,alt_text,caption",
      ) as {
        id: number;
        alt_text?: string;
        caption?: { raw?: string; rendered?: string };
      };
      assert.equal(media.alt_text, block.alt);
      const caption = media.caption?.raw ?? media.caption?.rendered ?? "";
      assert.ok(caption.includes(block.caption));
    }

    const afterFirst = await remoteCounts();
    assert.equal(afterFirst.drafts, before.drafts + 1);
    assert.equal(afterFirst.media, before.media + preflight.article.media.length);

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
    assert.deepEqual(
      await remoteCounts(),
      afterFirst,
      "identical completed retry must not create additional WordPress side effects",
    );

    const rawState = await readFile(statePath, "utf8");
    assert.equal(rawState.includes(user), false);
    assert.equal(rawState.includes(token), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
