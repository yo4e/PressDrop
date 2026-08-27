# PressDrop Initial Implementation Target

Status: **initial implementation target**  
Date: 2026-08-27

This document narrows the first useful PressDrop implementation to the workflow that should be proven before broader format support or richer UI work.

## 1. User-visible goal

The first implementation should make this workflow real:

> Give PressDrop a manuscript and its image files, specify the target WordPress site, and get a correctly structured WordPress draft according to explicit submission rules.

The primary first input is **Markdown plus local image files**. Markdown is a practical starting format, not a permanent product limitation. DOCX, Google Docs, or other adapters can be added later if they can produce the same normalized article model.

The important product concept is:

```text
manuscript + assets + submission rules
                ↓
             PressDrop
                ↓
       WordPress draft
```

## 2. Minimum input bundle

A first-run input can be as small as:

```text
article.md
images/
  cover.jpg
  01.jpg
  02.png
```

`article.md` contains the article structure and metadata. Image references in the manuscript point to files supplied with the manuscript.

The exact packaging mechanism is not fixed yet. It may initially be a local directory selected by a CLI or local UI.

## 3. Metadata the manuscript must be able to specify

The Markdown input should support explicit values for at least:

- title
- excerpt / lead when needed
- categories
- tags
- featured image
- simple custom metadata where the target site profile permits it

YAML front matter is the leading initial convention because it is deterministic and easy to parse.

Example:

```yaml
---
title: "Article title"
categories:
  - Interview
  - Tokyo
tags:
  - Architecture
  - Design
featured_image: images/cover.jpg
---
```

PressDrop should resolve category and tag names against WordPress according to the selected site profile. Whether missing terms may be created automatically must be a site-profile policy rather than an implicit global behavior.

## 4. Images inside the article

The author must be able to place an image at an exact position in the manuscript rather than relying on PressDrop to guess where it belongs.

A provisional explicit syntax could look like:

```md
## Section heading

Body text.

{{image:images/01.jpg}}
caption: Venue interior
credit: Photo: Example Photographer
alt: Interior of the venue

More body text.
```

The exact syntax is **not yet locked**. The requirement is the behavior:

1. the manuscript explicitly identifies the image file;
2. PressDrop verifies that the file exists before submission;
3. the image is uploaded to the WordPress media library;
4. alt text, caption, and credit are preserved according to the site profile;
5. a Gutenberg image block is inserted at the exact manuscript position;
6. the resulting media ID/URL is used in the generated block;
7. retrying the same submission should not casually upload the same image again.

The first implementation does not need AI image placement or visual inference.

## 5. Site profiles / submission rules

Different WordPress sites have different submission conventions. Those differences should be represented as a **site profile**, not hard-coded into the Markdown parser.

A site profile may eventually define rules such as:

- WordPress base URL and connection identity
- allowed post type
- category/tag behavior
- default category
- custom-field mappings
- how image credit is rendered
- whether a caption is required
- featured-image behavior
- allowed Gutenberg blocks
- validation requirements

Conceptually:

```yaml
site: example-publication
post_type: post

taxonomy:
  create_missing_categories: false
  create_missing_tags: true

images:
  require_alt: true
  credit_mode: below_caption
```

This example is illustrative; the profile schema is not yet fixed.

## 6. First implementation flow

The first vertical slice should prove the complete path rather than building disconnected components:

```text
1. Select manuscript directory
2. Read Markdown + front matter
3. Resolve local image references
4. Convert to PressDrop normalized article model
5. Validate required fields and assets
6. Show dry-run / preview representation
7. Resolve categories and tags on WordPress
8. Upload/reuse media
9. Generate standard Gutenberg blocks
10. Validate serialized Gutenberg output
11. Create WordPress post with status=draft
12. Return the draft URL
```

A failure before step 7 should have no WordPress side effects wherever practical.

## 7. Initial supported article content

The first useful slice should support:

- title
- excerpt / lead
- paragraphs
- H2/H3 headings
- basic lists and links if naturally provided by the Markdown parser
- inline article images
- featured image
- image alt text
- image caption
- image credit
- categories
- tags
- simple configured metadata

The output target is standard WordPress posts using standard Gutenberg blocks.

## 8. Explicitly outside the first slice

Do not delay the first working workflow for:

- native Google Docs input
- full DOCX support
- AI inference of manuscript structure
- AI image placement
- automatic publishing
- arbitrary custom Gutenberg blocks
- exact preservation of complex source-document layout
- bidirectional synchronization
- rich collaborative editing
- broad batch publishing
- support for every WordPress plugin or SEO system

These may be added only after the core manuscript + assets → draft flow works reliably.

## 9. Acceptance criteria for the first useful version

The first implementation is useful when a test article can be submitted without manually reconstructing it in WordPress.

At minimum, given one Markdown article and several local images, PressDrop should be able to:

- parse the article deterministically;
- reject missing referenced images before submission;
- preserve the requested image positions;
- upload the images;
- preserve alt/caption/credit information according to the active profile;
- attach the requested categories and tags;
- set the requested featured image;
- generate valid standard Gutenberg content;
- create a WordPress **draft**, never publish automatically;
- return a URL that a human can open for final review;
- make a retry safe enough that accidental duplicate posts/media are not the normal outcome.

## 10. Product definition emerging from this slice

A concise working definition of PressDrop is:

> **PressDrop takes a manuscript, its assets, and explicit submission rules, then creates a reviewable WordPress draft.**

Markdown is the first adapter. WordPress is the first output target. The reusable product is the controlled transformation layer between them.
