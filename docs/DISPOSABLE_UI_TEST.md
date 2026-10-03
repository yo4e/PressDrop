# Disposable normal-UI WordPress test on macOS

This is an explicit development test launcher, not a product HTTP setting. Node >=22.6 is sufficient; no Docker, PHP installation, root certificate, global package, or production site is required. The project pins `@wp-playground/cli` 3.1.0 (its PHP/WordPress libraries and bundled SQLite integration are used; its CLI HTTP listener is not used).

## Reproduce

```sh
npm ci
npm ci --prefix web
npm run check
npm run test:ui:wordpress
```

The launcher downloads WordPress 6.8 from wordpress.org. Open the printed UI URL in a dedicated browser tab. Select the printed `bundleDir`, inspect the manuscript, and review image metadata. Set the printed `profilePath` and enter `session` in both connection fields. These are test placeholders; the real Application Password stays in launcher memory. Click taxonomy verification, review the matched category/tag IDs, and explicitly click Create draft.

Open the printed `wordpressLogin` URL to enter the disposable wp-admin session, then the draft edit URL returned by PressDrop. Review the Gutenberg blocks, images, captions/credits/alt, featured image, categories/tags and Draft status. Do not click Publish. Choose the same manuscript again, reconnect with the test placeholders, and create draft again: the previous draft ID should be reused.

Close the dedicated test tabs and press Ctrl+C in the launch terminal. The launcher closes both listeners, disposes PHP/SQLite/uploads/credentials, and removes its own temporary sample/profile/state directory. Abrupt SIGKILL cannot run cleanup, but the WordPress filesystem/database and real credentials are held only in process memory; the remaining temporary files contain sample data and non-secret submission state.

For the same normal UI API path with automated submission/retry/count assertions and automatic cleanup:

```sh
npm run test:ui:wordpress -- --smoke
```

## Isolation

- Both HTTP servers bind only to literal `127.0.0.1` on ephemeral ports; no CLI wildcard listener, host mounts, persistent WordPress service or OS trust changes.
- Product `loadSiteProfile` still requires HTTPS. The launcher supplies a programmatic capability allowing only its exact WordPress origin. No environment variable or UI checkbox can enable HTTP.
- Test UI rejects mismatched Host/Origin and non-loopback socket addresses. Literal IPv6 `::1` is covered by profile boundary tests; the actual launcher uses IPv4.
- Authenticated WordPress requests refuse redirects, including same-host redirects. The test fetch adapter checks the exact instance origin before attaching the in-memory credential.
- WordPress environment is local; an ephemeral author account/Application Password is created inside it. The admin login helper exists only in this disposable instance. Test WordPress outbound HTTP is blocked after its initial download.
- The installer default posts/pages are removed before the test. Only one sample draft is created; no publish action is performed.

## Observed 2026-10-03

Based on main `6c1e0d33335b1b236bc9ddffe9d83a855710f546` plus local changes:

- Normal browser UI: inspect → preview → taxonomy GET verification → explicit draft creation succeeded.
- Gutenberg in WordPress 6.8 / PHP.wasm 8.3 / SQLite: 9 standard blocks, two visible 640×400 inline images, caption and credit text, both inline alt texts, featured image, Workflow/WordPress categories, Gutenberg/Markdown tags, and Draft status verified. No invalid-block recovery warning appeared.
- UI retry reused post #7. wp-admin showed Draft (1); media REST header `X-WP-Total` stayed 3 before and after retry.
- Final launcher API smoke: first/retry post #7, reused=true, final counts drafts=1, published=0, media=3; automatic disposal completed.
- `lsof` showed only `127.0.0.1` for both test listening sockets. Final smoke checked bound addresses too.
- Regression coverage: product HTTP rejection, test target mismatch/non-loopback rejection, exact loopback allowed only in test mode, authenticated redirect destination receives zero requests. `npm run check` passed.

The sample's featured-only image has no alt field in the supported manuscript model; WordPress displayed empty alt for that featured attachment as expected. Arbitrary `meta` remains preview data, not a promised custom-field writer.

## Effort and limits

The first UI run needed four form values (bundle path, profile path, username, password placeholder), inspection, taxonomy verification, and explicit draft creation. Retry retained paths/username but required password re-entry and re-verification. Image preview currently lists metadata rather than rendering local image thumbnails. No manual block or media reconstruction was needed in WordPress.

Direct AI browser entry was not benchmarked. For one unstructured manuscript, preparing the Markdown/image bundle can outweigh these savings; for prepared/repeated bundles PressDrop consolidates repeated block, image and taxonomy work. The supported Markdown-to-standard-draft v1 path now has visual verification; hosting/plugin compatibility and other manuscript formats remain outside this result.

Playground is a development-only dependency. Initial installation introduced audit findings through `ws`, `ajv`, and `qs`. These were resolved with exact, same-major overrides (`ws` 8.21.0, `ajv` 8.18.0, `qs` 6.16.0), keeping Playground 3.1.0 and Node 22 compatibility. Both root and web npm audits now report zero findings. The PHP.wasm loader does start an internal WebSocket network proxy; this is part of the tested path, unlike the unused CLI Express/Blueprint validation paths. A process-wide `lsof` measurement confirmed all three listeners (WordPress, proxy, UI) bound only to 127.0.0.1. See the local audit report for details; zero audit findings is not a guarantee of absence of defects.
