# EDGE automatic preload and immediate transfer

## Cause and change

The existing text prefetch stored normalized fields but photo discovery/download started after the click. Text readiness also waited for background publication. A source with slow Fotorama initialization or CDN downloads therefore paid this cost during transfer. EDGE now makes its validated text snapshot locally ready immediately and publishes metadata independently. A gallery observer starts source-bound photo preparation while the page is being viewed. Clicking creates the normal transfer without awaiting all images; cache misses continue through the existing downloader.

A deliberately empty-gallery browser test found a new integration edge case: treating an empty preload binding as a ready photo catalog skipped the source readiness request. The shortcut now requires at least one captured URL. Empty galleries use the existing bounded source observer outside the job lock, allowing text to complete first. The corrected browser test delivered/confirmed 15 photos after releasing the gallery only after mileage persisted.

## Scope and architecture

Only EDGE-specific behavior changed. Shared TransferManager/worker entry points have conditional EDGE wiring. Manheim, Manheim24, ADESA, common MyAuto field filling, file upload adapter, description skipping, negotiable price, location, manual review and no-publication policy retain their paths. No Admin edits or new dependencies.

- `apps/extension/src/content/edgePreload.ts`: event-driven gallery discovery, coalesced mutations and exact selected-vehicle checks; independent page/navigation generation and preparation nonce. Bridge writes are consumed without feeding the observer back into itself. Visibility updates change download priority. No destination navigation before click.
- `apps/extension/src/content/edgePreparation.ts`: immediate local text readiness, background publication outside the click gate, safe fast fallback if publication/cache is unavailable. Gallery churn cannot invalidate text.
- `apps/extension/src/background/edgePreloadStore.ts`: temporary native Blob IndexedDB store with contexts/photos/transfer bindings. No binary data in chrome.storage.local/sync or JSON messages.
- `apps/extension/src/background/edgePreloads.ts`: validated source tab/document/listing/VIN/generation binding, serialized metadata updates, duplicate suppression, in-flight joins, persistent prepared binaries, byte budgets, priority/fair scheduling and cleanup. A stale navigation epoch cannot replace a newer context. Binding waits only for an already-arriving metadata commit, never all downloads.
- `apps/extension/src/background/transfers.ts`: bind cached catalog at transfer creation; adopt cached Blob into existing job photo store before releasing preload copy; preserve transfer-specific filenames, hashes, MIME/index metadata and existing chunk protocol. Unprepared files follow the existing authorized download path. Empty cached catalogs retain bounded source refresh.
- `apps/extension/src/background/index.ts`: EDGE messages, shared limiter wiring and cleanup alarm/tab-close hooks.
- `packages/parsers/tests/edgePreload.browser.ts`, `edgeStart.browser.ts`, `edge.browser.ts`: new/updated cache, source readiness and integration regressions.
- `apps/extension/scripts/verify-transfer.mjs`: optional warm-cache inspection/assertions and sanitized performance output; original non-EDGE assertions retained.
- This report and `docs/edge-preload-evidence/{warm,late-gallery}.json`: sanitized measurements; no source HTML, credentials, VINs or signed photo URLs.

## Resource and lifecycle bounds

Speculative EDGE downloads share the existing global eight-download limiter. Preloading itself permits two concurrent downloads total and at most two per context; actual transfer batches remain four. This conservative speculative budget avoids consuming the foreground transfer allowance across thirty tabs.

Cache limits: 128 MiB total prepared/reserved bytes, 32 MiB per context (worst-case 15 MiB reservation before each download), 34 contexts, 256 KiB metadata per context, existing 1,000-reference safety guard. These are resource bounds, not the old fifteen-photo source limit. Original image ordering, deduplication and full-resolution preference remain with the verified Fotorama extractor. Memory pressure pauses speculation; remaining photos use normal incremental transfer after click. Inactive unbound binaries may be evicted for a visible source.

Unused contexts expire after two minutes, with a one-minute cleanup alarm; navigation and tab closure cancel unbound work. Active transfers pin their cache until completion/cancellation. Worker restoration reloads native Blobs; abandoned bindings without a running session job are discarded. Successful adoption frees the preload copy only after job-store persistence. Finished transfers release remaining binaries. Interrupted in-flight requests may be retried after a worker restart; successfully persisted files are reused.

