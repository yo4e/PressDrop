import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PressDropError } from "../src/errors.ts";
import { generateGutenberg } from "../src/gutenberg.ts";
import { inspectBundle } from "../src/pipeline.ts";

const example = path.resolve("examples/basic");

async function tempBundle(article: string, images: string[] = []): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pressdrop-test-"));
  await mkdir(path.join(root, "images"), { recursive: true });
  await writeFile(path.join(root, "article.md"), article, "utf8");
  for (const image of images) {
    await writeFile(path.join(root, image), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  }
  return root;
}

async function expectPressDropError(run: () => Promise<unknown>, code: string, messagePart?: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof PressDropError);
    assert.equal(error.code, code);
    if (messagePart) assert.match(error.message, new RegExp(messagePart));
    return true;
  });
}

test("canonical bundle normalizes metadata, ordered blocks, and image semantics", async () => {
  const { article, warnings } = await inspectBundle(example);
  assert.deepEqual(warnings, []);
  assert.equal(article.schemaVersion, 1);
  assert.equal(article.title, "PressDropで、原稿からWordPress入稿をほどく");
  assert.deepEqual(article.categories, ["Workflow", "WordPress"]);
  assert.deepEqual(article.tags, ["Markdown", "Gutenberg"]);
  assert.equal(article.featuredMediaRef, "media:images/cover.png");
  assert.deepEqual(article.blocks.map((block) => block.type), [
    "paragraph",
    "heading",
    "paragraph",
    "image",
    "paragraph",
    "heading",
    "paragraph",
    "image",
    "paragraph",
  ]);

  const firstImage = article.blocks.find((block) => block.type === "image");
  assert.deepEqual(firstImage, {
    type: "image",
    mediaRef: "media:images/photo-01.png",
    alt: "ノートPCの横に置かれた原稿メモ",
    caption: "原稿と画像をひとつの入稿セットとして扱う",
    credit: "Photo: PressDrop sample",
  });
});

test("canonical bundle generates inspectable Gutenberg blocks with local placeholders", async () => {
  const { article } = await inspectBundle(example);
  const content = generateGutenberg(article);
  assert.match(content, /<!-- wp:paragraph -->/);
  assert.match(content, /<!-- wp:heading \{"level":2\} -->/);
  assert.match(content, /<!-- wp:image -->/);
  assert.match(content, /src="pressdrop:\/\/images\/photo-01.png"/);
  assert.match(content, /pressdrop-image-credit/);
  assert.match(content, /Photo: PressDrop sample/);
});

test("uploaded media mapping produces WordPress image ids and URLs", async () => {
  const { article } = await inspectBundle(example);
  const content = generateGutenberg(article, {
    "media:images/photo-01.png": { id: 44, url: "https://cdn.example.test/photo-01.png" },
    "media:images/photo-02.png": { id: 45, url: "https://cdn.example.test/photo-02.png" },
  });
  assert.match(content, /<!-- wp:image \{"id":44,"sizeSlug":"full"\} -->/);
  assert.match(content, /class="wp-image-44"/);
  assert.match(content, /https:\/\/cdn\.example\.test\/photo-01\.png/);
});

test("repeated inspection is deterministic", async () => {
  const first = await inspectBundle(example);
  const second = await inspectBundle(example);
  assert.deepEqual(second, first);
  assert.match(first.article.source.fingerprint, /^sha256:[0-9a-f]{64}$/);
});

test("missing referenced image blocks generation", async () => {
  const bundle = await tempBundle(`---\ntitle: Missing image\n---\n\n{{image:images/missing.png}}\nalt: Missing\ncaption: Missing\ncredit: Missing\n`);
  await expectPressDropError(() => inspectBundle(bundle), "MISSING_MEDIA", "does not exist");
});

test("malformed front matter fails visibly", async () => {
  const bundle = await tempBundle(`---\ntitle: Broken\ncategories:\n - Wrong indentation\n---\n\nBody\n`);
  await expectPressDropError(() => inspectBundle(bundle), "PARSE_ERROR", "two-space list indentation");
});

test("malformed image directive requires explicit metadata", async () => {
  const bundle = await tempBundle(
    `---\ntitle: Broken image\n---\n\n{{image:images/photo.png}}\nalt: Alt\ncaption: Caption\n`,
    ["images/photo.png"],
  );
  await expectPressDropError(() => inspectBundle(bundle), "PARSE_ERROR", "requires credit");
});

test("missing required title fails validation", async () => {
  const bundle = await tempBundle(`---\ntags:\n  - Example\n---\n\nBody\n`);
  await expectPressDropError(() => inspectBundle(bundle), "VALIDATION_ERROR", "title is required");
});

test("unsupported heading levels are rejected", async () => {
  const bundle = await tempBundle(`---\ntitle: Heading test\n---\n\n#### Too deep\n`);
  await expectPressDropError(() => inspectBundle(bundle), "UNSUPPORTED_BLOCK", "Only H2 and H3");
});

test("raw HTML is rejected", async () => {
  const bundle = await tempBundle(`---\ntitle: HTML test\n---\n\n<script>alert(1)</script>\n`);
  await expectPressDropError(() => inspectBundle(bundle), "VALIDATION_ERROR", "Raw HTML");
});

test("unknown front matter fields are rejected instead of ignored", async () => {
  const bundle = await tempBundle(`---\ntitle: Unknown\nmystery: value\n---\n\nBody\n`);
  await expectPressDropError(() => inspectBundle(bundle), "PARSE_ERROR", "Unknown front matter field");
});
