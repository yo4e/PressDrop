# WordPress draft submission

Status: **implemented against deterministic mock WordPress REST endpoints; live WordPress verification pending**

This document describes the first WordPress-facing PressDrop slice added after the local Markdown → normalized Article → Gutenberg pipeline.

## Scope

The submission path is deliberately narrow:

```text
validated normalized Article
        ↓
site profile + runtime credentials
        ↓
resolve existing categories / tags
        ↓
upload local media
        ↓
substitute WordPress media IDs / URLs
        ↓
generate Gutenberg content
        ↓
create standard WordPress post with status=draft
        ↓
persist retry state + return post identity
```

PressDrop still does not publish automatically, create missing taxonomy terms, update changed manuscripts into existing drafts, or send arbitrary normalized metadata to WordPress.

## Site profile

Site-specific non-secret connection identity lives in JSON. See [`config/site.example.json`](../config/site.example.json):

```json
{
  "id": "example-publication",
  "baseUrl": "https://wordpress.example.com",
  "postType": "posts"
}
```

Rules:

- `id` is a stable local identifier used as part of submission identity;
- `baseUrl` must use HTTPS;
- credentials must not be embedded in the URL or committed in the profile;
- only the standard `posts` REST endpoint is supported in this slice.

The code permits HTTP only through an explicit test-only profile option used by the local mock server tests.

## Credentials

The CLI reads WordPress credentials only at runtime:

```bash
export PRESSDROP_WP_USERNAME='pressdrop-user'
export PRESSDROP_WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

PressDrop uses HTTP Basic authentication suitable for WordPress Application Passwords. Credential values are not stored in site profiles or submission state and are redacted from surfaced remote error messages.

## Submit command

A live submission is an explicit command; there is intentionally no `npm run submit` shortcut.

```bash
node --experimental-strip-types src/cli.ts submit \
  examples/basic \
  config/my-site.json
```

The default retry-state path is:

```text
.pressdrop/state.json
```

Override it with either a final CLI argument or `PRESSDROP_STATE_FILE`:

```bash
node --experimental-strip-types src/cli.ts submit \
  path/to/bundle \
  config/my-site.json \
  path/to/state.json
```

The `.pressdrop/` directory is ignored by Git.

## Taxonomy behavior

Categories and tags from the normalized Article are resolved by exact name against the standard WordPress REST endpoints.

The first implementation is intentionally strict:

- a missing requested category or tag blocks submission;
- an ambiguous exact match blocks submission;
- missing terms are never created automatically;
- all taxonomy resolution completes before media upload begins, so a typo does not leave remote media side effects.

## Media behavior

Every normalized local media item is uploaded through the WordPress media REST endpoint. PressDrop records the returned media ID and `source_url` and uses them for final Gutenberg serialization.

For inline images, PressDrop also updates media-library metadata with the explicit Markdown `alt` and `caption` values. The semantic `credit` remains separate in the normalized Article and is rendered into the Gutenberg image figcaption by the current serializer.

The current Markdown v1 syntax does not declare separate metadata for a featured-only image. PressDrop therefore does **not** invent alt text or a caption for a featured image that never appears inline.

## Gutenberg substitution

The local `gutenberg` command still emits deterministic `pressdrop://...` placeholders.

During live submission, the same serializer receives an uploaded-media map and emits WordPress image blocks containing the real media ID and URL, for example:

```html
<!-- wp:image {"id":123,"sizeSlug":"full"} -->
<figure class="wp-block-image size-full"><img src="https://..." ... class="wp-image-123"/>...</figure>
<!-- /wp:image -->
```

This keeps Markdown syntax and WordPress media identity separated by the normalized Article boundary.

## Draft creation

The post request always sends:

```json
{
  "status": "draft"
}
```

alongside title, excerpt when present, generated Gutenberg content, resolved category/tag IDs, and the uploaded featured-media ID when present.

The result returned to the CLI includes the WordPress post ID, returned link when available, and a deterministic wp-admin edit URL.

## Retry state and duplicate safety

PressDrop keys submission state by:

- site-profile ID;
- normalized site base URL;
- exact normalized source fingerprint.

The baseline state file records only submission identity, taxonomy IDs, successful media IDs/URLs, current phase, and the successful draft result. It never stores WordPress credentials.

### Completed retry

If the same source fingerprint and site profile already completed successfully, PressDrop returns the stored result and makes no new taxonomy, media, or post REST calls.

### Partial media retry

Successful media uploads are persisted one at a time and reused on retry.

Before each media upload, PressDrop records which media item is about to be created. If the connection fails after WordPress may have accepted that upload but before PressDrop receives the media ID, the next run refuses to upload it again automatically and returns `DUPLICATE_CANDIDATE` for human inspection.

### Uncertain post creation

Immediately before creating the draft, PressDrop persists a `creating_post` phase. If the HTTP result is lost after WordPress may have created the draft, a later retry refuses to POST another draft automatically and returns `DUPLICATE_CANDIDATE`.

This is conservative by design. The first implementation prefers a manual reconciliation step over silently creating duplicate media or posts when remote success is ambiguous.

## Automated verification

CI does not need a WordPress installation or credentials. `test/wordpress.test.ts` starts a deterministic local HTTP server that exercises the expected REST contract, including:

- category and tag resolution;
- missing taxonomy rejection before media upload;
- media upload and metadata update;
- featured image mapping;
- real ID/URL Gutenberg substitution;
- `status: draft` enforcement;
- completed retry reuse;
- credential redaction / omission from state;
- uncertain media-upload duplicate protection;
- uncertain post-creation duplicate protection;
- HTTPS enforcement outside test mode.

## Live verification still pending

The mock tests prove PressDrop's own request sequencing and payload contract, but they do not prove compatibility with a particular deployed WordPress version, hosting layer, security plugin, media policy, or reverse proxy.

Before treating a real publication as supported, run a disposable/test-site shakeout with a dedicated minimum-permission WordPress account and Application Password, then inspect the resulting Gutenberg draft in wp-admin.
