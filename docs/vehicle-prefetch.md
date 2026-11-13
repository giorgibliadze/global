# Automatic vehicle preparation

Manheim24 detail pages now prepare the active vehicle before a transfer click.
The existing parser's selected-detail identity validation is shared by a
lightweight identity inspection function; its field selectors and extraction
rules were preserved.

## Source lifecycle and cache

`VehiclePreparation` observes confirmed detail-container changes, required field
rendering, hash/popstate navigation, client-side URL changes accompanied by DOM
updates, modal replacement, and visibility changes. It coalesces work in
microtasks, ignores unrelated page and extension UI mutations, and checks the URL
and pending DOM mutations again on resolve/verify. Source preparation runs only
on the authenticated HTTPS source domain, consistent with existing permissions.

Each preparation has a random ID and generation. Superseded tasks stop before
further parsing/publication; delayed normalization responses cannot publish a
ready state for the previous selection. On a new route, an unchanged old vehicle
identity is rejected even if that old panel was copied into a replacement node.
This is deliberately conservative: a route transition leaving the same old
vehicle visible requires a verified new selection before transfer can proceed.

The source cache holds the sanitized vehicle and identity evidence. The worker
prepares Georgian specifications/description and static MyAuto field candidates.
Its cache is keyed by source tab plus verified listing ID, with VIN only as an
internal fallback. It holds at most 20 active source preparations with a two-minute
TTL and invalidates prior entries on updates. Payloads include original identity,
full model/title, normalized specs, description, candidates, ordered photo URL
manifest and extraction/preparation timing. No raw HTML, account/session data,
cookies, tokens or image blobs are retained in the preparation cache.

These preparation caches are in memory. Worker suspension/restart can evict its
cache earlier than the TTL. A miss automatically rebuilds the prepared fields
from the current verified source payload; an expired source payload is freshly
extracted. No confirmation is requested. Prepared fields are included in the
existing session-scoped transfer record only after the user starts transfer.

The background verifies the preparation ID against the live source before
storing/opening a job and again immediately before `tabs.create`. A superseded
preparation is retried against the current source, with a bounded retry count.
An existing transfer snapshot remains independent of later source changes.

## Transfer and photos

Automatic preparation never creates a MyAuto tab, downloads full-resolution
photos, uploads files or publishes a listing. It reads/deduplicates supported
photo references through the existing parser. After a click, prepared static
fields bypass description/translation generation in the destination; real
dropdown options and IDs are still discovered and validated on MyAuto.

The existing concurrent form/photo pipelines remain intact: independent text
fields first, manufacturer before model, one shared-overlay dropdown at a time,
three bounded image downloads, one supported upload batch, and verified remote
gallery/count. Exact source manufacturer/full model and optional trim rules are
unchanged. VIN remains in the dedicated field only, with description sanitization
still applied during writing and final verification. Publication stays manual.

Blur/peer-focus and rerender checks, final persistence verification, field-specific
repair and failed-field-only retries are retained. Preparation reuses static
candidates, never invented or stale MyAuto option IDs.

## Interface

The existing launcher artwork, position and animation are preserved. A small
noninteractive status below the closed launcher displays:

- ავტომობილის მონაცემები მუშავდება...
- მონაცემები მზად არის
- მონაცემების განახლება მიმდინარეობს...
- მონაცემები ვერ მომზადდა

Transfer progress uses `ტექსტური მონაცემები: X/Y` and `ფოტოები: X/15` (actual
source photo total if fewer), together with elapsed time and existing field-level
feedback. An early click automatically waits for required source identity data
within a bounded deadline and retries preparation without a confirmation dialog.

## Modified files

- `apps/extension/src/content/preparation.ts` — new source lifecycle/cache.
- `apps/extension/src/content/manheim.ts` — registration, resolve and live verify.
- `apps/extension/src/content/FloatingLauncher.tsx` — preparation subscription.
- `apps/extension/src/content/launcher.css` — small preparation indicator.
- `apps/extension/src/background/preparation.ts` — new bounded normalization cache.
- `apps/extension/src/background/transfers.ts` — cache reuse, generation messages,
  final live verification, automatic miss/supersession recovery.
