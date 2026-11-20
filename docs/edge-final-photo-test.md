# EDGE final photo reliability and speed test

## Outcome and scope

One new **EDGE-only** defect was reproduced and fixed: a valid one-image runtime prefix could be marked ready before the thumbnail strip mounted even though the actual BMW `.slide-counts` widget declared **47** frames. The extractor now honors the supplied `1 of N` widget. It still completes as soon as the first 15 distinct originals are available, without waiting for all 47. A fully enumerated API that contains 47 duplicate frames but only five distinct originals completes immediately with five, without duplication or a readiness timeout.

The original failure is archived as an intentionally failing **before-fix** regression in `edge-benchmark/before/counter-repro.log`; the final tests pass. No download/upload architecture, field mapping, mileage, EV logic, UI, concurrency setting or other source was changed. No speculative speed optimization was applied: measured source inspection was sub-millisecond, while the longer stages belong to existing photo transport and destination processing outside this task's permitted change boundary.

Authenticated EDGE/MyAuto browser access was unavailable. All end-to-end numbers below use the built unpacked extension with **real Chrome APIs and simulated websites/server responses**. They are not successful authenticated uploads.

## Actual supplied fixture counts and quality limits

| Evidence | BMW 2-Series | Tesla Cybertruck CyberBeast |
| --- | --- | --- |
| Declared gallery frames | 47 | 1 |
| Distinct observed image identities across supplied nav/stage/print | 17 | 1 |
| Populated ordered thumbnail identities | 16 | No thumbnail strip |
| Selected source URLs | 15 | 1 |
| Static selected high-resolution URLs | 2 observed 1600×1200 variants | 1 observed 1600×1200 variant |
| Static selected thumbnail-only URLs | 13 observed 100×75 variants | 0 |
| Live downloaded/accepted count | Unverified | Unverified |

These dimensions are encoded in observed source variants, not a live pixel measurement. The runtime bridge prefers actual `full`/`img` originals when present. No CDN URL paths are invented. Remaining originals cannot be recovered from the static snapshot alone. Generated test pixels must not be mistaken for actual BMW/Tesla photographs.

## Benchmark methodology and complete results

See [all stage timings, before/after tables and memory controls](edge-benchmark/summary.md), [before raw measurements](edge-benchmark/before/results.json), [after raw measurements](edge-benchmark/after/results.json), and [gallery/recovery samples](edge-benchmark/gallery-recovery.json).

- Hardware recorded by the runner: Intel Core i7-8569U, 16 GB RAM, macOS x64; Node v24.19.0. Desktop/background load was not controlled as a laboratory experiment.
- Seven scenarios per phase: baseline **1, 5, 10, 20, 30** page targets, plus explicit synthetic five- and ten-photo galleries. Each has **five BMW and five Tesla trials in one Chrome session**, without a restart between trials.
- **70 transfers before + 70 after = 140 positive matrix transfers**; **485 File deliveries per phase / 970 total**, all with matching prepared/submitted/accepted counts. These are repeated synthetic files, not 970 different auction photos.
- Thirty baseline pages means one active source plus idle EDGE/MyAuto pages; each transfer temporarily opens one independent destination and returns to baseline after cleanup. This is **not 30 simultaneous transfers**. Existing active-session/global-download caps were retained. Observed run-wide download high-water mark was four.
- The controlled CDN pause is 120 ms per request. Generated lossless 1600×1200 PNGs are approximately 972,800 bytes, with distinct content per source photo. Assets are generated/warmed outside measured transfers. Sources, options and server acceptance are deterministic fixture responses; real authentication/CDN redirects/network variability are not reproduced.
- SHA-256, exact size, MIME, decoded dimensions, unique content and original order are checked on every delivered File, after the measured interval. No production compression/re-encoding was added.
- Network fetch wall time comes from worker Network events. Existing download phase also includes queueing, runtime chunks, hashing and File construction. File-preparation and messaging totals are accumulated operation durations and overlap; **do not add them as consecutive stages**.
- Click-to-photo time ends at confirmed simulated gallery acceptance. Click-to-completed-draft also includes field/persistence checks and polling granularity. Source DOM query timing is distinct from the 50-sample detached full EDGE inspector/collector microbenchmarks; neither certifies live source-rendering time.
- Network groups have N=5: median and maximum are reported, **no fabricated network p95**. Detached gallery groups have 50 measured samples after five warm-ups and a descriptive nearest-rank p95.

