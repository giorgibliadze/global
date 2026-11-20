# EDGE startup hang: cause, isolated fix and verification

## Reproduced blocking path

The EDGE source used `VehiclePreparation`, which invalidates its ready generation for every relevant mutation under `#vdp`, including gallery `src`, classes, styles and bridge JSON. During preparation, `parseEdgePipeline` called `edgeGallery`, which dispatches a request to the MAIN-world Fotorama bridge. When gallery metadata changes, that bridge updates its own DOM script. The preparation observer treats this as another vehicle change, discards the generation and schedules preparation again. Gallery loading can therefore keep the launcher updating, invalidate the preparation ID during source verification, or exhaust resolve retries before any MyAuto tab exists.

`edgeStart.browser.ts` reproduces the dependency using the actual parser/preparation path and a continuously updating gallery bridge: the old preparation makes repeated gallery requests and cannot stay ready. The new EDGE preparation remains ready through the same gallery churn and a gallery-only hash change. This proves a code-level source of the reported pre-transfer behavior; the user's authenticated Chrome failure itself was not directly observed.

A second serialization bottleneck prevented safe overlap: the generic PHOTO_REFRESH path awaited the source's gallery while holding the same job lock required by form progress. EDGE now waits outside that lock and only locks the final identity-checked metadata commit. A targeted regression holds the actual gallery-response promise until the mileage field persists; text progresses and releases it successfully.

## Isolated implementation

- `content/edgePreparation.ts`: EDGE-only text preparation with mutation-driven scheduling, no gallery readiness dependency, no gallery bridge writes, 2s identity readiness and 1.5s per background preparation message. Gallery/bridge changes, CSS animation, unrelated auction price fields and gallery-only hash navigation do not invalidate ready text. Returning to a tab reuses a still-valid preparation ID rather than starting a competing invalidation. Expired/failed preparation cannot return an old ready snapshot. Real text/identity changes, SPA root changes and cancellation are checked. No periodic polling or infinite retry loop.
- `parsers/src/edge/index.ts` and `gallery.ts`: passive immediate extraction for text preparation, retaining available photo references without asking the bridge to initialize. Missing galleries or optional detail rows do not block reliable title/VIN identity. When body/model separation is unavailable, preserve the full source designation rather than guessing a shortened model. Existing labeled model/trim, mileage, normalization and mapping remain in use.
- `content/manheim.ts`: select `EdgePreparation` only for EdgePipeline; other sources retain the original preparation class. EDGE photo requests return first usable references, with a bounded observer wait for initial/growing galleries; other sources retain their original photo readiness policy.
- `background/edgeRefresh.ts` plus narrow `transfers.ts` wiring: a 3.5s source-response deadline outside the job lock; retain captured source data if the source tab closes. New references must match source VIN/listing identity. Prefer authoritative source order before preparation begins; later additions preserve already-used indexes. No shared session schema or global concurrency changes.
- `photos/edgeTransfer.ts`: first bounded batch may prepare independently of text. Upload and final photo progress wait for the text-completion gate (60s deadline, abort-aware). At most four temporary photos per batch remain in use. After an incomplete gallery's current references are exhausted, allow at most two bounded growth requests. Failure of an image does not stop valid files.
- `myauto/transfer.ts`: opt-in EDGE photo task starts alongside text; the original promise is always awaited/reported after form work, with an early rejection handler solely to avoid an unhandled rejection while text continues. Shared filling/uploading implementations are untouched. All-failed/empty photos cannot advance the monotonic job stage ahead of pending text progress.
- `photos/edgeDiagnostics.ts`: development lifecycle labels DETECTING / EXTRACTING_TEXT / STARTING_TRANSFER / FILLING_TEXT / DISCOVERING_PHOTOS / DOWNLOADING_PHOTOS / UPLOADING_PHOTOS / VERIFYING / COMPLETED / PARTIAL_SUCCESS / FAILED, with separate text/photo lanes. Before the actual session exists, source logs use the preparation ID; the transfer record links that ID. No VINs, cookies, signed URLs or raw session exceptions are logged.

The existing CDN permission, authorized downloader, image decoding, chunk/hash transport, MyAuto upload contract, source limits, UI design and global concurrency remain unchanged.

## Timing: actual Chrome APIs and real CDN, simulated websites/server

