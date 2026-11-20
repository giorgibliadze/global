# EDGE benchmark measurements

Automated isolated Chrome fixtures; no authenticated auction or MyAuto requests. Five trials per vehicle/scenario, 120 ms simulated CDN delay, distinct lossless 1600×1200 PNG assets (~0.93 MiB each), identical bounded production concurrency. Baseline tabs include the source and idle EDGE/MyAuto pages; one destination is added temporarily. Each scenario reuses one Chrome session for ten transfers.

N=5 supports reporting median/max here, not a reliable network p95. Do not interpret cross-run differences as causal speedups from the readiness guard. The guard fixes incomplete-gallery acceptance, not download throughput. The legacy raw `version` string is a harness label; phase folders identify before/after.

## Click → gallery verified (milliseconds)

| Scenario | Vehicle | Photos | Before median / max | After median / max |
| --- | --- | ---: | ---: | ---: |
| tabs-1 | BMW fixture | 15 | 2892 / 3212 | 2853 / 2871 |
| tabs-1 | Tesla fixture | 1 | 2257 / 2447 | 2235 / 2488 |
| tabs-5 | BMW fixture | 15 | 3226 / 3432 | 3026 / 3138 |
| tabs-5 | Tesla fixture | 1 | 2488 / 2883 | 2349 / 2502 |
| tabs-10 | BMW fixture | 15 | 3443 / 3784 | 3086 / 3327 |
| tabs-10 | Tesla fixture | 1 | 2499 / 2833 | 2476 / 2640 |
| tabs-20 | BMW fixture | 15 | 3471 / 3585 | 3269 / 3662 |
| tabs-20 | Tesla fixture | 1 | 2677 / 2865 | 2510 / 2776 |
| tabs-30 | BMW fixture | 15 | 3670 / 4639 | 3369 / 3469 |
| tabs-30 | Tesla fixture | 1 | 2637 / 2791 | 2543 / 2932 |
| photos-5 | BMW fixture | 5 | 2700 / 2777 | 2825 / 3073 |
| photos-5 | Tesla fixture | 1 | 2550 / 2795 | 2649 / 2849 |
| photos-10 | BMW fixture | 10 | 2843 / 3054 | 2782 / 3161 |
| photos-10 | Tesla fixture | 1 | 2490 / 2613 | 2415 / 2706 |

## After: separate stages (median milliseconds)

| Scenario | Vehicle | Fetch wall | Download + File transport | File preparation work | Submit + simulated acceptance verification | Click → completed draft |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| tabs-1 | A | 1306.81 | 1474.1 | 121.2 | 1085.9 | 3642.32 |
| tabs-1 | B | 149.03 | 302 | 17 | 1076.7 | 3004.24 |
| tabs-5 | A | 1351.62 | 1573.7 | 125.9 | 1091.7 | 3864.09 |
| tabs-5 | B | 143.3 | 317.2 | 18.3 | 1079.7 | 3244.54 |
| tabs-10 | A | 1391.73 | 1656.3 | 127.8 | 1090.6 | 3921.66 |
| tabs-10 | B | 147 | 372 | 17.7 | 1079.4 | 3344.44 |
| tabs-20 | A | 1395.62 | 1802.7 | 129.1 | 1088.8 | 4069.75 |
| tabs-20 | B | 149 | 390.7 | 16.9 | 1078.7 | 3285.48 |
| tabs-30 | A | 1505.4 | 1896.8 | 128.8 | 1089.8 | 4158.91 |
| tabs-30 | B | 148.6 | 428.6 | 17.7 | 1075.8 | 3407.58 |
| photos-5 | A | 563.57 | 940.7 | 53.8 | 1088.8 | 3583.87 |
| photos-5 | B | 147.78 | 417.6 | 15.8 | 1074.1 | 3561.47 |
| photos-10 | A | 999.41 | 1265 | 88 | 1089.3 | 3559.15 |
| photos-10 | B | 141.1 | 381.7 | 16.8 | 1076.1 | 3270.5 |