Representative click-to-photo results, milliseconds:

| Baseline tabs | Vehicle | Before median / max | After median / max |
| ---: | --- | ---: | ---: |
| 1 | BMW, 15 files | 2892 / 3212 | 2853 / 2871 |
| 1 | Tesla, 1 file | 2257 / 2447 | 2235 / 2488 |
| 30 | BMW, 15 files | 3670 / 4639 | 3369 / 3469 |
| 30 | Tesla, 1 file | 2637 / 2791 | 2543 / 2932 |

These observed differences are not causal proof of a speedup from the small readiness guard. Healthy payloads, image quality, bounded concurrency and server latency were equivalent; run/cache/scheduling variation remains. The main matrix benchmarks the declared-counter candidate; the subsequent duplicate-enumeration safety refinement changes no selected payload in those matrix cases and was additionally verified with focused tests and a native 47-frame/five-unique control. No separate performance gain is claimed for that refinement.

## Bottleneck findings

Source inspection is much shorter than fetch/File transport and destination operations. The BMW workload is largely limited by the existing photo transport; the one-photo Tesla workload spends more relative time on the existing form-before-submit and upload-verification boundaries. The fixed simulated acceptance/React/polling behavior is not a measured live MyAuto server upload time. Reducing shared quiet periods, changing message serialization or global concurrency would exceed scope and was not attempted.

There were no duplicate worker fetches or redundant successful upload events in positive native matrix trials. Each transfer had a unique ID and destination; all source-to-File hashes matched, and no source-vehicle mixing appeared in these fixtures. A complete first-15 prefix is accepted immediately; incomplete declared galleries remain bounded by the existing readiness mechanism.

## Recovery and quality checks

Five-trial recovery groups cover a slow synthetic CDN, transient network failure followed by success, invalid URL rejection without fetch, cancellation without retries, and source-tab removal during a pending authorized download. The latter simulates the background removal event and verifies stored/chunked bytes survive, then are removed on destination cleanup. Tab switching and repeated source navigation occur throughout the native matrices.

Five partial-uploader trials submit **15 then only the one identified missing file**. Fourteen accepted files are preserved; a repeated failure remains **14/15**, never fake completion. Expired/missing 404, unauthorized 403 and HTML/non-image bodies fail once; transient 503/network errors use the existing bounded retry mechanism. Successfully transferred text is not repeated by photo recovery.

Quality checks validate real decoding of the generated PNG files, MIME, size, byte identity, content uniqueness and ordering. Generated PNGs have no EXIF orientation. **Actual source JPEG/EXIF orientation, original source dimensions/quality and live server recompression remain unverified.**

Two existing shared limitations are documented, not changed:

1. `redirect: 'error'` rejects CDN redirects. Whether a real failed EDGE request redirects needs authenticated Network evidence; no browser security policy was relaxed.
2. The shared downloader validates magic bytes but does not fully decode images. A PNG-signature-only response passes that layer and fails `createImageBitmap` in the audit. Actual server/gallery rejection is therefore still essential. No shared downloader/uploader modification is included.

## Memory investigation

Summed Chrome-process RSS and source/worker JS heap were sampled before/after each trial, with GC outside timed intervals. RSS can double-count shared pages and includes caches; it is not private physical allocation. Default source heap rose across navigation trials. Clearing console entries did not remove this pattern. A second isolated-browser control with only BFCache disabled kept source documents/heap approximately stable, supporting retained navigation documents as the reason for this observed growth rather than demonstrating a photo-buffer leak. Worker heap remained small in these trials.

The BFCache flag was used **only in the isolated diagnostic test process**, not in the extension or the user's browser. Production BFCache, source lifetime handling and global settings are unchanged. Five trials are not a long authenticated soak or a guarantee of bounded memory on every machine/network.

## Validation and modified files

