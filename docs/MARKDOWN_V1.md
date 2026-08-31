# PressDrop Markdown v1

Status: **implemented for the first local vertical slice**

PressDrop Markdown v1 is intentionally small and explicit. It exists to make the first parser deterministic and inspectable before any WordPress side effects are introduced.

## Bundle layout

A manuscript bundle is a directory containing `article.md` and local image assets:

```text
bundle/
├── article.md
└── images/
    ├── cover.png
    ├── photo-01.png
    └── photo-02.png
```

Image paths are always relative to the bundle. Absolute paths and paths that escape the bundle are rejected.

## Front matter

`article.md` must begin with YAML front matter delimited by `---`.

```yaml
---
title: "Article title"
excerpt: "Optional lead"
categories:
  - News
  - Tokyo
tags:
  - Example
featured_image: images/cover.png
meta:
  desk: culture
  sponsored: false
---
```

Supported top-level fields are:

- `title` — required non-empty string
- `excerpt` — optional string
- `categories` — optional list of unique non-empty strings
- `tags` — optional list of unique non-empty strings
- `featured_image` — optional relative image path
- `meta` — optional mapping of simple scalar values (`string`, `number`, `boolean`, `null`)

Unknown fields fail parsing instead of being silently ignored. The parser implements only the YAML subset documented above; anchors, multiline scalars, inline arrays, and other YAML features are rejected.

## Body blocks

Markdown v1 supports exactly three normalized body block types:

- paragraph
- H2 / H3 heading
- explicit image

H1 and H4–H6 are rejected. Raw HTML is rejected. Standard Markdown image syntax is also rejected in v1 so image metadata cannot be ambiguous.

### Explicit image directive

Use an image directive followed by all three metadata lines:

```md
{{image:images/photo-01.png}}
alt: Descriptive alternative text
caption: Visible caption
credit: Photo: Example Photographer
```

`alt`, `caption`, and `credit` are required, may appear in any order, and must not be duplicated. Unknown metadata keys fail parsing.

The directive is normalized to an image block with a stable local `mediaRef`. Caption and credit remain distinct in the normalized model. The current local Gutenberg serializer renders the credit inside the image figcaption using a dedicated `pressdrop-image-credit` span; a future site profile may map the preserved semantic credit differently.

## Local inspection

With Node.js 22.6 or later:

```bash
npm run inspect
npm run gutenberg
npm test
```

For another bundle, call the CLI directly:

```bash
node --experimental-strip-types src/cli.ts inspect path/to/bundle
node --experimental-strip-types src/cli.ts gutenberg path/to/bundle
```

`inspect` emits deterministic JSON containing the normalized article and warnings. `gutenberg` emits local Gutenberg serialization with `pressdrop://...` image placeholders; real WordPress media IDs and URLs are intentionally outside Issue #3.
