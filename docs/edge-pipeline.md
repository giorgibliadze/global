# Additive EDGE Pipeline integration

> Follow-up: [EDGE photo reliability and mapping audit](edge-photo-audit.md) documents subsequent extraction/mapping fixes and remaining download-policy limitations.

## Actual snapshot evidence

The two supplied DOCX files contain vehicle-detail HTML rooted at `#vdp.vuetify`. Both provide matching `h1.description` titles, an `.overview .general-section .vin` identity, `.overview .odometer`, and `.section.details .field > label` / `span` values. The canonical `meta[property="og:url"]` binds the document to the exact HTTPS `www.edgepipeline.com/components/vehicle/detail/{32-hex-id}` route. Informational pages, mismatching canonical IDs, conflicting titles and stale same-root identities cannot activate extraction.

There are no independently labeled manufacturer/model fields in these snapshots. EDGE identity extraction uses the year prefix and an exact known manufacturer name, then removes only the title suffix independently confirmed by the drivetrain/body/cylinder/fuel labels. It does not split by arbitrary word positions or decode specifications from a VIN. An independently labeled trim suffix is retained separately. Thus BMW stays `2-Series`; Tesla stays `Cybertruck` with trim `CyberBeast`. Original titles are retained unchanged.

| Field | BMW fixture | Tesla fixture |
| --- | --- | --- |
| Year | 2026 | 2024 |
| Manufacturer | BMW | Tesla |
| Model | 2-Series | Cybertruck |
| Trim | Unspecified | CyberBeast |
| Fuel | Gasoline | Electric |
| Transmission | `?`, left missing | Automatic |
| Drive train | AWD | AWD |
| Odometer | 9614 mi | 30026 mi |
| Cylinders | 6 | Missing / not applicable |
| Engine volume | Missing | Missing / not applicable |
| Body / doors | Coupe / 2 | Pickup Truck / 4 |
| Exterior | BLUE | BLACK |
| Interior / material | TAN / Cloth | Unspecified / Cloth |
| Equipment | Source option list | Source option list |

The user explicitly confirmed these unqualified source odometers are miles; no country-based unit inference or conversion was introduced. Explicit `km` is retained as km. Battery capacity/range and steering position are not supplied in confirmed labeled fields and are not invented. Auction prices, auction descriptions, account data and condition-history assumptions are not copied.

## Gallery and image quality

EDGE has its own extractor. It reads `.gallery .fotorama__nav__frame--thumb` in original order, scoped stage/print images for verified resolution upgrades, and a read-only runtime bridge. It never scans global page images or falls back to `og:image`.

- BMW: **47 thumbnail slots**, 16 populated thumbnail URLs and one additional distinct stage URL (17 distinct observed image identities across the snapshot). The first **15 ordered distinct photos** are selected. Two selected images expose existing 1600×1200 URLs; the other 13 expose only 100×75 thumbnail URLs in the static snapshot. Missing originals are never synthesized.
- Tesla: `.gallery.no-thumbs`, one initialized stage image; **one** distinct vehicle photo selected, with the observed 1600×1200 URL. No duplicates are added to reach 15.