Validation: extension build, parser TypeScript, extension ESLint, EDGE gasoline/EV/size/recovery tests and the existing integration suite passed. Existing text/mileage/15-photo-limit expectations were preserved. Built Chrome fixture tests verify real storage/messages/File delivery, React persistence and manual-only publication. Existing ADESA coverage is hostname/detection coverage; there is no supplied ADESA vehicle-parser fixture or live ADESA test.

Only production change in this task:

- `packages/parsers/src/edge/gallery.ts`: confirmed declared-counter readiness guard and safe handling of fully enumerated duplicate-frame galleries.

Test/benchmark/report work:

- `apps/extension/scripts/verify-transfer.mjs`: optional EDGE-only repeated/size/memory/quality benchmark modes; existing modes retained.
- `apps/extension/scripts/edge-benchmark-assets.mjs`: generated test PNGs.
- `apps/extension/scripts/benchmark-edge.mjs`, `report-edge-benchmark.mjs`: matrix/report runners.
- `packages/parsers/tests/edge.browser.ts`: ten-photo case, optional measurement callback, valid synthetic widget counts.
- `packages/parsers/tests/edge.speed.browser.ts`, `edge.speed.runner.ts`: timing/recovery/quality/declared-count tests.
- `packages/parsers/tests/run-browser.mjs`: optional EDGE speed-runner registration.
- `docs/edge-benchmark/`: raw measurements, logs, controls and generated summary.
- This report and follow-up documentation links.

The earlier additive EDGE work remains in the working tree. No new edits to Manheim/Manheim24/ADESA, EDGE vehicle text parsing, MyAuto field mapping/uploader, mileage, EV parsing, UI, concurrency, authentication or Admin were made.

## Exact manual authenticated verification

1. Reload the unpacked build from `apps/extension/dist` in `chrome://extensions`, then refresh authenticated EDGE and MyAuto tabs. No browser security settings need changing.
2. Open the supplied [BMW detail](https://www.edgepipeline.com/components/vehicle/detail/58c1f23621a285813056d6e586d5f99d) or [Tesla detail](https://www.edgepipeline.com/components/vehicle/detail/abeddc8e352ccbba5280bdb363558716). Confirm the current vehicle and gallery counter. BMW's declared 47 is not a claim that all originals are already loaded.
3. Open the extension worker DevTools and destination Network panel. Click the existing launcher once. Confirm one new MyAuto draft and one transfer ID. Source URLs must remain inside the current vehicle's gallery; do not rely solely on the count or `og:image`.
4. Confirm fields begin filling before photo completion. BMW mileage must stay **9614 Miles** and Tesla **30026 Miles**; unknown BMW transmission/displacement and EV combustion values stay missing. Description remains untouched, price stays negotiable, final publication is manual.
5. For that same transfer, compare discovered/unique/selected, downloaded, prepared, submitted and accepted counts. BMW should reach up to 15 **accessible distinct** originals and Tesla one from the supplied view. Inspect the actual gallery after upload; a file-input event or HTTP 200 alone is not acceptance.
6. Compare pre-upload File dimensions/MIME/size with the actual downloaded source responses, then inspect enlarged destination photos for sharpness, order and orientation. Check for real thumbnail fallback, duplicate content, corruption and server-side resizing. Encoded URL dimensions alone do not prove decoded quality.
7. On failure, identify the first checkpoint and actual HTTP status. Record only safe counts, transfer ID, stage and redirect **hostname/status**, not signed URLs, VINs, cookies or authentication headers. A CDN redirect or decoding/server rejection remains a documented shared-boundary finding, not a reason to bypass protections.
8. Repeat five times with baseline 1/5/10/20/30 mixed tabs, closing completed destinations between runs. The automatic destination adds one tab during each transfer. Test both vehicles and source-tab switching, with the existing bounded number of active transfers rather than 30 simultaneous transfers.
9. Close the source only after its vehicle/URL payload is captured; verify pending authorized downloads and the destination draft survive. Closing before URLs exist cannot recover an unavailable gallery. For partial acceptance, use existing photo-only recovery only for identified missing files; preserve successful images and manual field edits. Never reload or publish the draft automatically.
10. For a longer memory soak, inspect Chrome Task Manager before warm-up and after repeated transfers, including navigation-history/BFCache effects. The short synthetic controls do not replace this live check.
