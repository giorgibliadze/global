# EDGE extensionless photos, complete preparation and single-batch upload

## Proven failure stage

All three available EDGE DOCX snapshots were inspected in memory, including `_html lang=_en_ data-usln-heartbeat=_1795107425286___head_.docx` (28 gallery positions). The previous two snapshots have 47 positions/17 loaded distinct identities and 1 position/1 identity. The latest 28-position snapshot contains 21 observed image references representing 17 distinct identities, **all without filename extensions**. The other eleven positions have no loaded source URL in the saved DOM.

The old `edgePhotoUrl()` required a .jpg/.png/etc. suffix and rejected every one of the latest vehicle's URLs before download. This is a reproducible URL-extraction failure, not a FileList or upload-server failure. The new sanitized fixture retains its actual gallery tree, unloaded slots, extensionless paths and resize variants, with photo/vehicle identities replaced. The regression now extracts all 17 genuinely observed identities, reports 28 expected, and never fabricates the other eleven.

This proves the zero-photo cause for the supplied extensionless example. It does not prove the cause of every previously reported authenticated Chrome failure; actual console/network evidence for those sessions remains unavailable.

## Isolated changes

1. `packages/parsers/src/edge/urls.ts`: allow bounded extensionless object names on the already verified EDGE image hosts. Existing protocol/host/path/query/credential checks remain. HTML/SVG/scripts and unknown hosts are not promoted to photo URLs. File extensions are not trusted as proof of image validity: downloaded bytes still pass existing MIME/hash/bitmap validation.
2. `apps/extension/src/content/edgeGalleryBridge.ts`: react to both native and jQuery `vdp:gallery:init` notifications, alongside existing Fotorama events. Read only documented gallery metadata under a verified selected vehicle. No gallery movement, arbitrary script parsing or access to account/session state.
3. `apps/extension/src/background/edgePreloads.ts` and `edgePreloadStore.ts`: continue source photo preparation when a cache is bound to a transfer instead of stopping new work on click. Four speculative EDGE downloads total, up to four for a visible/bound vehicle and one per inactive context, inside the unchanged global eight-download limiter. Track expected/discovered counts, preparation states, first/last photo timestamps and verified discovery completion. Persist claims and forwarded identities so source preparation does not redownload files concurrently adopted by the destination. Restore them across worker suspension. Public diagnostics omit photo identity paths.
4. `apps/extension/src/photos/edgeTransfer.ts`: replace the four-photo **upload** loop with one ordered prepared collection. Internal preparation/transport remains four at a time using the existing native Blob store, 192 KiB chunk messages, per-file hash verification and File construction. Release internal job copies after their native Files are retained. Text proceeds independently. After text completes, allow one final bounded gallery-growth check if needed, then reacquire the current React file input and call the unchanged `uploadPhotos` **once** with the complete destination-eligible collection.
5. `apps/extension/src/photos/edgeDiagnostics.ts` and `content/edgePreparation.ts`: EDGE-only stage aliases for import click/text start/completion and batch/preload outcomes. Development logs contain only opaque IDs, stage/count/timing/error codes. Partial discovery is not logged as complete.
6. `packages/parsers/tests/fixtures/edge-28.html`, `edge.browser.ts`, `edgePreload.browser.ts`: extensionless actual gallery structure, one-operation collections, 28/47/60-photo galleries, delayed gallery growth, rejected/partially accepted batches, preparation failures, worker reconstruction and updated thirty-source-context bounds.
7. `apps/extension/scripts/edge-real-fixtures.mjs`, `verify-transfer.mjs`, `packages/parsers/tests/reactForm.fixture.ts`: read real image references from all three supplied documents without persisting authenticated HTML; measure actual multi-file input change count and timestamp, assert one initial upload per successful vehicle and verify original text after React/photo side effects.
8. This report and `docs/edge-single-batch-evidence/`: sanitized results.

`apps/extension/src/background/edgeRefresh.ts` and the EDGE-only photo request branch in `content/manheim.ts` also distinguish a bounded complete-gallery wait from the initial first-usable-photo request. New frames must satisfy actual discovery readiness or the bounded partial-result deadline; one image never proves completion.

No shared MyAuto text filling, shared uploader, global session admission/concurrency, other platform adapters, UI or Admin behavior was changed by this task. Earlier working-tree changes in shared files were retained.

## Gallery, resolution and binary contract

The primary source remains the selected Fotorama instance's complete `data` collection, accessed through the isolated MAIN-world bridge. Only matching listing/VIN metadata is accepted. Fallbacks retain verified direct frame attributes, anchors, thumbnails, stage, print/download references and gallery-correlated metadata. A complete API dataset preserves its order and unique photo identities; a snapshot's empty frames never create invented URLs.

