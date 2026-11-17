# Conditional Manheim Site support and multi-photo extraction

## Evidence and limits

The supplied `Untitled document (1) (1).docx` contains an actual OneSearch vehicle detail component, scoped StockWave JSON and a Fyusion gallery. The sanitized `packages/parsers/tests/fixtures/search-manheim.html` preserves those component contracts, 98 sequenced photo records, counters and labeled specifications. Image paths are replaced with fixture identities. No original session scripts, account data or signed URLs are committed. The snapshot alone does not establish its original top-level browser URL; support for Site therefore means recognizing these verified component contracts on the exact HTTPS Site host, not inventing selectors for unobserved layouts.

A regression was reproduced before the fix: reducing the snapshot's structured `images` array to its first item while retaining the complete DOM gallery returned one photo. The parser preferred any nonempty structured array over the complete scoped gallery. It now uses the more complete source, preserving its original order, URL normalization and identity deduplication. This proves an extraction defect, not that every reported production failure had this cause.

## Changes

- Exact `https://site.manheim.com/*` registration; safe domain-wide initialization with no launcher, extraction messaging or downloads until one known selected vehicle component passes identity validation.
- Dedicated Site adapter reuses the supplied OneSearch and legacy detail component contracts. Informational/login pages cannot become vehicles because they contain a CDN image or gallery-like element.
- Current VIN, listing key, structured identity and visible detail fields must agree. Source names/model designations remain unchanged; unknown fields remain missing. No auction selling prices; existing description-skipping, VIN privacy, negotiable price, location and manual publication policies remain.
- Dedicated scoped Fyusion helper supports hidden gallery descendants and the same previously owned gallery node moved into a fullscreen portal. An unrelated modal or document image is never a fallback.
- Up to 15 distinct originals, in numeric/structured sequence. Real smaller galleries retain their actual count. Existing bounded MutationObserver waits handle asynchronous gallery population; no scrolling, synthetic gallery clicks, global API overrides or private endpoints.
- SPA invalidation prevents previously observed photo identities/portal nodes being reused for a different listing. Disposing Site activation removes its parser listener and launcher.
- Known photo lists retain existing parallel preparation. Empty-gallery refresh runs after text autofill: the existing `PHOTO_REFRESH` operation holds the job lock also needed by form progress, so waiting on a missing gallery concurrently could otherwise delay text progress. An isolated MV3 late-gallery test exposed this timing dependency.
- Existing IndexedDB/binary chunk transport, three-download concurrency, retry ledgers and confirmed-gallery upload adapter are retained. The adapter now checks that the actual FileList accepted the expected count before dispatching events. File dispatch alone still does not mean uploaded.
- Developer reports distinguish discovered, selected, downloaded, received Files, delivered Files and verified gallery count. Logs contain no raw identity, signed URL or session data.

## Validation scope

Parser/browser regressions cover both supplied layouts, arbitrary Site paths with verified details, invalid locations pages, 98-to-15 selection, initially one structured photo, delayed/hidden/portal galleries, legitimate one/five-photo galleries, duplicates, missing galleries, SPA identity changes and watcher cleanup. Existing download retry, partial upload, binary integrity and A/B isolation tests also run.

The built extension is tested in isolated Chrome using real MV3 messaging, storage, IndexedDB, File/DataTransfer and React/RHF-controlled form fixtures. Source/destination responses and remote gallery acknowledgments are intercepted. This is not authenticated live Manheim/MyAuto testing.

For live verification: reload the unpacked build, refresh both source and destination tabs, open a genuine selected Site vehicle, and click the launcher once. Check the transfer's developer photo report for discovered/selected/downloaded/delivered/verified counts. Compare the visible MyAuto gallery and inspect any first failing checkpoint; do not publish until manually reviewed. Test another vehicle through SPA navigation and confirm no previous photos appear. `/en/locations.html` must show no launcher or photo request. Unknown Site layouts need a sanitized snapshot before adding selectors.

## Supported fixture fields

The OneSearch snapshot supplies original manufacturer, complete model, independently structured trim, year, VIN/listing ID, mileage/unit, engine displacement and cylinders, fuel, transmission, drivetrain, body style, door count, exterior/interior colors, interior material and equipment. Steering position and a verified condition are absent and remain manual. MyAuto still uses the existing exact-option/custom-field policy: an unavailable model option is unresolved rather than silently shortened. Source prices are excluded from the Site normalized payload and never autofilled.

## Files in this follow-up

- Parsing/contracts: `packages/parsers/src/{siteManheim,manheimSiteGallery,searchManheim,fyusion,validation}.ts`, `packages/parsers/package.json`, `packages/shared/src/index.ts`.
- Source activation: `apps/extension/src/services/sourceRegistry.ts`, `apps/extension/src/content/{siteManheim,sourceAdapters,manheim,index}.ts[x]`, `apps/extension/manifest.config.ts` (removes the previous Site exclusion).
- Transfer diagnostics/timing: `apps/extension/src/background/transfers.ts`, `apps/extension/src/myauto/transfer.ts`, `apps/extension/src/photos/{checkpoints,upload}.ts`.
- Validation: `packages/parsers/tests/{siteManheim,searchManheim,sourceEligibility,photoCheckpoints,workflow}.browser.ts`, `packages/parsers/tests/run-browser.mjs`, `apps/extension/scripts/verify-transfer.mjs`.
- Documentation: this file and the supersession note in `docs/vehicle-source-eligibility.md`.

There were already unrelated/uncommitted changes in the workspace before this follow-up; the list above describes this follow-up, not the entire Git working tree. `apps/admin` is untouched.


## Results for this change

- TypeScript (parsers and extension build), extension ESLint and `git diff --check`: passed.
- Full sanitized parser/workflow browser suite: passed, including source eligibility, Site gallery/lifecycle cases, binary transport, retries, upload confirmation and field isolation.
- `npm run build:extension`: passed; `apps/extension/dist/manifest.json` and popup/content assets generated.
- Built UI Chrome suite: 24 fixtures passed.
- Built Site MV3 test: vehicle A/B each completed 15-photo simulated gallery confirmation, including delayed gallery recovery, real messaging/storage, independent transfers and React/RHF field persistence.
- Existing Manheim24 built MV3 regression with the same delayed-gallery, specification, location and passive-MyAuto checks: passed for vehicles A/B.
- Photo counts: supplied sanitized OneSearch snapshot discovered 98, selected 15; shared receiver test downloaded 15, reconstructed/delivered 15 Files and verified 15 simulated remote gallery previews. Built Site integration uses the confirmed legacy layout and also verifies 15 simulated previews per transfer. Authenticated live MyAuto acceptance: unverified.
