# Transfer optimization and verification

## Measured comparison

Three sequential baseline and three sequential optimized runs were recorded on 2026-11-12 using the same sanitized BMW M5 Touring Wagon (vehicle A), same installed Chrome executable, isolated profiles and real unpacked MV3 extension APIs. Each run also verifies independent vehicle B. External DNS is blocked; the form, option IDs and gallery acknowledgments are fixtures. Each worker image response has an identical **120 ms controlled delay** and uses a small 128 px PNG. These are **fixture benchmarks, not live authenticated Manheim/MyAuto measurements or production-photo throughput claims**.

The baseline was instrumented before optimization. Each sample uses `performance.now()`; total starts immediately before clicking confirmation and ends when final verified state is saved/read. The harness polls at about 100 ms. Source extraction includes DOM parsing, unit conversions and messaging. Normalization measures the Georgian form plan/description. Browser substages overlap and must not be added as a total. Baseline fieldVerification covered dropdown settling only; the optimized counter additionally covers text/choice checks, so that counter is not a comparable before/after metric. It remains available in raw data for diagnosis.

Primary vehicle A medians:

| Measurement | Before | After |
|---|---:|---:|
| Total confirmation → verified saved result | 5.976 s | 3.854 s |
| Dropdown discovery (cold context) | 0.856 s | 0.869 s |
| Dropdown selection/settling | 0.545 s | 0.367 s |
| Form filling (inclusive) | 2.364 s | 1.595 s |
| Photo preparation/download/IPC | 2.133 s | 0.753 s |
| Photo upload/gallery confirmation | 1.079 s | 1.078 s |
| Photo preparation + upload | 3.213 s | 1.833 s |
| Final form validation | 10.7 ms | 0.4 ms |

Total elapsed time decreased **35.51%** (`(before-after)/before`). Cold discovery did not become faster in this fixture; extra context checks preserve correctness. No warm-cache speedup percentage is claimed. The principal measured gains are bounded photo concurrency and removing unconditional form pauses. Gallery settling remains intentionally unchanged. Source-extraction, normalization and matching timings and every A/B sample are retained in [tests/performance-results.json](tests/performance-results.json).

Run current measurements after building with `AUTO_BENCHMARK=optimized node apps/extension/scripts/verify-transfer.mjs`. To compare versions, run the same harness against each corresponding build; the baseline label is a report label, not a switch that reinstates legacy code. Do not relabel the optimized build as baseline.

## What changed

The previous client prepared images one at a time, and the worker held a whole-job lock during network downloads. Each prepared image also opened numerous IndexedDB transactions to recount every photo. Text/choice writes waited an unconditional 100 ms, and final validation regenerated the complete description/form plan.

Photo preparation now uses at most **three workers**, with a worker-wide network limit of three across transfers. Per-image locks deduplicate in-flight requests; per-job locks still serialize quota checks, cache writes and progress updates. URLs are deduplicated in source order, cached bytes are reused, SHA-256/chunk checks remain, and result files retain source order. IndexedDB count/range operations avoid unrelated transfer scans and repeated per-photo recounts. The existing uploader still hands all prepared Files over once and confirms actual gallery/count completion; it does not retry ambiguous uploads.

Form writes remain sequential because live dependencies beyond manufacturer → model are unverified. Pure transformations are batched in one reusable plan; CPU work is not wrapped in artificial concurrent promises. Short MutationObserver/state checks replace unconditional input pauses, while dependent controls and final verification still wait. No critical identifier is fuzzily matched.

## Discovery, matching and caching

`discoverDropdownOptions` and selection share the existing owned-control traversal. It supports descendants, `aria-controls`, `aria-owns`, labeled portals, conservative unlinked portal discovery, search, asynchronous readiness and virtual scrolling. Inspection returns visible labels, available attribute/native values, disabled state and completeness of the observed range, and closes the owned menu without selecting an option. Hidden/unrelated options remain excluded. IDs from attributes are metadata; only actual accepted form values confirm a selection.

The existing centralized `optionRank` is used by custom and native controls: normalized exact labels first, verified aliases/translations, verified numeric-unit equivalence, then supported custom Model entry. There are no arbitrary brand/model substring or fuzzy fallbacks. Original manufacturer/model/trim and dedicated VIN handling remain unchanged; VIN sanitization stays at description boundaries.

