# EDGE photo transfer: source-only recovery and validation

## Evidence and limits

The previous real-CDN probe demonstrated a specific blocker: resized `file3.autolookout.net` images redirect to `dxbrs3zlwqu4z.cloudfront.net`; `redirect: error` rejects them, and following without the exact final-host permission triggers CORS rejection. The existing EDGE-only redirect wrapper and exact manifest permission are retained. Direct main JPEGs were already downloadable. This does not prove that every reported zero-photo incident has that cause.

A second reproducible source-side failure was found in the gallery code: without Fotorama API/thumbnail initialization, verified vehicle stage/print images were discarded even after the bounded readiness deadline. The regression now keeps these legitimate partial results available to the existing timeout path. They are never marked as a complete 47-photo gallery. No unrelated page image fallback was added.

The user's current authenticated zero-upload event was not observed. Neither live MyAuto rejection nor authenticated Fotorama API availability can be proven from saved HTML. Live acceptance remains outstanding.

## Implemented changes

- `apps/extension/src/background/edgeDownloads.ts`: source-only bounded candidate chain. Test an observed 1600x1200 resize instruction for the same exact asset identity; accept only successful, supported image bytes that actually decode. Fall back to the supplied URL / observed 100x75 resize instruction when appropriate. HTTPS is first; an explicitly supplied HTTP URL may be the last fallback if its HTTPS endpoint fails. Never invent a new host or asset filename. Stop alternates on 401/403 or rejected redirects. Close decoded bitmaps and rejected response streams. Preserve JPEG/PNG/WebP, hashes, metadata order, per-image failure isolation, original error causes and global concurrency. The shared downloader still rejects redirects for other sources.
- `packages/parsers/src/edge/gallery.ts`: add actual `a.download-pic[href]`; allow OG only when its photo identity is independently present in the current gallery. Retain verified partial stage/print/API photos through bounded readiness while initial parsing still waits for a complete first-15 set. Preserve selected-vehicle ownership and stale-gallery checks.
- `packages/parsers/src/edge/diagnostics.ts`: deduplicated development gallery stage/count records, including declared total vs selected count.
- `apps/extension/src/photos/edgeDiagnostics.ts` and two conditional calls in `checkpoints.ts`: EDGE-only development aliases of existing delivery/upload/gallery checkpoints. No shared uploader or receiver control-flow change. MESSAGE_SENT is explicitly receiver-confirmed, not a new sender acknowledgment. No raw exceptions, VINs, paths, tokens or signed URLs are emitted. Existing production checkpoints remain available.
- `packages/parsers/tests/edge.browser.ts`: valid decoded image fixtures now exercise the EDGE wrapper through the existing transfer manager, chunk transport, File conversion and uploader. Add partial/all-failed downloads, corrupt bytes, PNG, misleading response MIME, thumbnail/full fallback, HTTP-only original, authentication rejection, download-link-only gallery and bounded stage-only recovery.
- `apps/extension/scripts/verify-transfer.mjs`: optional real-CDN DOM-only mode, safe destination timeout diagnostics, actual File decode/hash checks and timings. Real-CDN mode now opens a real blank destination tab and installs interception before navigating once to the simulated MyAuto page. This test-only gate avoids an initial CDP navigation racing receiver claim and prevents sending fixture data to actual MyAuto. Production tab creation is unchanged.

No changes to Admin, manufacturer/model mapping, mileage, EV mapping, negotiable price, skipped description, UI, shared uploader or global concurrency.

## Actual photos with simulated destination

| Test | Declared gallery | Selected | Downloaded | Delivered Files | Simulated gallery | Live MyAuto |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| BMW, DOM only | 47 | 15 | 15 | 15 | 15 | Not tested |
| Tesla, DOM only | 1 | 1 | 1 | 1 | 1 | Not tested |
| BMW, 30 open mixed fixture tabs | 47 | 15 | 15 | 15 | 15 | Not tested |
| Tesla, same 30-tab session | 1 | 1 | 1 | 1 | 1 | Not tested |

BMW snapshot has approximately 17 distinct observed identities, not 47 loaded originals. The selected first 15 remained distinct and ordered. All successful large candidates were verified against the actual CDN: widths 1595–1600px, 152463–1172269 bytes, JPEG and PNG. Tesla's one JPEG is 1600px wide / 295059 bytes. No photo conversion was needed. Original source URLs remain in memory only, read from the supplied DOCX files; no authenticated HTML or assets were added to the repository.

Recorded 30-tab sample: BMW download phase 3.06s, simulated upload/gallery acknowledgment 1.08s, overall fixture trial 5.10s. Tesla download 0.24s, simulated acknowledgment 1.07s, overall 2.91s. These are local test observations, not production upload performance guarantees. Messaging timing sums overlap and are not wall-clock duration.

See `v2-real-dom.txt`, `v2-real-30tabs.txt` and `v2-regressions.txt`.

## Failed test runs disclosed

Before the test-only navigation gate, one real-photo fixture run completed BMW then failed Tesla destination readiness. A 30-tab run timed out on Tesla; an attempted CDP ordering change then produced a blank simulated destination on BMW (`ready: complete`, `fixtureState: false`, zero mileage/file inputs). That ordering experiment was reverted. The controlled blank-tab gate subsequently completed both vehicles with 30 tabs. These failures are not claimed as a reproduction of the user's incident: the user's text fields fill, whereas the observed blank fixture had no form. No production uploader change was justified by them.

## Verification and remaining live steps

Build, lint, TypeScript and EDGE regression results are recorded alongside this report. The full existing workflow regression suite is also run. `dist/manifest.json` retains only the exact required CDN origin; no security flags, proxy, credential extraction, private endpoints or auto-publication were introduced.

To repeat the actual-CDN / simulated destination check:

```sh
npm run build:extension
AUTO_EDGE_TEST=1 npm test -w @auto-importer/parsers
AUTO_EDGE_TEST=1 AUTO_EDGE_REAL_CDN=1 AUTO_EDGE_REAL_DOM_ONLY=1 AUTO_STRESS_TABS=30 AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

The real-CDN test requires the original DOCX files in Downloads and installed Chrome. It uses an empty temporary profile and actual photo downloads; vehicle text/identifiers and MyAuto acceptance are simulated.

For live acceptance: reload the unpacked extension, allow the exact new CDN host if Chrome asks, refresh the EDGE vehicle tabs, and perform one-click transfer for each vehicle. Verify actual MyAuto gallery thumbnails (BMW up to 15; supplied Tesla exactly 1), then manual review. Do not publish automatically. If zero photos persist, inspect the destination and service worker `[Auto Importer photo report]` for the first failing transfer ID: selected/downloaded/received/submitted/verified counts and failure code. Missing observation: the actual authenticated MyAuto upload request and gallery response from the failed user transfer. No live accepted-photo count can be reported until that is observed.
