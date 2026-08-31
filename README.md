# PressDrop

**Drop a manuscript in. Get a WordPress draft out.**

PressDrop is an experimental, general-purpose submission assistant for turning structured manuscripts into clean WordPress drafts.

The goal is not to replace WordPress, invent another CMS, or generate articles with AI. PressDrop focuses on the awkward middle step between a finished manuscript and a correctly structured WordPress draft: parsing the manuscript, validating its structure, uploading media, mapping metadata, generating Gutenberg blocks, and creating a draft that a human can review.

> Status: **first WordPress submission slice implemented against deterministic mocks**. Markdown + local images can be parsed, normalized, validated, uploaded/mapped through the WordPress REST contract, and turned into a `draft`. Live WordPress verification is still pending.

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

The manuscript can specify exact image positions, captions, credits, alt text, categories, tags, featured image, and simple metadata. The current WordPress slice can resolve existing taxonomy terms, upload the supplied images, substitute real media IDs/URLs into Gutenberg blocks, and create a reviewable `draft` using explicit runtime configuration.

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

Requirements: Node.js 22.6 or later. The current implementation uses Node's built-in TypeScript type stripping so the first slices stay dependency-free.

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

`inspect` emits deterministic normalized JSON including source identity/fingerprint, ordered content blocks, local media references, categories, tags, metadata, and the featured image reference. `gutenberg` emits standard paragraph, heading, and image block serialization with deterministic `pressdrop://...` placeholders.

Validation happens before generation. Missing images, malformed or unknown fields/directives, unsupported heading levels, unsafe raw HTML, invalid taxonomy values, and incomplete image metadata fail visibly with structured error codes.

These local commands have **no WordPress side effects**.

## WordPress draft submission slice

Issue #5 adds the first remote boundary without changing the Markdown parser contract:

```text
validated normalized Article
        ↓
resolve existing categories / tags
        ↓
upload media
        ↓
substitute WordPress media IDs / URLs
        ↓
Gutenberg serialization
        ↓
create status=draft post
        ↓
persist retry state
```

The site profile contains only non-secret connection identity. Start from [`config/site.example.json`](config/site.example.json):

```json
{
  "id": "example-publication",
  "baseUrl": "https://wordpress.example.com",
  "postType": "posts"
}
```

Credentials are supplied only at runtime:

```bash
export PRESSDROP_WP_USERNAME='pressdrop-user'
export PRESSDROP_WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

Submission is an explicit command:

```bash
node --experimental-strip-types src/cli.ts submit \
  path/to/bundle \
  config/my-site.json
```

The default local retry state is `.pressdrop/state.json`, which is ignored by Git. A different state path can be supplied as the final CLI argument or through `PRESSDROP_STATE_FILE`.

The current WordPress behavior is intentionally strict:

- HTTPS is required outside test-only mock mode;
- requested categories/tags must already exist and match exactly;
- missing taxonomy terms block the run before media upload;
- media IDs/URLs returned by WordPress replace local placeholders in final Gutenberg content;
- inline image alt/caption metadata is sent to the media endpoint while credit remains a separate normalized value rendered in the Gutenberg caption;
- the post endpoint always receives `status: draft`;
- an identical completed submission is reused without new REST side effects;
- if a media upload or draft creation may have succeeded but its HTTP result was lost, automatic retry stops with `DUPLICATE_CANDIDATE` instead of risking a duplicate.

Automated tests use a deterministic local mock WordPress server; CI needs no credentials or live site. **Compatibility with a real WordPress installation is still pending a test-site shakeout.**

See [WordPress draft submission](docs/WORDPRESS_SUBMISSION.md) for configuration, REST behavior, state semantics, and live-verification boundaries.

## Design principles

### 1. Draft first

PressDrop creates **drafts**, not automatically published posts, in the initial product. Publishing remains a human decision.

### 2. Explicit beats clever

The first versions should not guess what a piece of text "probably" means. Manuscript structure should be expressed through known styles, front matter, labels, or templates whenever possible.

AI-assisted interpretation may be explored later, but correctness and reproducibility come first.

### 3. One core model, many adapters

DOCX, Markdown, Google Docs, and HTML should converge on one normalized article representation. Downstream WordPress code consumes that representation rather than knowing how every source format works.

### 4. WordPress-native output

Where practical, PressDrop should generate standard Gutenberg blocks and use official WordPress APIs rather than browser automation.

### 5. Idempotent by design

Re-running the same manuscript should not casually create duplicate posts or duplicate media. The current baseline records source/profile identity plus remote media/post results and stops conservatively when remote success is ambiguous.

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
- return the created WordPress draft identity / URL

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

The broader implementation stack is not locked yet. The current slices establish a dependency-free TypeScript/Node.js core, normalized Article boundary, and WordPress REST adapter. Future adapters and richer WordPress integration may reuse mature libraries in the same ecosystem:

- `mammoth` for DOCX → semantic HTML
- `remark` / `rehype` if broader Markdown/HTML syntax makes a full AST parser preferable to the intentionally small Markdown v1 grammar
- JSON Schema validators as the normalized model grows
- WordPress block parser/serialization packages for stronger Gutenberg round-trip validation

The important decision is the architecture, not a particular framework. See [DESIGN.md](docs/DESIGN.md).

## Repository structure

```text
.
├── .github/workflows/test.yml
├── .gitignore
├── config/
│   └── site.example.json
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
│   ├── validation.ts
│   └── wordpress/
│       ├── client.ts
│       ├── site-profile.ts
│       ├── state.ts
│       └── submit.ts
├── test/
│   ├── pressdrop.test.ts
│   └── wordpress.test.ts
├── package.json
├── README.md
└── docs/
    ├── DESIGN.md
    ├── INITIAL_IMPLEMENTATION.md
    ├── MARKDOWN_V1.md
    ├── WORDPRESS_SUBMISSION.md
    └── research/
        └── wordpress-submission-assistant-research.md
```

## Current questions

Several product decisions intentionally remain open:

- Should the first user-facing form be a CLI, local web app, desktop app, or hosted service?
- How should site profiles express custom fields and site-specific Gutenberg blocks?
- How should explicit featured-image alt/caption metadata be represented in a future manuscript schema?
- What reconciliation workflow should resolve `DUPLICATE_CANDIDATE` state after ambiguous remote outcomes?
- Should native Google Docs support arrive before or after the first DOCX/Markdown vertical slice?
- When should the deliberately small Markdown v1 grammar move to a full Markdown AST implementation?

These are tracked as design questions rather than silently fixed in code.

## Research

The initial research compared existing SaaS products, WordPress plugins, browser extensions, OSS libraries, and official WordPress APIs. Its main conclusion was that a small custom layer is most defensible when the workflow requires multiple input formats, explicit manuscript rules, captions/credits, taxonomy/meta mapping, Gutenberg correctness, and reusable multi-site behavior.

Read the full report: [docs/research/wordpress-submission-assistant-research.md](docs/research/wordpress-submission-assistant-research.md).

## License

Not decided yet.
