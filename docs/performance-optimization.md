# Transfer performance and platform isolation

This follow-up profiles the existing implementation and makes targeted changes. It does not implement unverified ADESA/Edge Pipeline parsers, change MyAuto field mappings, publish listings, touch authentication/session storage, or modify `apps/admin`.

## Implemented changes

1. **Independent parsers.** Manheim Site's confirmed legacy layout now has its own `siteManheimLegacy.ts` implementation. It no longer calls Manheim24 parsing/selection/photo functions. Search imports exact unit arithmetic from neutral `units.ts`, not from Manheim24. A dependency-graph test enforces both directions. This deliberately retains separate platform contracts instead of consolidating them.
2. **Independent gallery state.** Fyusion exposes a factory for its verified common numbered-gallery contract. Manheim24, Manheim Search, Manheim Site and Site's legacy branch have independent extractor/ownership instances. Modern Site/Search photo-owner maps are separated by source. Shared utilities contain exact arithmetic, safe URL handling and the identical confirmed Fyusion algorithm; no cross-platform selector fallback is added. Prepared cache keys already include tab, platform and listing/VIN; regression tests cover concurrent source tabs and independent invalidation.
3. **Metadata readiness fast path.** A complete current-vehicle structured gallery of at least 15 valid distinct images bypasses thumbnail DOM discovery. Partial/empty metadata still uses the dedicated scoped gallery and bounded observer. This preserves the previous one-image regression fix. Lazy thumbnails are not a readiness requirement when complete original metadata is available.
4. **Destination overlap.** Known photo lists download concurrently with text autofill for all implemented adapters, including Manheim24. Actual file submission still follows text/dependent dropdown operations. Missing galleries refresh only after text, preserving the demonstrated job-lock timing safeguard. Navigation does not wait for downloading photos.
5. **Bounded downloads.** Shared destination scheduling uses four workers and the background enforces four global download slots across concurrent transfers. The controlled 3/4/6 test demonstrates the scheduling tradeoff. Four is the bounded throughput/memory compromise: at most 60 MiB of active 15-MiB response bodies versus 90 MiB for six, before other transport/prepared-file memory. Total transfer limits and per-file limits are unchanged. The selected setting is fixture-tested, not a claim about a live CDN's rate limits or fastest live setting.
6. **Less copying.** Streaming download chunks are retained directly until the necessary bounded final byte assembly, removing a redundant per-chunk Uint8Array copy. Original bytes, integrity hashes, MIME checks, MV3 JSON-compatible chunking and retry ledgers remain intact. Large signed/authentication-bearing URLs are still rejected by the existing policy.
7. **Event-driven gallery checks.** Named MyAuto gallery confirmation waits on scoped DOM mutations, image load/error events and uploader replacement boundaries instead of scanning the page every 75 ms. Existing quiet/stability windows, deadlines, actual remote-card/count checks, safe partial retries and cancellation remain. The legacy unconfirmed gallery adapter remains unchanged.
8. **Neutral destination imports.** Background/download/validation import photo and identity utilities through explicit neutral exports, avoiding a dependency on the Manheim24 parser.
9. **Diagnostics.** Photo checkpoints/reports include platform and a transfer-salted pseudonymous vehicle ID. Source preparation logs readiness/extraction/payload duration. Destination reports separate manufacturer/model/year/other dropdown times, binary messaging and file preparation. All measurements use `performance.now()` for spans; wall time remains for expiry/navigation timestamps. No VIN, signed URL, credential or session content is logged. Concurrent substage sums overlap and must not be added to total elapsed time.

## Measurement and evidence

Before editing production code, the current built extension was preserved outside the repository. `performance.browser.ts` measured the actual sanitized source adapters; `benchmark-transfer.mjs` runs both builds against the same test harness, sequential isolated Chrome profiles and controlled 120-ms image responses. See the companion JSON and generated tables for measured numbers.