## Measured Chrome checks

Dedicated temporary Chrome profile, thirty mixed fixture tabs, real supplied EDGE CDN files and real MV3 messaging/storage. Source pages and MyAuto React form/upload-server completion are simulated. These are single-run observations, not performance guarantees. Readiness starts when source content is detected by the content preparation code, not navigation/TTFB. SPA readiness uses the new vehicle's observation timestamp.

| Warm-cache metric | Multi-photo A | Single-photo B |
| --- | ---: | ---: |
| Content detected to text ready | 9 ms | 2 ms |
| Content detected to first photo ready | 525 ms | 318 ms |
| Click to transfer session | 91 ms | 48 ms |
| Click to first text field | 537 ms | 446 ms |
| Click to first photo accepted by simulated gallery | 1,799 ms | 1,798 ms |
| Click to final test observation | 3,678 ms | 2,748 ms |
| Distinct URLs discovered | 17 | 1 |
| Files downloaded/prepared before click | 17 | 1 |
| Prepared files reused by transfer | 15 | 1 |
| Files delivered to destination | 15 | 1 |
| Photos confirmed by simulated destination | 15 | 1 |
| Authenticated MyAuto photos confirmed | Not tested | Not tested |

The first snapshot has 47 gallery slots but only 17 genuinely observed distinct saved URLs. Missing URLs are not fabricated. Its 17 preloads remained 17 when fifteen were adopted: no additional download for those files. The actual saved MyAuto form advertises fifteen upload slots; two available source photos were consequently skipped/reported. Synthetic forms with larger verified limits remain covered by the existing EDGE suite.

Late-gallery check: text persisted before the test released any photo markup; vehicle A then delivered/confirmed 15 files. Its first text field was filled at 652 ms, first simulated photo accepted at 9,717 ms and total observation at 12,905 ms. Slow source/network readiness remains visible in this cold path and does not hold the text lane. Vehicle B separately delivered/confirmed its single file. These cold measurements predate only the final metadata-cleanup/timestamp instrumentation adjustments.

## Validation

- `npm run build:extension`: passed (TypeScript project build and Vite); MV3 `apps/extension/dist/manifest.json`, popup HTML and compiled assets generated.
- `npm run lint -w @auto-importer/extension`: passed.
- `npm run typecheck -w @auto-importer/parsers`: passed.
- `npm test -w @auto-importer/parsers`: full sanitized browser suite passed, including existing non-EDGE workflows and real React controlled-field/partial upload checks.
- `AUTO_EDGE_TEST=1 npm test -w @auto-importer/parsers`: passed. New tests cover automatic pre-click downloads, 23-photo catalog, duplicate updates, persistent native Blob cache after worker recreation, exact cache binding, ordered transfer names/indices, cross-tab rejection, pinned navigation, generation invalidation, cleanup, thirty concurrent source contexts, bounded reservations, and joining pending work without duplicate fetches. Existing EDGE tests cover supplied sanitized structures, single/large galleries, delayed photos, source closure, image formats/errors and actual verified destination limits.
- Warm-cache and delayed-gallery built-extension Chrome checks passed with thirty tabs, two independent vehicles, genuine CDN file decoding/unique content, dedicated VIN, untouched description, persisted fields and no publication. Cache handoff counts are checked separately from destination gallery confirmation.

## Live verification still required

Authenticated EDGE/MyAuto sessions were not available to this test harness. Real account-specific dropdowns, upload-server acceptance, authentication expiration, and a prolonged real thirty-tab session still need live observation. Mock gallery acceptance is not live upload success.

Reload the unpacked extension and the EDGE vehicle page. Allow its gallery to initialize, then click the existing launcher once. MyAuto should open immediately and fill text, with cached photos following after text updates. Check its real gallery count and inspect remaining warnings before manual publication. Repeat with an immediate click on a newly opened page and a second vehicle. No final advertisement is submitted automatically.