The in-memory option cache stores **data only**, not elements. Keys include website/path context, DOM form/control identities, declared form-version hash, field, locale and other selected dropdown values. Including all other selections is conservative because no complete live dependency graph is available. It may invalidate more often than necessary, rather than assume independence. Parent/locale/form-version changes and replacement controls cause misses; entries expire after two minutes and are bounded to 64 contexts/1000 options each. VIN-shaped labels and unsafe metadata are excluded. Cached labels/scroll offsets are hints: every click uses fresh nodes and the selected label/value is reverified. Cached IDs are never written blindly. This intentionally cannot promise zero-cost cold discovery or authoritative enumeration of a remote search-only catalog.

## Field-only recovery and UI

Field results classify temporary unavailability/verification failures separately from missing values, protected fields, manual fields and unresolved mappings. Only temporary failures receive a retry action. The destination claims the **existing** job and retries only those fields in dependency order; successful fields are reverified but not reopened. Source extraction, tab creation, photo preparation and upload are not repeated. Unsupported full models remain unresolved. Final description privacy checks also run after retry. Photos already verified remain verified.

The existing light Shadow DOM UI now shows Georgian activity, completed/unfilled/manual-review counts, verified photo counts, elapsed time and the retry action. Publication remains manual. Stage timings contain only a transfer UUID, allowlisted stage and duration; option caches/logs contain no VIN, authentication/session data or raw HTML.

## Tests and limits

`tests/optimization.browser.ts` covers inspection/disabled options, data-only caching, live-versus-cached IDs, manufacturer dependency, locale, form version, replacement controls, TTL, explicit invalidation, VIN exclusion, duplicate concurrent photo requests, a maximum of three downloads, ordered Files, and fuel-only recovery with no new tab/downloads. Existing exact-name, translation, unit, SPA, privacy, upload/gallery and A/B isolation regressions remain in the suite.

`AUTO_RETRY_TEST=1 node apps/extension/scripts/verify-transfer.mjs` drives the real Summary retry button in the unpacked extension against controlled fixture pages. It verifies successful fields are not reopened, no listing is created, no photo download occurs, and all 15 verified uploaded photos survive the fuel-only retry for both vehicles.

Authenticated live MyAuto verification was not performed, respecting the user's prior choice. Current real portal markup, server IDs/search/virtualization semantics and gallery acknowledgment remain subject to live confirmation. Missing semantic/verified ownership is reported rather than replaced with guessed site selectors. Upload timing here measures fixture acknowledgments, not real server publication.

## Changed files for this optimization

- `packages/shared/src/index.ts`
- `packages/parsers/src/dropdownCache.ts` (new)
- `packages/parsers/src/dropdownDom.ts`
- `packages/parsers/src/dropdownDiagnostics.ts`
- `packages/parsers/src/dropdowns.ts`
- `packages/parsers/src/modelField.ts`
- `packages/parsers/src/myauto.ts`
- `packages/parsers/tests/optimization.browser.ts` (new)
- `packages/parsers/tests/workflow.browser.ts`
- `packages/parsers/tests/performance-results.json` (new)
- `packages/parsers/PERFORMANCE.md` (new)
- `packages/parsers/README.md`
- `apps/extension/src/services/diagnostics.ts`
- `apps/extension/src/background/transfers.ts`
- `apps/extension/src/background/index.ts`
- `apps/extension/src/photos/client.ts`
- `apps/extension/src/photos/store.ts`
- `apps/extension/src/myauto/transfer.ts`
- `apps/extension/src/myauto/index.tsx`
- `apps/extension/src/myauto/Summary.tsx`
- `apps/extension/src/components/TransferProgress.tsx`
- `apps/extension/scripts/verify-transfer.mjs`

No Admin, source parser, translation dictionary, brand asset, launcher positioning, permission or publishing logic changes were made.

## Final validation results

Passed `npm run typecheck -w @auto-importer/parsers`, extension TypeScript checks via `npm run build:extension`, extension ESLint, explicit parser/shared/test ESLint, the complete parser/workflow regression suite, 19 built-UI fixtures, three optimized A/B benchmark runs and the real MV3 Summary fuel-only retry test for both vehicles. The retry test preserved all 15 verified gallery photos and the existing destination tabs. `dist/manifest.json`, popup/worker/content assets and original icon/logo assets were generated and validated. `git diff --check` passed. The live-site limitations above still apply.
