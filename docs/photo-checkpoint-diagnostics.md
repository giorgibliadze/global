# Intermittent 0/15: diagnostic instrumentation

## What is established

The active tracked receiver still downloads on MyAuto via `PHOTO_PREPARE`, reads base64 chunks from IndexedDB through `PHOTO_CHUNK`, checks SHA-256, creates Files and invokes the existing uploader after text/location operations. Blob/File objects are not sent through Chrome runtime JSON. IndexedDB rows are keyed by transfer ID/index; session storage binds the transfer to destination tab/document. Existing download concurrency is three and transient downloads have at most three attempts.

Code inspection found possible timing exposures, not a proven cause of the user's intermittent incident:

- Source gallery refresh resolves on its first URL and is requested only for a zero-URL payload. A partial nonzero list remains frozen.
- Downloads happen after opening MyAuto; source URL lifetime is still relevant.
- Uploader readiness checks the nondisabled file input's DOM existence, which cannot prove React handlers/server authentication readiness.
- Generic uploader dispatches `input` then `change` on the same reference. An `input` handler can replace it between events. A new browser regression reproduces this exact detached-reference condition. The narrow safety guard detects it and stops; it does not replay potentially accepted files.
- Finalization removes binary cache even on incomplete upload. No change to that persistence policy or a new replay strategy was made in this diagnostic task.

The previous untracked photo retry modules were present but not wired into the active pipeline. Optional type compatibility and a validated optional index argument let the existing files compile; their background messages/retry UI were not enabled.

## Checkpoints

Filter DevTools for `[Auto Importer photo checkpoint]`. Stages:

`PHOTO_SOURCE_READY`, `PHOTO_URLS_EXTRACTED`, `PHOTO_DOWNLOAD_STARTED`, `PHOTO_DOWNLOAD_COMPLETED`, `PHOTO_PAYLOAD_RECEIVED`, `MYAUTO_UPLOADER_READY`, `PHOTO_UPLOAD_STARTED`, `PHOTO_UPLOAD_COMPLETED`, `PHOTO_GALLERY_VERIFIED`.

Each entry includes transfer ID, a transfer-salted SHA-256 vehicle pseudonym, UTC timestamp, observed photo count and elapsed milliseconds since that context's trace creation. Download entries include file index/attempt. Counts on individual download records are per file, not cumulative. Source-ready means selected structured data was readable; uploader-ready means the existing DOM readiness predicate passed, not that the upload server accepted a request. Completed checkpoints with `errorCode` indicate failure, not success.

The source snapshot is logged before navigation. The zero-photo source refresh also logs in the source content console. Download/cache checkpoints are in the service-worker console; reconstructed payload, submission, gallery and report checkpoints are in the MyAuto console. Use the same transfer ID and vehicle pseudonym to join them. Different transfer IDs intentionally have different pseudonyms even for the same vehicle. No raw VIN, listing ID, image URL, query, exception text, cookie or token enters these logs.

The background now preserves an allowlisted `photoErrorCode` in JSON error responses. The receiver distinguishes runtime transport failure, a background preparation error, missing cached chunks, invalid metadata/chunks, hash mismatch and File construction errors. HTTP authentication, 404/410 and transient server failures remain distinguishable from transport failure.

`[Auto Importer photo report]` provides source count, downloaded count, received File count, upload attempts, verified count, failure stage/code and a cautious recommendation. Downloaded means acknowledged prepared metadata/cache availability; if a response is lost, it is a lower bound and must be compared with background checkpoints. Received means fully reconstructed and hash-verified Files. Upload attempts count dispatched change operations, not confirmed network requests. Gallery verification continues to require remote loaded previews and the site's count, never FileList alone. An empty gallery cannot be successful.

## Reproduced failure report (test only)

The browser test supplies an HTTP 410 response; this is **not a report from the user's live failing transfer**:

```text
Transfer ID: abcd1234-1234-1234-1234-123456789abc
Vehicle ID: transfer-scoped SHA-256 pseudonym
Source photos found: 15
Photos downloaded: 0
Photos received by MyAuto: 0
Upload attempts: 0
Photos verified in gallery: 0
Failure stage: PHOTO_DOWNLOAD_COMPLETED
Error code: HTTP_EXPIRED
Root cause: fixture image server returned HTTP 410 (URL no longer available).
Recommended fix: resolve fresh URLs from the same selected vehicle before any safe download retry.
```

A second test reconstructs a valid File, then deliberately changes its expected hash: downloaded=1, received=0, `HASH_MISMATCH`. Runtime rejection and background HTTP failure produce different codes. A detached-input test reports `INPUT_REPLACED` and zero verified photos without redispatching `change`.

## Scope and recovery

One-click UX, text fields, negotiable price, description skipping, location and manual publication remain unchanged. The destination shows only `ფოტოების გადატანა ვერ დასრულდა` for zero/partial photo results, including otherwise successful text transfer. Technical details stay in DevTools.

No photo-pipeline rewrite, new speculative retries or automatic whole-transfer restart. Existing bounded download retries and existing site-acknowledged upload retry remain. Detached input detection and rejecting a zero-File preparation before uploader invocation are narrow guards. A new recovery for the live failure should be chosen only after its checkpoint is observed; replaying an unknown submission could duplicate photos.

## Validation and missing evidence

Run `npm run build:extension`, `npm run lint -w @auto-importer/extension`, `npm run typecheck -w @auto-importer/parsers`, and `npm run test -w @auto-importer/parsers`.

All four commands passed on this change, as did `git diff --check`. The new diagnostic checks and the existing full parser/transfer/photo regression suite passed. `dist/manifest.json` and popup assets were generated.

The tests use local browser fixtures. No authenticated live 0/15 failure was captured. Missing evidence is the same failing transfer's source, worker and MyAuto checkpoint/report entries, plus MyAuto Network status when submission occurred but the gallery did not confirm. A real HTTP request's cause/authentication cannot be inferred from disappearing DOM placeholders.

Reload the extension and source page, enable Preserve log in source/worker/MyAuto DevTools, click once and capture one failure and one success. Compare counts in order. Share only checkpoint/report objects; do not share full page HTML, request headers, signed URLs, cookies, VINs or tokens. Do not restart a partially submitted transfer merely to collect diagnostics.

## Files

- New `apps/extension/src/photos/checkpoints.ts` and `packages/parsers/tests/photoCheckpoints.browser.ts`.
- `background/index.ts`, `background/transfers.ts`: safe error-code envelope and source/download/cache checkpoints.
- `content/manheim.ts`, `content/photos.ts`: transfer-bound source readiness/URL diagnostics.
- `photos/client.ts`, `download.ts`, `upload.ts`, `galleryUpload.ts`: transport/conversion/download/submission/confirmation checkpoints and detached-input guard.
- `myauto/transfer.ts`, `myauto/index.tsx`: compact developer report, no-empty-photo success, concise photo failure notice.
- `packages/shared/src/index.ts`: optional compatibility types for the already-present dormant retry files.
- `packages/parsers/tests/workflow.browser.ts`: registers the new tests.

No changes to `apps/admin`, host permissions, dependencies or field adapters.