Existing observed resolution identity/ranking, approved redirect origins, authorized browser downloads, bounded transient retries, response-size checks, image decoding and JPEG/PNG/WebP preservation remain. GIF/AVIF/BMP conversion still uses the existing decoder only when required. All binaries stay in IndexedDB/native Files; no whole collection is serialized into a runtime message or storage.local/sync.

Temporary cache: 128 MiB total prepared/reserved bytes, 64 MiB/context, 34 contexts and existing bounded metadata/reference guards. Large collections may pause under backpressure and continue via foreground preparation. Native destination collection has a 128 MiB guard and preparation deadline of 60 seconds. Text completion and uploader readiness also have bounded waits. Source cleanup/navigation/cancellation and actual job lifecycle controls remain in force.

All discovered URLs are eligible for source preloading; the actual destination form's verified count/size limits determine the submitted collection. If it permits 15, do not submit 28/47/60. Synthetic larger-capacity forms verify the lack of an EDGE-specific 15-photo source cap. Excess, missing and failed images are reported; they do not silently become successful uploads.

The initial destination operation is one DataTransfer/FileList and one change event, handled by the existing shared uploader. Its existing bounded retry of **only site-confirmed removed failed IDs** remains unchanged. A partially rejected collection can therefore produce one additional missing-file retry; confirmed files are never sent again. There is no adapter loop that dispatches one upload per image or per four-photo group. Unsupported non-multiple controls are rejected rather than silently switching strategies. Existing site photos are never cleared.

## Validation and measurements

Commands: `npm run build:extension`, extension ESLint, parser TypeScript, EDGE browser tests and the full sanitized workflow suite. Built Manifest V3/popup assets are verified. Separate real-file Chrome runs use dedicated temporary profiles and thirty page targets; source/destination HTML and MyAuto upload-server completion are simulated, while EDGE image requests are real.

The new extensionless snapshot run discovers/prepares 17 real JPEGs before click. The verified simulated MyAuto capacity is 15; fifteen distinct 1600px files are delivered/confirmed in **one change event**. The second vehicle independently delivers/confirms one real JPEG in one change event. Detailed timings and counts are retained separately in `edge-single-batch-evidence/extensionless-28.json`.


| Single-run timing (ms) | Extensionless multi-photo A | Single-photo B |
| --- | ---: | ---: |
| Content detected → text ready | 10 | 4 |
| Content detected → all observed files prepared | 1891 | 186 |
| Click → transfer session | 45 | 30 |
| Click → first text field | 399 | 347 |
| Click → multi-file input change | 1621 | 1333 |
| Click → simulated gallery acceptance | 1623 | 1334 |
| Click → final observation | 2304 | 2185 |

Full gallery completion is not claimed for the saved 28-position DOM: only 17 URLs are present. Its `galleryComplete` remains false. Time to all **observed** photos ready is measured using `lastPhotoAt - pageAt`; a verified complete gallery uses `completedAt`. Readiness timing begins when content is detected, not network navigation/TTFB. Live Fotorama is expected to expose the remaining entries when initialized, but no authenticated complete 28-frame API response was available in this environment.

The delayed-gallery run holds the original multi-photo gallery until mileage persists, then prepares all selected Files and submits them together. Text does not depend on gallery/download completion. Its second vehicle remains independent. File names, MIME, positive sizes, hashes, decoded dimensions, unique content, one input change, unchanged descriptions, preserved text and no publication are checked.

Tests also cover 1/5/15/28/47/60 ordered collections, mixed image bytes, no thumbnails, lazy attributes, missing photos, denied/transient downloads, complete batch rejection, partial 14/15 acceptance with one safe missing-file retry, larger verified destination limits, source closure/navigation, worker reconstruction, duplicate suppression, pending preload joins and thirty independent source contexts.

## Remaining live verification

Authenticated MyAuto acceptance is **not verified**. Simulated gallery acceptance is not live server acceptance. Account-specific uploader readiness, real rejection responses, expired authenticated sessions and long-lived real thirty-tab use still require Chrome observation. The supplied partial snapshots cannot establish that every unloaded source image is accessible. No advertisement is published automatically.

Reload the unpacked extension and EDGE source page. Observe a gallery initializing, click once, confirm text fills promptly, then verify that MyAuto's real gallery reaches its allowed count without duplicate images. Repeat with the extensionless source, an immediate cold click and another vehicle. Inspect remaining source-limit/download warnings before manual publication.
