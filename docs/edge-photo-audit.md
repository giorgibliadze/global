# EDGE photo reliability and field-mapping audit

> Follow-up: [final photo reliability and measured speed tests](edge-final-photo-test.md) cover the declared-count guard, 140 before/after matrix transfers, quality checks and memory controls.

## Reproduced failures and their stage

These are proven code-level extraction defects. No failed authenticated transfer log or live Network trace was supplied, so they are not claimed to explain every observed live failure.

1. **Before download: runtime truncation before deduplication.** The MAIN-world bridge copied the first 15 Fotorama rows, then the isolated extractor deduplicated. A 17-frame regression with one repeated original produced only 14 unique photos in that prefix; gallery readiness required 15 and the normalized payload withheld its images. The collector now deduplicates the complete bounded array, upgrades verified variants and only then selects 15. Distinct filenames/asset paths remain distinct.
2. **Before download: incomplete runtime data masked complete DOM data.** An empty or one-record bridge response could override a ready multi-photo carousel. Only a sufficiently complete distinct runtime prefix now wins; otherwise the verified DOM order is retained. Runtime metadata still upgrades matching DOM identities.
3. **Before download: truthy invalid lazy attributes masked valid URLs.** `data-src || src` chose an invalid placeholder instead of the valid rendered URL. Both candidates are now independently validated. A valid lazy target takes precedence; verified resolution variants still upgrade the same photo.
4. **Readiness timing:** the shared source waits do not observe `data-src` attributes. The EDGE watcher now observes only relevant gallery `data-src` changes and publishes one inert scoped revision per mutation batch. Existing bounded waits wake on that DOM revision, without a shared change, polling, scrolling or fixed sleeps.
5. **Unordered stage fallback:** active/previous/next stage nodes do not prove original gallery order. An uninitialized multi-image gallery now exposes no photo array until ordered nav/runtime data appears. The supplied one-image `.gallery.no-thumbs` remains supported.

There was no reduction from 15 Files to one in the existing uploader in the fixture tests. It remains unchanged.

## Photo counts

| Stage | Supplied BMW HTML | Supplied Tesla HTML |
| --- | --- | --- |
| Gallery frames | 47 | 1 |
| Distinct observed image identities across nav/stage/print | 17 | 1 |
| Populated ordered thumbnail identities | 16 | No thumbnail strip |
| Selected URLs | 15 | 1 |
| Downloaded in isolated workflow | 15 | 1 |
| Files prepared/delivered | 15 | 1 |
| Confirmed by simulated destination gallery | 15 | 1 |
| Confirmed on authenticated live MyAuto | Not tested | Not tested |

Two of the BMW selection's URLs expose the observed 1600×1200 variant; the remaining 13 are 100×75 thumbnails in the static snapshot. No resolution paths are invented. On a running page the bridge prefers the existing documented `full`/`img` URLs. An explicit original URL without measurable dimensions is not downgraded to a measurable thumbnail. If the runtime originals are unavailable, static thumbnail quality remains a known limitation.

The source-only development diagnostic reports discovered/unique/selected counts, readiness, source mode and listing ID. It never logs VINs, photo URLs, credentials or arbitrary page data. Existing transfer-ID photo reports supply downloaded/prepared/submitted/accepted counts downstream. Production UI is unchanged.

## Download and upload audit

The existing authorized downloader is reused, with no global concurrency, transport, retry, authentication or upload changes.

EDGE URL tests exercise protocol-relative, explicit HTTP and HTTPS, distinct similar paths, known thumbnail/full identities and rejection of credentials/query-bearing/placeholder URLs. Transient HTTP 503 retries the failed image; HTTP 404 and 403 and a 200 HTML/non-image body fail once. No repeated text autofill or successful-photo restart was introduced.

The partial-upload fixture models all 15 queue IDs appearing, 14 becoming remote image cards and one failing. The uploader submits batches **15 then 1**, never resubmitting the successful 14; a second failure remains an honest **14/15 partial result**. All 15 distinct Files were delivered, not 16 distinct photos. This is simulated server behavior, not live MyAuto acceptance.

**Shared-policy limitation:** the downloader uses `redirect: 'error'`. An actual CDN redirect will therefore fail at download. Whether the user's failed CDN requests redirect is unproven without live Network evidence. That policy was not relaxed or changed because shared downloader/uploader changes are outside the permitted scope. Byte signatures are validated by the existing mechanism; full live image decoding/server acceptance was not independently verified.