- `apps/extension/src/background/index.ts` — allowlisted preparation operations.
- `apps/extension/src/myauto/transfer.ts` — use prepared fields and timing milestones.
- `apps/extension/src/components/TransferProgress.tsx` — requested Georgian counters.
- `packages/shared/src/index.ts` — serializable prepared-field and timing types.
- `packages/parsers/src/manheim24.ts` — shared selected-detail identity inspection.
- `packages/parsers/src/myauto.ts` — share the prepared-field type.
- `packages/parsers/tests/prefetch.browser.ts` — new lifecycle/cache regressions.
- `packages/parsers/tests/workflow.browser.ts` — include preparation tests.
- `packages/parsers/tests/run-browser.mjs` — serve the preparation module to tests.
- `apps/extension/scripts/verify-transfer.mjs` — warm-prefetch assertions and metrics.
- This report and `docs/vehicle-prefetch-measurements.json`.

No Admin, dependencies, original artwork, manifest configuration, or photo uploader
implementation changed.

## Actual measured performance

Two sanitized vehicles were measured with the real unpacked extension in headless
Chrome. Manheim24, MyAuto, dropdown options and upload-server acknowledgments were
intercepted fixtures. Each vehicle had 15 images with 120 ms per-image response
latency and three workers. Preparation completed before the click. No other
browser tests ran concurrently with this benchmark.

| Metric | Vehicle A | Vehicle B | Mean |
| --- | ---: | ---: | ---: |
| Detail observation to preparation complete | 51 ms | 64 ms | 58 ms |
| Click to destination form ready | 256 ms | 353 ms | 305 ms |
| Form ready to first visible input | 38 ms | 50 ms | 44 ms |
| Form ready to first persistence-certified field | 75 ms | 87 ms | 81 ms |
| Form autofill duration | 2,199 ms | 2,211 ms | 2,205 ms |
| Click to verified photo completion | 2,155 ms | 2,287 ms | 2,221 ms |
| Click to completed result | 3,223 ms | 3,276 ms | 3,249 ms |

Both jobs reused a payload prepared before the click. Static description/field
preparation on the destination took approximately 0.1 ms (clone/bookkeeping),
while worker normalization had already taken 28.5/12.6 ms before the click.
Actual dropdown UI interaction and persistence checks still take time; this
change does not make every field instantaneous. No total speedup percentage is
claimed from these two samples or compared against earlier differently timed
runs. Raw values: [vehicle-prefetch-measurements.json](vehicle-prefetch-measurements.json).

Observation starts when the content script sees initial details, a route change,
or relevant panel insertion/update; it excludes startup before observation.
Click-to-form readiness combines job creation time with the production readiness
milestone. First visible input precedes blur certification; the separate persisted
metric measures the complete check. Click-to-result includes 100 ms harness
completion polling. Warm-path source extraction timing represents lightweight
identity verification, not another full extraction. Overlapping stage durations
must not be summed as elapsed time.

## Validation and live limitations

Reproduction commands:

```
npm run typecheck -w @auto-importer/parsers
npm run lint -w @auto-importer/extension
npm run test -w @auto-importer/parsers
npm run build:extension
node apps/extension/scripts/verify-ui.mjs
AUTO_PREFETCH_TEST=1 AUTO_BENCHMARK=warm-prefetch node apps/extension/scripts/verify-transfer.mjs
AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 AUTO_RETRY_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

Checks include parser TypeScript, extension TypeScript/build, extension ESLint,
ESLint on changed parser/shared/test TypeScript, the full sanitized browser suite,
19 built popup/launcher fixtures, and real unpacked MV3/React transfer harnesses.
All passed. The final build generated `apps/extension/dist/manifest.json`, popup
assets and content-script/worker bundles; `git diff --check` passed. The isolated
MV3 harness reported no unexpected runtime exceptions. No live-site console
success is claimed.
The new tests cover initial preparation without side effects, cache hits/misses
and expiry, worker cache recovery, hash transitions retaining old content,
replacement of stale panels, same-route modal changes, asynchronous required data
and visibility, cancellation of delayed B responses after selecting C, compound
model preservation, independent jobs, no duplicate transfers and VIN privacy.

The warm MV3 harness asserts readiness and no photo downloads/new tabs before the
click, and that the transfer reuses a payload timestamped before the click. The
React harness retains real controlled-state, trusted safe inspection, 15-photo
gallery verification, field-only retry and zero-publication assertions.

**Authenticated live Manheim24/MyAuto testing was not performed.** Real SPA modal
timing, changes to the source DOM, MyAuto dependent dropdown behavior and server
photo-upload acknowledgments still need live verification. Reload the extension
and source/destination tabs, select a vehicle, wait for `მონაცემები მზად არის`,
switch vehicles once, then transfer. Verify the new vehicle, description, persisted
form values and gallery; publish only after manual review.
