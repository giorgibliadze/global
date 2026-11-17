# Manheim Search source

## Scope

Adds an independent `ManheimSearch` adapter for HTTPS `search.manheim.com`, integrated with the existing launcher, prefetch, background transfer, normalization and MyAuto receiver. The supplied `site.manheim.com` public homepage is not a vehicle-detail source. Existing website detection/launcher coverage for Manheim domains remains.

Valid detail routes use `#/details/<VIN>/<sale-type>` on `/results` or `/`. Homepage/results routes without a detail hash cannot import, even if old detail DOM remains mounted. The source registry matches exact search hostname, not substrings.

## Primary evidence and sanitized fixture

The parser was developed from `/Users/macbook/Downloads/Untitled document (1) (1).docx` (the supplied HTML snapshot). No document scripts were executed. Its selected root is `[data-test-id="vehicle-details-view-container"]`; the expected fixture identity is VIN `SALKZ9F90RA229948`, listing key `OVE.NVAA.467124903`. Production code contains neither value.

`tests/fixtures/search-manheim.html` preserves the actual source's relevant DOM attributes, selected structured JSON shape, vehicle values, photo sequence and gallery structure. Page scripts, account/session/contact metadata, private notes and auction price fields were removed. CDN filenames were replaced consistently with synthetic names; host/extension/query structure and ordering were retained. Vehicle seller comments were inspected: the supplied text contains vehicle specifications, no email/HTTP links/telephone contact block. VIN is retained in the explicitly requested identity fixture; generated/public description text is sanitized.

## Extraction from this fixture

| Field | Extracted evidence/result |
|---|---|
| Original title | 2024 Land Rover Range Rover SV |
| Manufacturer | Land Rover |
| Complete model designation | Range Rover SV |
| Structured base/catalog model | Range Rover |
| Independently verified trim | SV |
| Model year | 2024 |
| VIN / listing key | Exact root, visible VIN and structured identity agree with the supplied values |
| Mileage | 10,005 miles → 16,101.48672 km; original value/unit preserved |
| Engine | 4.4 L → 4,400 cm³; structured engine description 4.4L V8 Twin Turbocharged |
| Cylinders | 8, confirmed by labeled seller specification and structured V8 description |
| Transmission | Labeled `Gear Box: 8-Speed Automatic`; normalized Automatic, never assumed Tiptronic |
| Fuel | Labeled Premium Unleaded Gasoline → Gasoline; original retained |
| Drivetrain | Explicit structured AWD |
| Exterior | Original seller label Santorini Black Metallic retained; structured base color Black used for existing form matching |
| Interior | Original Ebony Semi-Aniline Leather retained; structured base color Black and verified Leather material used for matching |
| Body | SUV |
| Doors | 4 |
| Equipment | Structured installed-equipment primary descriptions; no account/pricing metadata |
| Seller remarks | Vehicle comments retained as private, VIN-sanitized source evidence |

Steering position, condition and condition grade are unavailable/unspecified, so remain unresolved. No country/model-based steering inference or damage-history inference. Auction price is not put in the normalized selling-price fields; existing negotiable selection and empty/user-entered price behavior remain.

The existing exact-model policy remains: `Range Rover SV` is not silently shortened to `Range Rover` in MyAuto. An exact/custom supported model control is used; otherwise the model remains manual and independent fields/photos continue.