The microbenchmark runs 5 warmups and 30 operations per source stage. The first source baseline was collected before optimizations. Storage/scheduler measurements were collected separately before any store changes (the store itself was retained because its measured cost was small). Timings below a browser timer tick are not meaningful improvements. Source extraction includes normalization and gallery selection; gallery discovery is separately re-invoked for profiling, so those costs are not additive.

The end-to-end benchmark runs three samples of two independent vehicles per platform/version using real unpacked MV3 APIs, storage, IndexedDB, File/DataTransfer and React/RHF-controlled forms. The Site E2E fixture uses its confirmed legacy layout; the Site source microbenchmark uses the supplied modern 98-photo component. Search uses its actual modern sanitized snapshot. These are different fixture vehicles/layouts; compare before/after within each platform, not absolute platform speed rankings. Network images are small fixture PNGs, and remote gallery acknowledgments are simulated. These numbers cannot predict full-resolution live upload throughput.

The existing destination form's React commit/blur mechanisms, manufacturer→model dependency, exact model matching, user-edit protection, VIN-only dedicated field, description skipping, negotiable price, location and final manual publication behavior remain unchanged. Dropdown normalization/discovery already existed and was retained rather than rewritten.

ADESA and Edge Pipeline are recognized auction hosts with the existing placeholder interface; no verified extraction/photo adapter exists in this checkout. Their extraction/download/autofill/E2E measurements are **unavailable**, and no new selectors or timing claims are invented. Their prior recognition/placeholder behavior is regression-tested.

## Reproduce

- Preserve a baseline `apps/extension/dist` before editing production code.
- `AUTO_PERF_ONLY=1 npm run test -w @auto-importer/parsers` runs source/storage/scheduler measurements.
- `AUTO_BASELINE_DIST=/path/to/baseline AUTO_RHF_MODULE=/path/to/public-rhf-fixture.js node apps/extension/scripts/benchmark-transfer.mjs` compares both builds. The RHF body is public test-only handler code; do not use authenticated HTML/scripts as a module.
- `node packages/parsers/tests/verify-platform-isolation.mjs` verifies dependency isolation.
- `npm run test -w @auto-importer/parsers`, parser typecheck, extension lint and `npm run build:extension` validate regressions.

## Limits and live verification

No authenticated auction/MyAuto session was used. Real source readiness, full-resolution download latency, authentication expiry, live 429 behavior, true upload-server acceptance, different machines and unknown source layouts remain live verification items. The successful fixture runs verify up to 15 selected/downloaded/delivered/confirmed simulated photos; they do not claim actual MyAuto publication or acceptance. Existing transient failure, partial retry, SPA, repeated-click, field persistence, ordinary browsing and context-reload tests remain part of validation.

## Measured results (milliseconds)

E2E rows use medians across six samples per platform/version (three independent profiles × two vehicles). They include fixture navigation/server delays. Percentages are calculated within the same platform; these are small controlled samples, not live performance guarantees.

### Manheim24

| Stage | Before | After | Change |
|---|---:|---:|---:|
| Vehicle extraction (source microbenchmark) | 1.00 | 0.91 | 8.7% faster |
| Gallery discovery (source microbenchmark) | 0.37 | 0.35 | 5.5% faster |
| Photo preparation: downloads + transport | 833.25 | 710.15 | 14.8% faster |
| MyAuto form autofill | 130.85 | 211.55 | 61.7% slower |
| MyAuto photo upload + confirmation | 857.10 | 777.50 | 9.3% faster |
| Total click → persisted completion | 2850.68 | 2469.59 | 13.4% faster |

Form latency did not improve in this sample. Overlap can contend for browser/IPC resources; existing React commit and verification behavior was retained. Overall transfer latency improved, as measured separately.

### ManheimSite

| Stage | Before | After | Change |
|---|---:|---:|---:|
| Vehicle extraction (source microbenchmark) | 5.33 | 3.45 | 35.2% faster |
| Gallery discovery (source microbenchmark) | 2.36 | 0.82 | 65.1% faster |
| Photo preparation: downloads + transport | 897.25 | 674.80 | 24.8% faster |
| MyAuto form autofill | 184.80 | 191.60 | 3.7% slower |
| MyAuto photo upload + confirmation | 859.00 | 777.30 | 9.5% faster |
| Total click → persisted completion | 2742.00 | 2354.55 | 14.1% faster |