The final measurement uses an empty Chrome profile, 30 open mixed fixture tabs, real EDGE CDN images, and a source gallery deliberately absent until the mileage field is persisted in MyAuto. The source HTML/identifiers and MyAuto server acknowledgment are simulated. No actual authenticated MyAuto publication or upload is claimed.

| Measurement from click | Multi-photo example | Single-photo example |
| --- | ---: | ---: |
| Session created | 97ms | 60ms |
| Destination form ready (upper bound on tab opening) | 607ms | 530ms |
| First text field filled | 668ms | 655ms |
| First positive photo-reference checkpoint | 948ms | 60ms (captured references already available) |
| First simulated gallery acceptance | 4613ms | 2351ms |
| Whole fixture trial | 9050ms | 3347ms |
| Source confirmation/extraction phase | 1.7ms | 2.9ms |
| Photo download/preparation phase | 6973ms | 446ms |

The first source was photo-empty at click time, yet its text persisted before the gallery was restored. The initial separate sample measured 543ms/356ms first text. Another run under concurrent test load measured 1635ms/2508ms. These observations are not a production latency guarantee; the important invariant is that gallery/network completion is not a prerequisite for text.

## Photo results and limits

- Multi-photo snapshot: 47 declared frames, 17 available saved identities; 15 real images downloaded, decoded, delivered as Files and confirmed in the simulated destination's 15 slots. The saved snapshot cannot provide the other 30 URLs; two known images exceed the detected destination capacity.
- Single-photo snapshot: exactly one real JPEG downloaded, delivered and simulated-confirmed.
- No live MyAuto accepted-photo count is available. Server rejection/authentication behavior still needs an authenticated browser observation.
- Current source metadata safety limits and the actual form's 15-slot / 15 MB constraints are retained; this fix does not remove resource protection or change other sources' limits.

## Tests

Passed: `npm run build:extension`, extension ESLint, parser TypeScript, EDGE regressions, full existing workflow regression suite, and the built MV3 30-tab held-gallery / real-CDN check. Manifest and popup assets are generated.

Targeted cases: old preparation self-invalidation; gallery churn; gallery-only hash changes; actual text changes; SPA identity changes; no optional details; no photos; source response held until text persists; source closure with captured references; first four images upload before the next five are available; partial/all-failed image requests; 30/60-photo bounded batching and destination limits; independent transfer IDs; timeouts/cancellation; preserved VIN, original mileage, negotiable price and skipped description; no publication. Shared integrations retain their passing tests.

## Modified files in this startup fix

- `apps/extension/src/content/edgePreparation.ts` (new)
- `apps/extension/src/content/manheim.ts` (EDGE-only selection/request handling)
- `packages/parsers/src/edge/index.ts`, `gallery.ts`
- `apps/extension/src/background/edgeRefresh.ts` (new), `transfers.ts` (EDGE-only routing)
- `apps/extension/src/photos/edgeTransfer.ts`, `edgeDiagnostics.ts`
- `apps/extension/src/myauto/transfer.ts` (EDGE-only scheduling)
- `packages/parsers/tests/edgeStart.browser.ts` (new), `edge.browser.ts`, `reactForm.fixture.ts`
- `apps/extension/scripts/verify-transfer.mjs` and this report/evidence.

Admin, shared field filling, shared upload adapters, other source preparation policies, global concurrency and UI styling were not changed.

## Reproduce / remaining live verification

```sh
npm run build:extension
npm run lint -w @auto-importer/extension
npm run typecheck -w @auto-importer/parsers
AUTO_EDGE_TEST=1 npm test -w @auto-importer/parsers
npm test -w @auto-importer/parsers
AUTO_EDGE_TEST=1 AUTO_EDGE_REAL_CDN=1 AUTO_EDGE_REAL_DOM_ONLY=1 AUTO_EDGE_HOLD_GALLERY=1 AUTO_STRESS_TABS=30 AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

The last command needs installed Chrome and the supplied original DOCX files for in-memory photo URL lookup. It never executes authenticated source HTML or posts fixture data to actual MyAuto. Evidence is in `edge-startup-evidence/`.

Reload the unpacked extension and refresh the EDGE page before testing the new content script. Verify a single click opens MyAuto promptly and starts text while the source gallery is still loading. Then inspect actual accepted MyAuto gallery cards/upload responses, separately from downloaded-file counts. Keep final review and publication manual. Live authenticated acceptance remains unverified.