Fetch wall is first worker request to last completed response, including the controlled server/DevTools transport. Download + File transport also includes queueing, runtime messaging, chunks and hash/File construction. File-preparation values are accumulated operation durations and can overlap. These columns are **not additive**. Source DOM discovery is a small pre-click query; the complete detached inspector timings are below.

## Detached EDGE inspector (50 measured samples after five warm-ups)

| Gallery size | Median ms | p95 ms | Max ms |
| ---: | ---: | ---: | ---: |
| 1 | 0.1 | 0.3 | 1.1 |
| 5 | 0.2 | 0.3 | 1.4 |
| 10 | 0.2 | 0.4 | 1.6 |
| 15 | 0.3 | 0.4 | 0.4 |
| 23 | 0.3 | 0.6 | 1.4 |

These microbenchmarks include scoped identity/gallery extraction from an inert DOM and synthetic runtime metadata. They exclude live Fotorama initialization, source rendering and networking.

## Recovery (five samples each)

| Scenario | Median ms | Max ms |
| --- | ---: | ---: |
| source-close-during-download | 6.6 | 170.4 |
| slow-cdn | 41.2 | 42.4 |
| network-retry | 301.2 | 302.7 |
| abort | 0.1 | 0.1 |
| invalid-url | 0 | 0.1 |

The source-close test simulates the background tab-removal event during an authorized pending download. The partial uploader test runs five times and submits 15 then only one identified missing file: fourteen successful photos remain accepted, and repeated failure remains 14/15. Inert/generated assets are not evidence of real CDN or MyAuto server behavior.

## Memory after final build workload

| Baseline tabs | Initial summed Chrome RSS MiB | After trial 1 | After trial 5 | Source heap after trial 1 / 5 MiB | Worker heap after trial 1 / 5 MiB |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 573.46 | 665.13 | 812 | 1.84 / 7.16 | 0.86 / 0.97 |
| 5 | 838.98 | 994.25 | 1060.78 | 1.84 / 7.12 | 0.87 / 0.99 |
| 10 | 1174.16 | 1273.17 | 1349.99 | 1.84 / 7.12 | 0.87 / 0.98 |
| 20 | 1840.77 | 1951.51 | 2044.11 | 1.83 / 7.12 | 0.88 / 0.99 |
| 30 | 2500.49 | 2616.71 | 2715.15 | 1.83 / 7.12 | 0.94 / 1.05 |

RSS is the sum of isolated Chrome process RSS and can double-count shared pages. It is not private physical allocation or a proof of a leak. JS heap samples follow forced GC. Default source-heap growth requires the diagnostic controls below; five trials are not a long-session memory guarantee. Peak downloads reported in raw records are the run-wide high-water mark (at most four in these sequential transfer tests), not per-vehicle parallelism.

## Memory controls

| Control | Source heap after trial 1 / 5 MiB | Worker heap after trial 1 / 5 MiB |
| --- | ---: | ---: |
| Console cleared, BFCache default | 1.84 / 7.15 | 0.86 / 0.94 |
| Console cleared, BFCache disabled in test profile only | 1.84 / 1.85 | 0.9 / 0.98 |

Clearing console entries did not remove the source-heap growth. With only BFCache disabled in the isolated diagnostic browser, source heap/documents stayed approximately stable. This supports retained navigation documents as the cause of the observed source-heap pattern, rather than proving retained photo buffers. No extension/browser production setting was changed. RSS still includes browser image caches/pools; a longer authenticated soak remains unverified.

## Reproduction

`AUTO_EDGE_BENCHMARK_LABEL=after node apps/extension/scripts/benchmark-edge.mjs`

`AUTO_EDGE_GALLERY_SPEED=1 npm run test -w @auto-importer/parsers`

Raw numerical records and logs are in `before/`, `after/`, `gallery-recovery.json`, and the two memory control logs. No credentials, VINs, signed photo URLs or authenticated HTML are included. No p95 is fabricated for five-sample network groups. No actual JPEG/EXIF orientation or live MyAuto acceptance is certified by generated PNG fixtures.
