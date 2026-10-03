# PressDrop 0.1.0 — initial draft workflow

This is the first release of the usable, limited Markdown-to-WordPress draft workflow. The existing package version 0.1.0 is retained: “usable v1” describes the product milestone, not a promise of 1.0-wide API or hosting compatibility. No npm/store publication is included.

## Supported workflow

Prepare an `article.md` bundle using [Markdown v1](MARKDOWN_V1.md), with local PNG/JPEG/GIF/WebP images. Inspect the normalized manuscript, verify existing category/tag names, and explicitly create a standard WordPress draft. Standard paragraph/heading/image blocks, inline alt/caption/credit, featured image and completed retry are supported. Public posting is always a separate human decision.

Normal site profiles require HTTPS and runtime Application Passwords. An uncertain media/post response stops with `DUPLICATE_CANDIDATE`; an identical completed submission reuses its stored result. Authenticated redirects are refused instead of moving credentials to another endpoint.

## Safe local trial

Node >=22.6, npm and initial internet access are required. From a clone of this repository:

```sh
npm ci
npm --prefix web ci
npm run check
npm run test:ui:wordpress
```

Use the printed UI URL, generated sample/profile paths and `session` placeholders for both credential fields. Preview → taxonomy verification → explicit Create draft. Use the printed disposable wp-admin login URL for Gutenberg review. Close the test tabs and stop the launcher with Ctrl+C.

For an automated normal-UI API smoke and automatic disposal:

```sh
npm run test:ui:wordpress -- --smoke
```

The test uses project-pinned Playground 3.1.0 / PHP.wasm 8.3 / WordPress 6.8 / SQLite. Product HTTPS stays mandatory. Only the explicit launcher accepts its own exact HTTP loopback target; it uses no global installation, Docker, root certificate or durable site credential. WordPress state and real credentials live in memory; generated non-secret test files are removed on exit. See [the full test guide](DISPOSABLE_UI_TEST.md), including abrupt-stop limitations.

For an existing compatible HTTPS site, use [the normal local UI guide](LOCAL_UI.md); test on a disposable site before adopting it for a specific host.

## Verification

The normal local UI was exercised through preview, taxonomy verification and explicit submission. Real Gutenberg review confirmed nine standard blocks, visible images, inline caption/credit/alt, featured image, category/tag membership and Draft state. No invalid-block warning appeared. Completed retry reused the same post; media did not increase.

Repository checks: 33 passing tests, one optional live test skipped in the normal check command, web build passing. The separate disposable WordPress smoke asserts one draft, zero published posts and three media items after retry. CI also runs the existing Docker WordPress/MySQL integration. Root and web npm audits report zero known findings after exact same-major overrides for ws/ajv/qs. Audits do not guarantee absence of defects.

A process-wide measurement included WordPress, the PHP runtime's internal WebSocket proxy and the UI: all listening sockets used 127.0.0.1. HTTP destination/Host/Origin/IPv6 rejection and credential-bearing redirect regressions are tested.

## Limits and observed effort

- Deployed-host/plugin compatibility and other WordPress/PHP versions were not established by this trial.
- Only the documented Markdown contract and standard posts/blocks are supported; DOCX/Google Docs, custom blocks and arbitrary custom-field writing are not implemented.
- Featured-only attachment alt has no input field in the current contract; inline alt was verified.
- The first run requires manual bundle/profile paths and runtime credential entry. Retry keeps paths but requires password re-entry and re-verification. Image preview shows metadata, not local thumbnails.
- No manual block/media reconstruction was needed for the tested prepared bundle. Direct AI browser entry was not timed, so no speed claim is made. Bundle preparation can dominate for a one-off unstructured manuscript.

The limited draft workflow can be treated as usable v1. Future ease-of-launch/path-selection work should follow the observed friction rather than expanding formats or publishing behavior speculatively.