An EDGE-only MAIN-world content script reads the documented Fotorama `jQuery(gallery).data('fotorama').data` API. It copies only validated `full`, `img`, `thumb` fields plus vehicle identity/count into a scoped inert JSON node. At most 15 records are retained. The isolated adapter validates the identity, gives existing `full`/`img` URLs priority and retains runtime order. It neither calls gallery navigation methods nor reads arbitrary page state, tokens or cookies. API contract: [Fotorama official API](https://fotorama.io/docs/4/api/).

Only `file3.autolookout.net`, actually present in both snapshots, is added to the URL/permission registry. Protocol-relative URLs become HTTPS; explicit HTTP/HTTPS remain as provided. Credentials, queries, fragments, unsupported file types, placeholders and unrelated hosts are rejected. The observed encoded resolution segment is removed only for identity comparison/ranking, never rewritten in a download URL. Distinct asset paths remain distinct.

Primary images alone do not complete an uninitialized multi-image gallery. Existing bounded gallery waits handle delayed slots. A source-specific ownership guard prevents previous-listing photos from being reused after SPA changes. The watcher is deduplicated, handles route/DOM changes and BFCache cleanup, and uses no polling. Existing shared preparation, transfer UUIDs, tab/document ownership, concurrency, downloads, chunk/hash transport and upload verification are reused unchanged.

## Validation

Passed TypeScript, extension ESLint, `npm run build:extension`, the full parser/browser regression suite and EDGE-only tests. Existing test expectations were not changed. Tests cover supplied gasoline/EV fixtures; 1/5/15/23 runtime photos; late/lazy thumbnails; metadata and full/thumbnail priority; similar distinct CDN paths; initialization; missing gallery; VIN/listing association; SPA changes; duplicate watcher cleanup; accepted HTTP/HTTPS; unsafe URL rejection; and shared MyAuto delivery.

| Stage | Gasoline fixture | Electric fixture |
| --- | --- | --- |
| Gallery count in supplied snapshot | 47 | 1 |
| URLs selected from supplied snapshot | 15 | 1 |
| Downloaded in isolated fixture workflow | 15 | 1 |
| Files delivered to existing uploader | 15 | 1 |
| Images confirmed by simulated MyAuto | 15 | 1 |
| Authenticated live MyAuto confirmation | Not tested | Not tested |

The built unpacked extension also passed an isolated **30-real-Chrome-page-target** test containing mixed existing-source/MyAuto fixtures, then EDGE gasoline/EV transfers. Real Chrome MV3 APIs, storage, messages, MAIN/isolated-world bridge and React-controlled fixture fields were exercised. Fotorama runtime records, images, MyAuto options and server acceptance were simulated. The optional previously downloaded public RHF bundle was unavailable, so this run used the repository's React-state fixture, not a fresh live RHF bundle.

No photo request started from inactive tabs before the transfer. Two different vehicles created independent destinations; repeated clicks did not create duplicate transfers. Mileage persisted through React rerenders, descriptions remained untouched, no auction price was copied, and publication stayed manual. Missing optional EV fields did not prevent the one-photo transfer.

Existing Manheim24, Search24, regular-Manheim, mileage, session and uploader regressions passed. The repository has ADESA hostname detection coverage but no ADESA vehicle-parser fixture; no new claim of ADESA end-to-end validation is made.

## Files

New production files:

- `packages/parsers/src/edge/index.ts`
- `packages/parsers/src/edge/gallery.ts`
- `packages/parsers/src/edge/urls.ts`
- `apps/extension/src/content/edge.ts`
- `apps/extension/src/content/edgeGalleryBridge.ts`

Narrow registration/configuration changes:

- `packages/shared/src/index.ts`: additive `EdgePipeline` source type.
- `packages/parsers/src/validation.ts`: source allowlist entry.
- `packages/parsers/src/photoUrls.ts`: dispatch only the newly verified EDGE CDN to its dedicated URL validator; prior hosts retain their existing behavior.
- `packages/parsers/package.json`: EDGE exports.
- `apps/extension/src/services/sourceRegistry.ts`: independent adapter registration and exact detail-route gate, appended after existing sources.
- `apps/extension/src/content/sourceAdapters.ts`: EDGE adapter.
- `apps/extension/src/content/index.tsx`: EDGE watcher/parser/unchanged launcher registration.
- `apps/extension/manifest.config.ts`: exact CDN permissions and EDGE-only MAIN bridge entry.

Tests/report:

- `packages/parsers/tests/fixtures/edge-{gasoline,electric}.html`: sanitized snapshots with synthetic VINs, listing IDs and CDN asset IDs; no scripts, account/session data or prices.
- `packages/parsers/tests/edge.browser.ts`, `edge.runner.ts`: new tests.
- `packages/parsers/tests/workflow.browser.ts`, `run-browser.mjs`: registration/import map.
- `packages/parsers/tests/reactForm.fixture.ts`: test controls now honor existing configurable fuel/cylinder/engine/body/mileage-unit values; default fixture behavior preserved.
- `apps/extension/scripts/verify-transfer.mjs`: additive EDGE fixture mode and optional synthetic Fotorama API mode; existing source modes retained.
- This report.

No changes to existing source parsers/galleries, MyAuto production mapping/uploader, transfer lifecycle, concurrency settings, mileage implementation, EV handling, launcher design or Admin.

## Live verification still needed

Reload the unpacked extension and refresh an authenticated EDGE detail page. Confirm the same vehicle is selected and inspect safe photo checkpoints for selected/downloaded/delivered/gallery-confirmed counts. Check both supplied vehicle types, exact MyAuto model availability, original miles and actual uploaded photo quality. If Fotorama runtime metadata is unavailable, the static BMW fallback contains 13 low-resolution thumbnails among the selected 15; this is an explicit limitation, not claimed full-resolution success. Additional CDN hosts/signed-URL formats require actual evidence before enabling them. Final listing review and publication remain manual.