Form latency did not improve in this sample. Overlap can contend for browser/IPC resources; existing React commit and verification behavior was retained. Overall transfer latency improved, as measured separately.

### ManheimSearch

| Stage | Before | After | Change |
|---|---:|---:|---:|
| Vehicle extraction (source microbenchmark) | 4.50 | 2.51 | 44.2% faster |
| Gallery discovery (source microbenchmark) | 2.39 | 0.83 | 65.3% faster |
| Photo preparation: downloads + transport | 853.30 | 662.50 | 22.4% faster |
| MyAuto form autofill | 189.50 | 195.30 | 3.1% slower |
| MyAuto photo upload + confirmation | 858.90 | 778.65 | 9.3% faster |
| Total click → persisted completion | 2687.64 | 2370.39 | 11.8% faster |

Form latency did not improve in this sample. Overlap can contend for browser/IPC resources; existing React commit and verification behavior was retained. Overall transfer latency improved, as measured separately.

### ADESA and Edge Pipeline

All extraction/gallery/download/autofill/upload/E2E cells: **unavailable**. No implemented extraction adapter or verified fixture in this checkout. Existing host recognition and placeholder behavior are retained.

### Photo counts

Manheim24 source fixture: 26 discovered / 15 selected. Modern Site and Search fixture: 98 discovered / 15 selected. Site E2E uses the legacy fixture (26 discovered / 15 selected). Each of 36 before/after E2E samples downloaded 15 and verified 15 simulated remote gallery cards; the real FileList and single upload submission are asserted. Actual authenticated MyAuto acceptance: **not measured**.

### Remaining timing limitations

Source detection, readiness, normalization, payload cloning and cache reads are in `performance-source-results.json`. Manufacturer/model/year/other dropdown timings and binary messaging/file-conversion spans are newly instrumented in after samples; no matching before values exist, so a before/after claim for those individual substages is unavailable. The existing sourceExtraction E2E timer measures cache verification/IPC, not a new full source parse. Gallery verification is included in photoUpload; separate source/target/network subspans must not be summed. Real navigation/server-ready deadlines dominate these tiny-fixture totals and depend on the website/browser.

## Validation and modified files

Passed: parser TypeScript, extension ESLint, dependency isolation, full browser regression suite, and `npm run build:extension`. The before/after harness completes 36 independent vehicle samples with actual MV3 APIs and simulated sites. UI/passive/lazy-gallery smoke checks are recorded separately below.

- Parsers: `packages/parsers/src/{siteManheimLegacy,siteManheim,searchManheim,manheim24,manheimSiteGallery,fyusion,units,validation,stagedMyauto}.ts`; explicit neutral exports in `packages/parsers/package.json`.
- Shared contracts/configuration: `packages/shared/src/index.ts`.
- Source/destination: `apps/extension/src/content/{preparation,manheim}.ts`, `apps/extension/src/background/transfers.ts`, `apps/extension/src/myauto/transfer.ts`, `apps/extension/src/services/diagnostics.ts`.
- Photos: `apps/extension/src/photos/{activity,galleryUpload,client,checkpoints,download}.ts`.
- Validation: `apps/extension/scripts/{benchmark-transfer,verify-transfer}.mjs`, `packages/parsers/tests/{performance,platformIsolation,workflow,receiver,optimization}.browser.ts`, `packages/parsers/tests/{run-browser,verify-platform-isolation}.mjs`, `packages/parsers/tests/{reactForm,myautoContract}.fixture.ts`.
- Reports: this document, `performance-source-results.json` and `performance-transfer-results.json`.

Earlier unrelated uncommitted workspace changes are preserved. No changes under `apps/admin`.

Final smoke checks: Site delayed-gallery recovery, passive MyAuto pages, informational locations gate, two isolated vehicles, field persistence and photo confirmation passed in the built extension. All 24 built UI Chrome fixtures passed.
