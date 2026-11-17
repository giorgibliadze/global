# MyAuto destination photo performance fix

## Confirmed findings

This is a destination-only follow-up to the completed cross-domain stability audit in `cross-domain-stability.md`. Auction parsers, gallery selection, source identity/caching, form mappings, photo quality and publication behavior are not changed in this follow-up.

Inspection used the already downloaded **public** MyAuto `main.js` bundle in the local diagnostic directory, not authenticated page scripts or private APIs. Its dropzone handler accepts a multi-file list, creates stable local-ID loading placeholders, and lets MyAuto dispatch its own upload groups: the first file and up to seven groups for the remainder. Successful response mapping attaches `url`/`serverId` and sets `isLoading:false`; the render then changes `photo-video-loading-<id>` to `photo-video-item-<id>`. Failed response IDs are removed. No extension network request, upload endpoint bypass, React internals, authentication interception or forced server concurrency is added.

The extension already used one native multi-file change event; sequential per-photo upload was not found. The demonstrated overhead was **after** the mock server response: verification required every remote thumbnail to finish decoding and then an additional 750-ms quiet window. A slow preview/CDN response therefore delayed a transfer whose upload-response item state had already appeared. A 1/5/15-photo isolated Chrome fixture reproduces this with immediate versus delayed preview decoding. This proves an extension verification bottleneck; it does not prove that every reported live delay had this cause.

## Targeted changes

- Named MyAuto galleries count only newly mapped server-response item cards with remote HTTPS image URLs, matching the site's own count and no outstanding loading/progress state. Local/base64/blob previews and mere FileList assignment remain insufficient.
- The complete mapped queue/count/identity signature must survive a second event-loop turn. Successful completion no longer waits for thumbnail decoding or the 750-ms retry quiet window. Partial/removed-ID retry still retains the conservative quiet window and retries only known failed files; successful images are never cleared.
- One native multi-file submission remains. Actual FileList length is checked, input ordering/file sizes are retained and no image re-encoding is added. MyAuto manages its own request grouping/concurrency.
- The destination now uses explicit enabled, multi-file, nonbusy uploader readiness. A deliberately hidden native input or collapsed section is not mistaken for an uninitialized handler; disabled/inert/busy states still wait with a bounded observer.
- Diagnostics distinguish page ready, reconstructed payload/files ready, uploader ready, native submission, observed loading queue, response item acceptance and final verification. `fileSubmission`, `uploaderReadiness`, `uploadQueueWait`, `uploadAcceptanceWait` and `galleryVerification` spans use `performance.now()`. Actual HTTP request start/end cannot be measured from DOM alone; the observed loading/response interval is labeled accordingly, not claimed as network timing.
- Photo messaging now has abortable deadlines: 60 seconds for background preparation (including download queue/retries) and 10 seconds per byte chunk. Normal replies clear the timers immediately; there is no added successful-path wait. A never-responding worker produces `MESSAGE_TIMEOUT` instead of an unbounded preparation promise. If no initial worker received metadata, unsent photos fail promptly rather than waiting through additional full timeout batches. Late replies are ignored, and normal transfer completion/abort uses the stability task's cancellation. No automatic full-batch restart is introduced.
- Existing MV3 JSON-compatible chunk transport, SHA-256 verification, original bytes/File construction, bounded download concurrency, one-click flow, Georgian UI and fast text autofill remain. Text never waits for photo preparation.

## Validation scope and limits

New regressions cover 1/5/15 batch selection, original order and a 14-MiB file, disabled→ready uploader observation, CSS-collapsed uploader, remote response items with deliberately unready previews, rejecting local/base64 preview success, and never-responding worker messages. Existing tests cover partial failed-ID retries, duplicates, slow downloads, native input replacement, source isolation, 120 accelerated transitions, React-controlled field recovery and independent vehicle transfers.

The benchmark uses synthetic 1-MiB Files, a 100-ms simulated server response, optional 1200-ms preview decoding delay and the frozen pre-fix adapter in `tests/fixtures/performance/galleryUpload.before.ts`. Frozen code contains no session data. File creation timings are synthetic allocation costs, not measured background transport. The readiness row compares the old native-input predicate with the current uploader predicate. Actual upload-network duration is **unavailable**; only the fixture's independently timestamped server delay is known.

Real authenticated MyAuto acceptance, actual live upload concurrency/throughput, a real service-worker process restart while uploading, multi-hour sessions and different computers remain unverified. The earlier/current fixture suites test contracts and lost-message handling, not those live conditions. Do not infer live upload success from these numbers.

## Files in this photo follow-up

- `apps/extension/src/photos/{galleryUpload,upload,readiness,client,checkpoints}.ts`
- `apps/extension/src/myauto/transfer.ts`
- `packages/shared/src/index.ts`
- `packages/parsers/tests/{photoDestination,photoPerformance,workflow}.browser.ts`
- `packages/parsers/tests/run-browser.mjs` and `photoDestination.runner.ts` (targeted runner)
- `packages/parsers/tests/fixtures/performance/galleryUpload.before.ts`
- This report and `myauto-photo-performance-results.json`.

`apps/admin`, source adapters and existing vehicle mappings are untouched by this follow-up. Cross-domain lifecycle files changed in the preceding completed task are documented separately.

## Measured destination-only results

For 15 synthetic files with immediate previews (one sample per version; milliseconds):

| Stage | Before | After |
|---|---:|---:|
| File construction | 24.40 | 21.30 |
| Uploader readiness | 0.20 | 0.10 |
| Native file submission | 0.20 | 0.20 |
| Simulated server upload interval | 101.00 | 102.10 |
| Completion verification | 752.40 | 1.40 |
| Total destination photo stage | 878.20 | 125.10 |

**Actual live upload latency: unavailable for both versions.** File construction/readiness/submission were not claimed as speedups; the optimization removes demonstrated verification overhead. Allocation and timer noise affect small numbers.

| Photos | Preview delay | Before submit→verified | After submit→verified | Simulated accepted |
|---|---:|---:|---:|---:|
| 1 | 0 ms | 854.8 ms | 102.4 ms | 1 |
| 1 | 1200 ms | 2052.6 ms | 102.2 ms | 1 |
| 5 | 0 ms | 864.7 ms | 102.7 ms | 5 |
| 5 | 1200 ms | 2053.3 ms | 103.0 ms | 5 |
| 15 | 0 ms | 853.6 ms | 103.7 ms | 15 |
| 15 | 1200 ms | 2055.9 ms | 104.3 ms | 15 |

Each observation uses exactly one multi-file event; no successful photos are restarted. In the slow-preview scenario, the after adapter finishes before preview decoding and cancels the fixture preview timers during teardown. This verifies separation from previews, not faster image networking.

Final validation: full source/transfer browser regressions, 120-transition stability test, targeted 1/5/15 and 14-MiB batch tests, partial failed-ID retry and lost-worker timeout tests passed. Recreating the worker-owned manager and IndexedDB store recovered persisted photo bytes without a download; this is a restart-contract test, not stopping a live Chrome worker process. Built MV3 Site/MyAuto tests confirmed 15 simulated photos for each of two isolated vehicles, preserved React fields, lazy-gallery handling and passive normal pages. Actual authenticated MyAuto acceptance remains unverified.