## Text mapping findings and corrections

- Tesla `4 Door Pickup Truck` previously normalized only to `Pickup Truck`, absent from the shared body dictionary. EDGE now emits the verified canonical `Pickup`; the existing MyAuto mapping obtains `პიკაპი`. Original `raw.bodyStyle` remains unchanged.
- Independently labeled Manufacturer/Make, Model and Model Year/Year take precedence when supplied. These snapshots do not contain independent make/model fields, so their exact title fallback remains necessary. Its boundary now comes from labeled body/drivetrain metadata; missing fuel/cylinders/engine placeholders cannot stop the entire transfer.
- BMW remains BMW / `2-Series` / 2026, Gasoline, six cylinders, AWD, two doors and 9614 mi. `Transmission: ?` and `Displacement: --` remain absent; Automatic and engine capacity are not invented.
- Tesla remains Tesla / `Cybertruck` / `CyberBeast` / 2024, Electric, Automatic, AWD, four doors and 30026 mi. No combustion cylinders, engine volume, battery capacity or range are invented.
- Exterior BLUE/BLACK and supplied Cloth material are preserved. BMW interior TAN remains original `TAN`; no unverified TAN→Beige/Brown dropdown substitution was added. It is explicitly reported as manual selection.
- Placeholder cleaning covers empty, dash/question markers and explicit unavailable/unknown values. Equipment placeholders and exact duplicates are removed while original option names remain intact.
- Mileage remains in original miles; explicit km is also preserved without conversion. Shared mileage behavior is unchanged.

The existing Georgian description generator was audited with normalized EDGE objects. Tests verify Georgian fuel/body terms, one trim occurrence, no VIN, auction price, HTML artifacts, `undefined`, `null`, `--` or question placeholders. No shared generator edits were needed. **Description autofill stays disabled and the user's existing textarea stays untouched**, as required by the earlier explicit policy. The description audit is not a new public-description transfer feature.

## Validation

- `npm run build:extension`
- `npm run typecheck -w @auto-importer/parsers`
- `npm run lint -w @auto-importer/extension`
- `npm run test -w @auto-importer/parsers`: existing integration expectations unchanged.
- `AUTO_EDGE_TEST=1 npm run test -w @auto-importer/parsers`: focused final EDGE regressions.
- Built extension in isolated Chrome with synthetic duplicate Fotorama runtime frames: MAIN/isolated-world bridge, UUID payloads, real Chrome storage/messages/File delivery and gasoline/EV React fixture workflows passed. Websites, photo responses and MyAuto server acceptance were simulated.

The full regression run passed existing Manheim24/Search24, regular-Manheim, mileage, session and photo tests. ADESA remains covered by the existing hostname/detection tests; there is no supplied ADESA vehicle-parser fixture to claim live parser validation.

## Files changed in this follow-up

EDGE production files:

- `packages/parsers/src/edge/gallery.ts`
- `packages/parsers/src/edge/index.ts`
- `packages/parsers/src/edge/runtime.ts` (new bounded collector)
- `packages/parsers/src/edge/normalization.ts` (new source normalization)
- `packages/parsers/src/edge/diagnostics.ts` (new development-only counts)
- `apps/extension/src/content/edgeGalleryBridge.ts`
- `apps/extension/src/content/edge.ts`

Tests/minimal registration/report:

- `packages/parsers/package.json`: EDGE-runtime export only.
- `packages/parsers/tests/run-browser.mjs`: EDGE-runtime import-map entry only.
- `packages/parsers/tests/edge.browser.ts`: regressions and failure scenarios.
- `apps/extension/scripts/verify-transfer.mjs`: EDGE-only duplicate-runtime fixture mode.
- This report; follow-up link in `docs/edge-pipeline.md`.

The previous additive EDGE registration changes remain in the working tree; they were not rewritten in this follow-up. No edits to shared MyAuto mapping/uploader, shared downloads, mileage, concurrency, existing source parsers, authentication, popup/launcher design or Admin were made.

To identify any remaining live failure, inspect the same transfer's selected/downloaded/prepared/submitted/accepted counts and the first failing checkpoint. For a DOWNLOAD failure, observe HTTP status/redirect and actual image response in the authenticated browser. Do not share signed URLs, VINs, cookies or session tokens.
