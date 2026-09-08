# PressDrop local UI

Issue #10 connects the selected browser prototype to the existing PressDrop parser, validation, site-profile, retry-state, and WordPress submission core.

The real UI is intentionally a **local web application**, not a hosted CMS. A small Node.js bridge binds to localhost and keeps filesystem access and WordPress credentials out of the browser bundle.

## Architecture

```text
browser UI
   |
   | same-origin /api requests
   v
localhost Node bridge
   |
   +--> inspectBundle() / validation
   +--> site profile + taxonomy preflight
   +--> submitBundle() + retry state
   +--> WordPress REST API
```

The React layer does not duplicate manuscript validation, taxonomy matching, Gutenberg generation, retry semantics, or WordPress draft safety rules.

## Install

Requirements: Node.js 22.6 or later.

```bash
npm ci
npm --prefix web ci
```

## Development

Run the core bridge in one terminal:

```bash
npm run web:server
```

Run Vite in another terminal:

```bash
npm --prefix web run dev
```

Open the Vite URL (normally `http://127.0.0.1:5173`). Vite proxies `/api` to the local PressDrop bridge on port `43110`.

The original sample-data prototype remains available at `?demo=1` for design/state inspection.

## Built local UI

```bash
npm run web:build
npm run web:server
```

Then open:

```text
http://127.0.0.1:43110
```

The Node bridge serves `web/dist` when it exists.

## Main flow

1. Enter the local manuscript bundle path. The browser cannot reliably expose an absolute directory path, so the lightest localhost host uses an explicit path field instead of pretending a browser folder picker provides one.
2. PressDrop calls the existing `inspectBundle()` path and renders the normalized Article: title, excerpt, ordered body blocks, heading structure, media filenames/roles, alt text, captions, credits, categories, tags, featured image, metadata, validation errors, and warnings.
3. Enter a non-secret site-profile path plus runtime WordPress username and Application Password.
4. PressDrop performs a taxonomy-only preflight. Missing or ambiguous terms stop here, before media upload.
5. The explicit **Create draft** action starts the real submission pipeline.
6. UI progress is driven by core phases: taxonomy resolution, media upload, draft creation, completed.
7. Success shows the real returned post ID, site identity, draft state, and edit URL. A completed identical retry is shown as reused and performs no additional REST side effects.

## Safety boundaries

- The local bridge binds to `127.0.0.1` by default and rejects non-local browser origins for `/api`.
- Application Passwords are sent only in runtime requests. They are not written to manuscript bundles, site profiles, frontend assets, logs, or PressDrop retry state.
- The UI keeps the Application Password only long enough to perform preflight and start the explicit submission job, then clears it from React state.
- Taxonomy preflight uses the existing WordPress client and performs GET resolution only.
- `submitBundle()` still resolves taxonomy again immediately before media upload so the mutation boundary remains safe even if WordPress changes after preflight.
- Submission includes the exact source fingerprint shown during preflight. If the manuscript bundle changes after preview, submission stops locally with `VALIDATION_ERROR` before any WordPress request.
- WordPress post creation remains hard-coded to `status: draft` in the core client path.
- Authentication/REST failures report the last known execution phase. The UI does not claim that no media or draft side effect occurred when failure happened after remote mutation began.
- `DUPLICATE_CANDIDATE` distinguishes an uncertain media upload (`pendingMediaRef`) from an uncertain post-creation result. Automatic retry remains stopped in both cases.

## State

The default retry-state path remains:

```text
.pressdrop/state.json
```

Override it with `PRESSDROP_STATE_FILE` when starting the local bridge.

The bridge keeps transient submission-job status only in memory and removes jobs after one hour. Credentials are never stored in a job record.

## Verification

Run all core tests, UI view-model tests, and the Vite production build:

```bash
npm run check
```

CI installs both root and `web/` dependencies and runs this command.

The UI/core tests cover real normalized fixture data, taxonomy-only preflight, submission progress, completed-result reuse, and the preview-fingerprint guard. Existing WordPress tests continue to cover taxonomy blocking, credential redaction/state secrecy, media ambiguity, post ambiguity, and draft-only submission behavior.

## GitHub Pages

GitHub Pages cannot reach a user's localhost PressDrop core. The Pages workflow therefore builds with `VITE_PRESSDROP_DEMO=1` and intentionally deploys the sample-data prototype only. A normal local build uses the real UI by default.

## Live WordPress boundary

Automated tests use deterministic WordPress mocks. A real WordPress test site and runtime credentials are still required for the final live shakeout. Until that is performed, this implementation should not be described as live-WordPress verified.