A concise Georgian description helper uses existing translations, VIN sanitization and whole-line character fitting (default 1,000 characters, below the saved MyAuto form's 4,000-character limit). Existing policy still removes description from the transfer and leaves MyAuto description untouched. This task does not re-enable description autofill.

## Photos and speed

A dedicated source photo reader prefers the selected listing's `images[].largeUrl`, ordered by numeric `sequence` when supplied consistently; otherwise it preserves the structured array's order. It falls back to the scoped real Fyusion gallery, then the independently supplied main image. Shared URL normalization removes confirmed `size` thumbnail transforms, preserves permitted parameters, deduplicates photo identity and limits selection to 15. Signed/unknown URLs and unsupported hosts still fail safely.

Route VIN, root `data-vin`, root `data-key`, structured VIN/ID and original title must agree. A per-document photo-identity ledger prevents previously observed photos being silently rebound to another listing. Prefetch keys include source, tab and listing ID. Hash/history changes and relevant DOM/identity mutations invalidate the previous preparation; a bounded MutationObserver waits for complete selected data or gallery readiness. No search-result-card scraping or unscoped page-image collection.

Search-only photo preparation starts concurrently with text filling using the existing three-worker download/chunk mechanism. Actual file submission still starts after text/location operations settle. Existing source timing is unchanged. No new binary messaging protocol, file adapter, photo endpoint or upload mechanism.

## Validation results

Passed:

- `npm run build:extension` (includes extension TypeScript).
- `npm run typecheck -w @auto-importer/parsers`.
- `npm run lint -w @auto-importer/extension`.
- `npm run test -w @auto-importer/parsers` — new search source tests and the full existing browser regression suite.
- `git diff --check`.

The isolated Chrome tests cover source/route detection, exact supplied VIN/listing identity, fields, original title, descriptions, 98-photo sequence/order, high-resolution normalization/deduplication, real gallery fallback, empty/delayed gallery, warm-cache reuse, repeated-click deduplication, SPA A/B isolation and rejection of results-page imports with stale detail DOM. Existing Manheim24/photo/MyAuto tests remain passing.

Separate counts in the new fixture workflow:

| Stage | Result |
|---|---:|
| Valid source photo candidates | 98 |
| Original ordered URLs selected | 15 |
| Mocked downloads through the existing background manager | 15 |
| Real Files delivered to the existing MyAuto adapter | 15 |
| Simulated MyAuto gallery confirmations | 15 |

These are local Chrome tests with real File/DataTransfer/IndexedDB and simulated network/MyAuto completion. They are **not authenticated live Manheim/MyAuto upload success**. Live session access, CDN response behavior, actual MyAuto controls/model availability and upload server completion still require verification. No claim that 15 extracted URLs guarantees 15 real uploads.

## Permissions

No new permissions were needed. Existing HTTPS Manheim wildcard host access/content-script matches already cover `search.manheim.com`; existing `https://images.cdn.manheim.com/*` permission covers the supplied photos. Existing permissions and CRXJS/MV3 configuration are preserved.

## Files created

- `packages/parsers/src/searchManheim.ts`: independent source parsing/photos/route/description helpers.
- `apps/extension/src/services/sourceRegistry.ts`: supported vehicle-parser registry.
- `apps/extension/src/content/sourceAdapters.ts`: adapter contract/default/search bindings.
- `apps/extension/src/content/searchManheim.ts`: search-specific registration.
- `packages/parsers/tests/searchManheim.browser.ts`.
- `packages/parsers/tests/fixtures/search-manheim.html`.
- This document.

## Existing files minimally modified

- `packages/shared/src/index.ts`, `packages/parsers/src/validation.ts`, `packages/parsers/package.json`: new typed source and additive parser subpath export.
- `content/preparation.ts`, `content/manheim.ts`, `content/photos.ts`: optional adapter hooks, with unchanged Manheim24 defaults.
- `content/index.tsx`, `content/FloatingLauncher.tsx`, `popup/PopupContent.tsx`: registry selection and existing UI eligibility.
- `background/preparation.ts`, `background/transfers.ts`: source-specific cache namespace and validated registry admission.
- `myauto/transfer.ts`: concurrent preparation only for the new source; shared form filling/upload order preserved.
- Test runner import map/allowlist and workflow registration.

No Admin, dependency installation, original Manheim24 parser rewrite, field mapping rewrite, branding/CSS/icon change or automatic publication.

## Live verification

Reload the unpacked extension and the source page. Log in normally; open a vehicle detail on `search.manheim.com`, wait for its source preparation and click the existing launcher once. In MyAuto, verify dedicated VIN, mileage, exact model/manual warning, negotiable price, untouched description and gallery images. Compare photo checkpoint/report counts by transfer ID, without sharing VINs, signed URLs, headers or cookies. Repeat after switching vehicles via hash navigation; returning to results must not create a transfer. Final review/publication remains manual.
