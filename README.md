# PressDrop

**Drop a manuscript in. Get a WordPress draft out.**

PressDrop is an experimental, general-purpose submission assistant for turning structured manuscripts into clean WordPress drafts.

The goal is not to replace WordPress, invent another CMS, or generate articles with AI. PressDrop focuses on the awkward middle step between a finished manuscript and a correctly structured WordPress draft: parsing the manuscript, validating its structure, uploading media, mapping metadata, generating Gutenberg blocks, and creating a draft that a human can review.

> Status: **first local vertical slice implemented**. Markdown + local images can now be parsed, normalized, validated, inspected, and serialized to Gutenberg locally. WordPress connection and remote side effects are not implemented yet.

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

## Initial implementation target

The first useful PressDrop slice is intentionally concrete:

> **Give PressDrop a Markdown manuscript plus its image files, and it creates a WordPress draft using explicit submission rules.**

The manuscript should be able to specify exact image positions, captions, credits, alt text, categories, tags, featured image, and simple metadata. PressDrop will eventually upload/reuse the supplied images, map the requested taxonomy and metadata, generate standard Gutenberg blocks, and create a reviewable `draft`.

Markdown is the first adapter, not the permanent product boundary. The reusable concept is:

```text
manuscript + assets + submission rules → PressDrop → WordPress draft
```

See [Initial Implementation Target](docs/INITIAL_IMPLEMENTATION.md) for the larger vertical slice and acceptance criteria.

## Local vertical slice

Issue #3 implements the side-effect-free half of that pipeline:

```text
Markdown + local images
        ↓
parse / normalize
        ↓
validate
        ↓
inspectable normalized Article JSON
        ↓
local Gutenberg serialization
```

The canonical fixture lives in [`examples/basic/`](examples/basic/). The implemented manuscript rules are documented in [PressDrop Markdown v1](docs/MARKDOWN_V1.md).

Requirements: Node.js 22.6 or later. The current implementation uses Node's built-in TypeScript type stripping so the first slice stays dependency-free.

```bash
npm run inspect
npm run gutenberg
npm test
```

To inspect another bundle:

```bash
node --experimental-strip-types src/cli.ts inspect path/to/bundle
node --experimental-strip-types src/cli.ts gutenberg path/to/bundle
```

`inspect` emits deterministic normalized JSON including source identity/fingerprint, ordered content blocks, local media references, categories, tags, metadata, and the featured image reference. `gutenberg` emits standard paragraph, heading, and image block serialization with deterministic `pressdrop://...` placeholders where uploaded WordPress media URLs will later be substituted.

Validation happens before generation. Missing images, malformed or unknown fields/directives, unsupported heading levels, unsafe raw HTML, invalid taxonomy values, and incomplete image metadata fail visibly with structured error codes.

**No WordPress credentials, uploads, REST calls, draft creation, or publishing occur in this slice.**

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

The broader implementation stack is not locked yet. The local slice establishes a TypeScript/Node.js core and normalized Article boundary without adding runtime dependencies. Future adapters and WordPress integration may reuse mature libraries in the same ecosystem:

- `mammoth` for DOCX → semantic HTML
- `remark` / `rehype` if broader Markdown/HTML syntax makes a full AST parser preferable to the intentionally small Markdown v1 grammar
- JSON Schema validators as the normalized model grows
- WordPress REST API for posts, media, categories, tags, and exposed metadata
- WordPress block serialization/parser packages for Gutenberg validation

The important decision is the architecture, not a particular framework. See [DESIGN.md](docs/DESIGN.md).

## Repository structure

```text
.
├── .github/workflows/test.yml
├── examples/basic/
│   ├── article.md
│   └── images/
├── src/
│   ├── cli.ts
│   ├── errors.ts
│   ├── frontmatter.ts
│   ├── gutenberg.ts
│   ├── markdown.ts
│   ├── model.ts
│   ├── pipeline.ts
│   └── validation.ts
├── test/pressdrop.test.ts
├── package.json
├── README.md
└── docs/
    ├── DESIGN.md
    ├── INITIAL_IMPLEMENTATION.md
    ├── MARKDOWN_V1.md
    └── research/
        └── wordpress-submission-assistant-research.md
```

## Current questions

Several product decisions intentionally remain open:

- Should the first user-facing form be a CLI, local web app, desktop app, or hosted service?
- How should site profiles express custom fields and site-specific Gutenberg blocks?
- How much state should PressDrop persist locally for idempotency and audit history?
- Should native Google Docs support arrive before or after the first DOCX/Markdown vertical slice?
- When should the deliberately small Markdown v1 grammar move to a full Markdown AST implementation?

These are tracked as design questions rather than silently fixed in code.

## Research

The initial research compared existing SaaS products, WordPress plugins, browser extensions, OSS libraries, and official WordPress APIs. Its main conclusion was that a small custom layer is most defensible when the workflow requires multiple input formats, explicit manuscript rules, captions/credits, taxonomy/meta mapping, Gutenberg correctness, and reusable multi-site behavior.

Read the full report: [docs/research/wordpress-submission-assistant-research.md](docs/research/wordpress-submission-assistant-research.md).

## License

Not decided yet.
