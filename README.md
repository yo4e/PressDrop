# PressDrop

**Drop a manuscript in. Get a WordPress draft out.**

PressDrop is an experimental, general-purpose submission assistant for turning structured manuscripts into clean WordPress drafts.

The goal is not to replace WordPress, invent another CMS, or generate articles with AI. PressDrop focuses on the awkward middle step between a finished manuscript and a correctly structured WordPress draft: parsing the manuscript, validating its structure, uploading media, mapping metadata, generating Gutenberg blocks, and creating a draft that a human can review.

> Status: **design / pre-MVP**. The architecture is being defined before implementation begins.

## Why PressDrop?

Writers and editors often finish an article in Google Docs, Word, Markdown, or another authoring environment, then manually repeat the same work in WordPress:

- copy title and body
- restore headings and formatting
- upload images
- enter alt text, captions, and credits
- choose categories and tags
- copy notes and metadata
- repair Gutenberg blocks
- check everything again before publishing

Existing tools can automate parts of this workflow, but the initial research for this project found a recurring gap: **reliably interpreting a publication's manuscript rules and mapping them to WordPress in a controlled, reusable way**.

See: [WordPress submission assistant research](docs/research/wordpress-submission-assistant-research.md).

## Core idea

PressDrop treats submission as a deterministic transformation pipeline:

```text
Manuscript
  ↓
Input adapter
  ↓
Normalized article model
  ↓
Validation + preview
  ↓
Media upload
  ↓
Gutenberg serialization
  ↓
WordPress REST API
  ↓
Draft post
  ↓
Human review / publish
```

The normalized article model is the key boundary. Input formats and WordPress sites should be replaceable without rewriting the whole pipeline.

## Design principles

### 1. Draft first

PressDrop creates **drafts**, not automatically published posts, in the initial product. Publishing remains a human decision.

### 2. Explicit beats clever

The first versions should not guess what a piece of text "probably" means. Manuscript structure should be expressed through known styles, front matter, labels, or templates whenever possible.

AI-assisted interpretation may be explored later, but correctness and reproducibility come first.

### 3. One core model, many adapters

DOCX, Markdown, Google Docs, and HTML should converge on one normalized article representation. WordPress-specific output should consume that representation rather than knowing how every source format works.

### 4. WordPress-native output

Where practical, PressDrop should generate standard Gutenberg blocks and use official WordPress APIs rather than browser automation.

### 5. Idempotent by design

Re-running the same manuscript should not casually create duplicate posts or duplicate media. Manuscript IDs/hashes, WordPress post IDs, and media hashes should be tracked so retries are safe.

### 6. Site-specific behavior belongs in configuration

Categories, tags, custom post types, custom fields, SEO metadata, and site-specific block mappings vary by publication. Those differences should live in a site profile/configuration layer rather than being hard-coded into the parser.

### 7. Keep the core small

PressDrop is not a CMS, document editor, collaboration suite, or workflow engine. Its job is to move a structured manuscript into WordPress accurately and visibly.

## Proposed MVP

The current research suggests starting with a narrow vertical slice.

### Inputs

- Markdown + front matter
- DOCX using documented Word styles

Google Docs can initially be handled through DOCX export; a native Google Docs adapter can be added later.

### Article elements

- title
- lead / excerpt
- paragraphs
- headings
- images
- alt text
- captions
- credits
- basic notes
- categories
- tags
- simple custom metadata

### Output

- standard WordPress posts
- standard Gutenberg blocks
- WordPress media library uploads
- `status: draft`

### MVP safety / UX

- validate required fields before submission
- show a preview or normalized representation before upload
- clearly report conversion warnings
- avoid duplicate posts/media on retry
- return the created WordPress draft URL

## Not in the initial MVP

- automatic publishing
- full CMS functionality
- AI article generation or rewriting
- arbitrary visual-layout preservation from Word
- every Gutenberg/custom block
- bidirectional WordPress ↔ manuscript synchronization
- complex approval workflows
- unlimited batch publishing
- support for every SEO plugin

## Proposed technical direction

The implementation stack is not locked yet, but a TypeScript/Node.js core is a strong candidate because the current design can reuse mature libraries in the same ecosystem:

- `mammoth` for DOCX → semantic HTML
- `remark` for Markdown parsing
- `rehype` for HTML parsing/transformation/sanitization
- JSON Schema / TypeScript types for the normalized article model
- WordPress REST API for posts, media, categories, tags, and exposed metadata
- WordPress block serialization/parser packages for Gutenberg validation

The important decision is the architecture, not the framework. See [DESIGN.md](docs/DESIGN.md).

## Repository structure

```text
.
├── README.md
└── docs/
    ├── DESIGN.md
    └── research/
        └── wordpress-submission-assistant-research.md
```

This will expand once implementation begins.

## Current questions

Several product decisions intentionally remain open:

- Should the first user-facing form be a CLI, local web app, desktop app, or hosted service?
- What is the smallest useful manuscript template for non-technical editors?
- How should site profiles express custom fields and site-specific Gutenberg blocks?
- How much state should PressDrop persist locally for idempotency and audit history?
- Should native Google Docs support arrive before or after the first DOCX/Markdown vertical slice?

These are tracked as design questions rather than silently fixed in code.

## Research

The initial research compared existing SaaS products, WordPress plugins, browser extensions, OSS libraries, and official WordPress APIs. Its main conclusion was that a small custom layer is most defensible when the workflow requires multiple input formats, explicit manuscript rules, captions/credits, taxonomy/meta mapping, Gutenberg correctness, and reusable multi-site behavior.

Read the full report: [docs/research/wordpress-submission-assistant-research.md](docs/research/wordpress-submission-assistant-research.md).

## License

Not decided yet.
