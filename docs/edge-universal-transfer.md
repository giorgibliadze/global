# EDGE complete-gallery transfer: implementation and evidence

This supersedes the earlier EDGE-specific 15-photo selection behavior. The two supplied DOCX files were inspected again as structural evidence, not production vehicle-specific rules. Authenticated live MyAuto acceptance has NOT been tested.

## Proven blockers and remaining uncertainty

Real CDN probes previously demonstrated resized images redirecting from `file3.autolookout.net` to `dxbrs3zlwqu4z.cloudfront.net`. The default downloader rejects redirects; the final CDN also required its exact MV3 host permission. The existing EDGE-only wrapper retains the verified fix. It validates actual image bytes and browser decoding, preserves original JPEG/PNG/WebP, and converts only browser-decodable unsupported transport formats such as GIF/AVIF/BMP to lossless PNG.

Complete-gallery transfer was additionally blocked by 15-photo limits in runtime collection, gallery selection, vehicle/state validation and File preparation. These have source-aware EDGE handling. Other integrations retain their original 15-photo policy.

The saved MyAuto form has a `photo-video-label` heading saying Photo / Video, while the numeric photo counter is a separate element. EDGE capacity discovery now reads the actual container counter, rather than assuming the heading contains it. Both named server-acknowledged gallery cards and the existing native remote-preview uploader path are supported, with explicit ownership of previous batches. This prevents introducing a zero-upload regression on the actual saved form layout. It does not establish that this was the historical cause of the user's failed session.

The user's authenticated zero-photo incident itself remains unobserved. Real downloads and binary delivery work in the tests below; an actual MyAuto network rejection cannot be excluded without that session's upload response/gallery state.

## Dynamic discovery

The extractor prioritizes validated Fotorama API records from a narrow MV3 MAIN-world bridge, original direct gallery anchors/images, thumbnail metadata, stage/print images and download links. OG metadata is eligible only when its identity is independently present in the selected vehicle gallery. No global document image fallback is used. Video posters and unrelated graphics are excluded.

All source references in a complete gallery are retained; no EDGE `slice(0, 15)` remains. Resolution variants are deduplicated by the verified transform segment while retaining the full photo path/filename. Candidate large variants must actually download and decode; failed candidates fall back safely. HTTP-only original URLs retain a bounded fallback. Unauthorized/expired/invalid responses are not counted as photos.

A fresh bounded gallery resolution happens before EDGE uploads even when prefetch already contained photos. Thus a gallery that grows after text prefetch is not frozen at the old count. Incomplete galleries wait for mutations up to the existing six-second deadline and then report exactly which declared photos remain unavailable. The source snapshots cannot reveal URLs that were never saved. No undocumented endpoint or unsafe automated gallery navigation was invented.

A 1000-record metadata safety boundary is retained, explicitly reported when a declared gallery exceeds it; valid vehicle text still transfers. Automatic approval review rejected replacing practical resource limits with Number.MAX_SAFE_INTEGER because of resource-exhaustion risk. That rejected change was reverted. Therefore unrestricted galleries beyond this boundary are NOT claimed as supported. A bounded paged metadata design would be needed for that extension.

## Destination capacity and backpressure

EDGE reads the current numeric counter from the MyAuto uploader. The saved actual form advertises 15 slots and a 15 MB per-file maximum. Synthetic 30/60-slot forms validate adaptation when the destination really advertises those limits; this is not evidence that production MyAuto accepts 60 photos.

At most four photos per transfer are downloaded/reconstructed/submitted at a time under the unchanged global concurrency limit. The existing uploader confirms each batch before the next. Already accepted cards/URLs belong to the transfer; user/foreign cards or unresolved queues stop further submission. The adapter never clears site images. Individual failed downloads are skipped; later source photos can fill free destination slots. Once capacity is filled, unused source count is explicitly reported rather than silently truncated or downloaded unnecessarily.

Temporary binary entries are released after each settled batch through a tab/document-bound EDGE-only message. Prepared indexes persist separately from live cache count, allowing worker-manager recreation without resetting progress. Existing chunk size, base64 transport, SHA verification, IndexedDB, cancellation and per-file/global limits remain in place. No Blob/File is sent as a JSON runtime payload. Metadata lists are separate from binary buffers; successful 60-photo tests observed at most four live cached photos. This bounds active compressed payloads to four existing 15 MB files per transfer, not the entire gallery; it is not a claim about total Chrome RSS or decoded pixel memory.

## Results

