import assert from "node:assert/strict";
import test from "node:test";
import { articleViewModel, progressState, remoteSafetyCopy } from "./view-model.js";

const article = {
  title: "Real title",
  excerpt: "Real excerpt",
  blocks: [
    { type: "heading", level: 2, text: "Heading" },
    { type: "paragraph", text: "Body" },
    { type: "image", mediaRef: "media:photo.png", alt: "Alt", caption: "Caption", credit: "Credit" },
  ],
  media: [{ ref: "media:photo.png", path: "photo.png", role: "featured-and-inline" }],
  categories: ["Workflow"],
  tags: ["Markdown"],
  meta: { author: "Example" },
  featuredMediaRef: "media:photo.png",
};

test("normalized article data becomes the UI view model without sample substitutions", () => {
  const view = articleViewModel(article);
  assert.equal(view.title, "Real title");
  assert.equal(view.excerpt, "Real excerpt");
  assert.deepEqual(view.headings, [{ level: 2, text: "Heading" }]);
  assert.equal(view.images[0].filename, "photo.png");
  assert.equal(view.images[0].alt, "Alt");
  assert.equal(view.images[0].caption, "Caption");
  assert.equal(view.images[0].credit, "Credit");
  assert.deepEqual(view.categories, ["Workflow"]);
  assert.deepEqual(view.tags, ["Markdown"]);
  assert.equal(view.featuredImage, "photo.png");
});

test("progress reflects real core phases", () => {
  assert.deepEqual(progressState("uploading_media").map(({ done, active }) => [done, active]), [
    [true, false],
    [false, true],
    [false, false],
  ]);
});

test("remote safety copy never claims no side effects after ambiguous remote phases", () => {
  assert.match(remoteSafetyCopy({ remoteMutation: "media_may_have_changed" }), /可能性/);
  assert.match(remoteSafetyCopy({ remoteMutation: "media_changed_draft_may_exist" }), /下書き作成も成功している可能性/);
  assert.equal(remoteSafetyCopy({ remoteMutation: "none" }), "WordPressへの変更はまだ行われていません。");
});
