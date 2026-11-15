# Photo transfer reliability — diagnostics and staged binary transfer

## Confirmed code-level failure paths

Inspection found three concrete timing defects before the fix:

1. The source gallery resolver returned as soon as **one** URL existed. A partially rendered/lazy gallery could be frozen into the prepared payload. Refresh was requested only for zero-image payloads, so a nonzero partial gallery was not revisited.
2. Downloads started from the destination content script **after** MyAuto navigation. URLs/source session availability were still needed during destination processing. Pending data was not staged before navigation.
3. Upload readiness meant only “a nondisabled file input exists.” It did not check initialization/visibility/pointer-events/loading ancestors.

Additional issues: source gallery ownership was not checked against structured `fyuseUid`; binary cache was removed on every finish, including partial failures; there was no photo-only retry path, and partial text success could hide a photo failure in minimal UX.

The lazy/first-URL defect, nested uploader readiness, stale SPA album, failed-file-only retry and durable-cache behavior are reproduced in browser regressions. These findings do **not** establish which HTTP/auth/CDN failure occurred on the user's live browser. New stage logs distinguish that rather than guessing.

## Current workflow

One floating-icon click retains the existing vehicle identity/prefetch checks, then resolves the gallery for that vehicle, downloads up to 15 images with concurrency three, validates MIME signatures, and commits Blob/metadata rows in IndexedDB under the transfer ID. MyAuto opens after that preparation attempt. Available photos survive partial failures; unsupported/missing photos do not prevent existing text autofill.

Gallery readiness is MutationObserver-driven with a six-second deadline. Fifteen available URLs resolve immediately. Smaller/partial galleries remain observed until the bounded deadline, rather than treating an arbitrary quiet interval as proof of completeness. The existing large URL/main-image sources, full-resolution preference, URL deduplication/order and selected-detail scope remain. When structured `fyuseUid` is present, a Fyuse image must belong to that exact album path segment. This relationship was verified against the original supplied Manheim24 document; it is not a fabricated vehicle selector.

After text/specifications/location finish, the receiver reconstructs cached Files using bounded JSON-safe chunks plus SHA-256. A staged transfer never silently starts fresh network downloads from its destination. Blob/File objects are not sent through Chrome runtime JSON messaging. Image bytes remain Blob data in IndexedDB; base64 exists only at the message chunk boundary. The extension does not create/revoke object URLs; MyAuto owns its supported file-selection and preview lifecycle.

Uploader readiness observes the actual dropzone/file input, multiple-file capability, ancestor display/visibility/pointer state and pending loading indicators. Files are attached via DataTransfer and change events. Submission is distinct from confirmation: loaded HTTPS images in the site's completed gallery items plus the site count must agree. FileList assignment or local previews alone are never success.

## Retries and safety

- Downloads: at most three attempts, exponential 300/600ms backoff for timeout/network/429/5xx. Invalid URLs, unsupported image bytes, oversize responses, access denial and HTTP 404/410 do not loop. Credentials remain browser-managed; redirects remain blocked; no authentication bypass was added.
- Automatic uploads: at most one failed-file retry, with backoff, only for observed removed IDs and explicit transient failure evidence. Unknown failures are not silently retried as if they were transient. Visible authentication/login evidence stops retries.
- A receipt associates confirmed file indices with observed gallery slots. Known missing indices are separate from uncertain submissions. The optional photo-only retry rebuilds only those missing files, validates the existing gallery baseline, appends safely and keeps all text/description/manual values intact. Successful photos are neither resubmitted nor cleared.
- Unknown/interrupted upload state is not blindly replayed. Generic/legacy galleries without reliable per-file mapping cannot safely offer partial retry.
- Missing photos retain cached bytes until success or existing TTL cleanup. Full success removes binary data. Pending staged jobs recover on worker startup using durable session/IndexedDB state, without requiring the source session after a verified snapshot. A lost begin-message response can recover the active job instead of starting another one.
- If a worker dies during the narrow unacknowledged tab-creation window (`opening` without a saved destination ID), navigation is marked uncertain rather than opening another tab automatically. Binary data remains retained; manual retry/review is required.

Initial batch order is preserved. A native safe append can place retried photos at the end; automatic drag/reorder of existing images was not invented.

## Diagnostics and minimal UI