| Scenario | Source information | Downloaded | Delivered | Confirmed destination |
| --- | --- | ---: | ---: | --- |
| Actual BMW snapshot/CDN, 30 tabs | 47 declared; 17 distinct saved identities | 15 | 15 | 15 in simulated MyAuto |
| Actual Tesla snapshot/CDN, same session | 1 declared/observed | 1 | 1 | 1 in simulated MyAuto |
| Synthetic complete gallery / 30-slot form | 30 unique | 30 | 30 | 30 simulated |
| Synthetic complete gallery / 60-slot form | 60 unique, mixed JPEG/PNG/WebP | 60 | 60 | 60 simulated |
| Synthetic 30-photo gallery / 15-slot form | 30 unique | 15 | 15 | 15 simulated; limit reported |
| Same, first download permanently fails | 30 unique | 15 valid from 16 attempts | 15 | 15 simulated; failed photo skipped and next source used |

For the actual saved BMW DOM, 30 declared photos have no saved URLs. Of the 17 observed identities, two were not downloaded after the detected 15-slot form filled. Selected real downloads had no image errors. Validated large variants were 1595–1600px, JPEG/PNG, 152463–1172269 bytes. Tesla's actual JPEG was 1600px wide and 295059 bytes. No extra photos were fabricated.

Actual-CDN fixture timings with 30 tabs: BMW photo download phase 2.15s / whole fixture trial 10.46s (including bounded waiting for unsaved gallery data); Tesla download 0.18s / trial 2.17s. Upload timings are simulated server-card acknowledgments and do not represent production upload speed. See `edge-universal-evidence/real-cdn-30-tabs.txt`.

## Tests

Passed: extension TypeScript/Vite build, extension ESLint, parser TypeScript, complete existing regression suite, EDGE gallery/recovery suite and real-CDN MV3 tests. Cases include 1/5/8/15/23/30/47/60 source metadata counts; original gallery links; no thumbnails; lazy/incomplete galleries; exact source ownership; duplicate resolution variants; mixed formats; decoded GIF conversion; corrupt/empty/HTML/unsupported responses; auth/permanent errors; bounded transient retries; canceled transfers; partial/all-failed downloads; partial uploads; both actual heading/counter and named-card MyAuto structures; destination limits; cache backpressure; worker-manager recreation mid-transfer; multiple independent vehicles; and 30 open Chrome fixture tabs. Non-EDGE oversized payload validation remains unchanged.

The 1001-declared-frame safety case verifies that photos are stopped with a clear limitation rather than rejecting the normalized vehicle text. It does NOT test unrestricted discovery above the retained metadata boundary.

## Modified implementation files

- `packages/parsers/src/edge/gallery.ts`, `runtime.ts`, `urls.ts`
- `packages/parsers/src/validation.ts`, `photoUrls.ts`
- `packages/shared/src/index.ts`
- `apps/extension/src/background/edgeDownloads.ts`, `edgeImage.ts`, `index.ts`, `transfers.ts`, `transferState.ts`
- `apps/extension/src/content/photos.ts`
- `apps/extension/src/myauto/transfer.ts` (EDGE photo branch only)
- `apps/extension/src/photos/edgeTransfer.ts`, `client.ts`, `store.ts`, `upload.ts`, `galleryUpload.ts`, `checkpoints.ts`
- `packages/parsers/tests/edge.browser.ts`, `edge.speed.browser.ts`, `reactForm.fixture.ts`
- `apps/extension/scripts/verify-transfer.mjs`
- This report and sanitized textual test evidence.

The existing manifest CDN permission and source bridge remain in place. No Admin, vehicle text mapping, mileage, EV mapping, UI design or global concurrency change. Shared uploader/client/state additions are opt-in/source-aware and tested against existing integrations.

## Repeat and live acceptance

```sh
npm run build:extension
npm run lint -w @auto-importer/extension
npm run typecheck -w @auto-importer/parsers
npm test -w @auto-importer/parsers
AUTO_EDGE_TEST=1 npm test -w @auto-importer/parsers
AUTO_EDGE_GALLERY_SPEED=1 npm test -w @auto-importer/parsers
AUTO_EDGE_TEST=1 AUTO_EDGE_REAL_CDN=1 AUTO_EDGE_REAL_DOM_ONLY=1 AUTO_STRESS_TABS=30 AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

The final command reads original DOCX photo references into memory and uses an empty Chrome profile. Real CDN photos are downloaded; source identifiers/vehicle data and MyAuto server are simulated. It opens a controlled blank destination before test interception/navigation and never posts fixture data to real MyAuto.

Live acceptance still required: reload the unpacked extension, refresh source and destination pages, grant the exact CDN permission if Chrome requests it, and try the ordinary one-click transfer for a complete multi-photo gallery and a one-photo gallery. Inspect actual MyAuto gallery cards and upload request responses. Record discovered/downloaded/received/submitted/accepted counts by transfer ID without VINs or signed URLs. Review/publish manually. No live accepted-photo number or universal live success is asserted.