Developer-console entries use `[Auto Importer photos]` with transfer ID, typed stage and optional numeric image index/attempt/count/HTTP status. They never accept raw exception text, URLs, VINs, DOM, cookies or tokens.

Stages distinguish: gallery not loaded, no image URLs, invalid/expired URL, authentication expired, download failure, messaging failure, file conversion/integrity failure, storage failure, uploader not ready, file input rejected, upload request failure, gallery not confirmed, uncertain navigation, URLs resolved, binary prepared and confirmation.

HTTP status is logged only when directly observed during an image download. Native uploader server status is not inferred from a DOM removal; uncertain request/auth causes still require live Network inspection. No broad webRequest permissions/private APIs were added.

The normal UI remains icon-only while processing. Photo failure shows only **ფოტოების გადატანა ვერ დასრულდა** and, when safe, **ფოტოების ხელახლა ცდა**. The retry action is nonblocking and does not repeat text autofill. Successful transfers show no detailed summary/logs. No publication occurs.

## Files changed

- `apps/extension/src/background/transfers.ts`, `background/index.ts`: pre-navigation staging, durable restart recovery, retry/report messages, cache retention.
- `apps/extension/src/content/photos.ts`, `content/manheim.ts`: bounded gallery readiness and identity-aware protocol.
- `packages/parsers/src/manheim24.ts`: structured-media ownership filtering and rejected-URL count; specification extraction unchanged.
- `apps/extension/src/photos/download.ts`, `client.ts`, `upload.ts`, `galleryUpload.ts`: typed diagnostics, backoff, cached reconstruction, readiness and confirmed per-file outcomes.
- New `photos/diagnostics.ts`, `readiness.ts`, `receipt.ts`, `retry.ts`.
- `apps/extension/src/myauto/transfer.ts`: photo-only staging/receipt integration; field adapters unchanged.
- `apps/extension/src/myauto/index.tsx`, `services/useDirectTransfer.ts`: minimal photo error/retry and message-response recovery.
- `packages/shared/src/index.ts`: optional photo staging/failure/receipt metadata.
- New tests `photoReliability.browser.ts`, `photoRetry.browser.ts`; updated source-protocol/transfer/prefetch/receiver/optimization/identity/photo regressions and built-MV3 harness.

No Admin changes, dependencies, host-permission expansion or field-adapter refactor.

## Validation and remaining live scenarios

Passed: `npm run build:extension`, parser TypeScript, extension ESLint, complete browser regression suite, 19 built-UI Chrome fixtures and `git diff --check`. Manifest/popup assets are generated.

Coverage includes immediate/delayed/lazy gallery, stale SPA album, 15-image limit/dedup, HTTP 410 and 403 permanent failures, temporary 503 download retry, late uploader initialization, 12+3 transient partial upload, one-missing-file user retry, concurrent-click lock, interrupted/unknown state, Blob/message integrity, source/destination independence, recreated-worker binary retrieval and startup recovery. Retry tests verify unchanged VIN/mileage/description/negotiable state and field results.

The unpacked-MV3 test uses real Chrome APIs and actual public RHF code with source-derived site handlers. Both vehicles finish with **15/15 fixture-gallery photos**. The harness fails if any background image download starts after the new destination tab exists, verifies staged count 15, and checks that completed reload does not restart transfer/publication.

**Authenticated live auction/MyAuto uploads were not tested. Two physical computers were not tested.** Isolated browser fixtures do not prove real CDN availability, cookie partitioning, authentication refresh, regional redirects, real MyAuto upload API status or behavior under actual OS/memory/network differences. Other auction platforms still need their own verified parsers; this real parser remains Manheim24. Signed/unknown URL formats remain rejected by the existing security allowlist.

For live testing: reload the extension and source/MyAuto pages; open one vehicle and click the icon once. Compare source and service-worker `[Auto Importer photos]` logs by transfer ID, then the MyAuto content console. Verify source URLs resolve → Blob preparation finishes → MyAuto opens → text fills → gallery confirms photos. If partial, use only the provided photo-only retry. Check the actual gallery, manual fields, description and negotiable state; repeat after SPA vehicle changes and on the second computer. Never paste VINs, cookies, tokens, or signed URLs when sharing diagnostics. Final review/publication remains manual.
