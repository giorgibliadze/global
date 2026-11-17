# Verified vehicle pages, not Manheim informational pages

> Site follow-up: the blanket Site exclusion described below has been superseded by [conditional verified-component support](site-manheim-support.md). Informational pages remain passive; only a validated selected vehicle activates the launcher.

## Actual findings

The public `https://site.manheim.com/en/locations.html` page is a location finder, not a vehicle detail page. Its page images must never be import candidates.

The confirmed defect was source classification/UI eligibility: `detectWebsite` treated every `manheim.com` subdomain as an auction; the content entry mounted a launcher for every such page, and the popup enabled its button based on `kind === 'auction'`. This produced false support on the locations page.

The current backend already excluded `site.manheim.com` from its vehicle-source registry. No production `document.images`, Open Graph image or unscoped source-page image fallback was found. Both parsers required a selected vehicle identity before reading scoped photos. Therefore the reported one-image transfer from this informational page was **not reproduced in the current code**, and its precise runtime/installed-build cause is not claimed. The fix addresses the demonstrated UI misclassification and adds stronger route/identity gates; it does not invent a global fallback bug or remove legitimate one-photo listings.

## Changes

- Manheim informational/unregistered hosts are marked unsupported. The auction content script explicitly excludes `*://site.manheim.com/*`, so the locations page receives no launcher, observer, parser or source transfer code.
- Search route recognition is a small shared helper, used by the parser and URL eligibility checks. `search.manheim.com/results#/details/<VIN>/<sale-type>` (and the supported root hash variant) is eligible; homepage/search results are not.
- Background begin/review/start rejects ineligible URLs before sending an extraction request or opening MyAuto. Prefetch invalidation/status remains allowed on registered source hosts so SPA cache cleanup still works.
- The popup makes one read-only `VEHICLE_STATUS` request only for an eligible registered URL. The content script verifies the current selected vehicle using the existing adapter's identity selector/SPA generation guard. The response contains only source ID and an availability boolean, no VIN/URLs/payload. Missing/stale/unsupported responses fail closed.
- The popup's real import action requires that verified response. For implemented parser sources, the floating action is disabled until preparation has validated the vehicle; navigation/invalidation disables it until the new vehicle is ready. Existing ADESA/Edge Pipeline recognition and placeholder behavior are unchanged.
- Existing Manheim24 detail parsing and Search's structured/Fyusion gallery readers remain in use. There is no global image fallback. A `mainImage` is allowed only inside the independently verified selected listing's structured data; this is not a page banner/metadata fallback and preserves legitimate one-photo vehicles.

## Photos/speed

No downloader/uploader, concurrency, binary transport, quality normalization or field adapter was changed. Up to 15 distinct photos retain their existing original sequence. Empty/incomplete galleries use the existing bounded MutationObserver stage (six-second deadline), rechecking current VIN/listing/route on mutations. An empty gallery never substitutes unrelated page images. Existing per-vehicle photo ledgers and source cache invalidation prevent stale listing reuse.

MyAuto remains passive during ordinary browsing; description skipping, negotiable price, location, user edits and manual-only publication are unchanged. No Admin changes or dependencies.

## Regression evidence

Passed:

- `npm run build:extension` — extension TypeScript and generated MV3 assets.
- `npm run typecheck -w @auto-importer/parsers`.
- `npm run lint -w @auto-importer/extension`.
- `npm run test -w @auto-importer/parsers` — new source eligibility regressions and the complete existing source/photo/autofill suite.
- Built UI Chrome fixtures: 24 cases, including the informational host, disabled unverified detail popup, enabled verified detail popup, preserved branding/layout and other auction placeholders.
- Built unpacked MV3 Chrome test with `AUTO_SOURCE_GATES_TEST=1 AUTO_PASSIVE_TEST=1 AUTO_PREFETCH_TEST=1 AUTO_LAZY_PHOTOS_TEST=1 AUTO_REACT_TEST=1 AUTO_RHF_MODULE=/tmp/auto-current-myauto/rhf-body.js AUTO_SPEC_TEST=1 AUTO_LOCATION_TEST=1`.
- `git diff --check`.

The negative fixture intentionally puts an allowed-CDN banner and a fake numbered gallery on a page without vehicle identity. Both source parsers reject it. Popup detection makes no content request on locations/results; a VIN-shaped URL alone cannot enable import. Direct background start on locations/results makes zero extraction requests and opens zero tabs. Missing real-gallery photos plus an unrelated document image fail instead of substituting that image; later real gallery content resolves the photo stage.

The built MV3 test serves a locations-page fixture with a CDN image: no launcher, no transfer record and zero background image downloads. It also verifies the actual source-status handshake, automatic prefetch, delayed-gallery restoration and two independent one-click transfers. Each has 15 URLs/downloaded Files and **15/15 simulated gallery confirmations**, with manual publication intact. The fixture workflow uses real Chrome APIs/React/RHF/File transport but simulated websites and network/server completion.

**No authenticated live MyAuto photo upload was tested or claimed.** The one-image incident itself was not reproduced. A failing transfer's stage logs and the actually installed extension build are still needed to explain that specific observation.

## Files changed for this task

- `apps/extension/manifest.config.ts`: informational-host exclusion; existing matches/permissions retained.
- `apps/extension/src/services/website.ts`, `sourceRegistry.ts`, `browser.ts`: classification, URL eligibility and verified popup status.
- `apps/extension/src/content/manheim.ts`, `preparation.ts`, `sourceAdapters.ts`: read-only selection availability/status contract.
- `apps/extension/src/content/FloatingLauncher.tsx`, `popup/PopupContent.tsx`: disable real transfer until verified.
- `apps/extension/src/background/transfers.ts`: URL gate before begin/review/start.
- `packages/shared/src/index.ts`, `packages/parsers/src/searchManheim.ts`: share the existing Search route matcher without changing its accepted routes.
- New `packages/parsers/tests/sourceEligibility.browser.ts`; workflow/fixture-server registration.
- `apps/extension/scripts/verify-ui.mjs`, `verify-transfer.mjs`: negative-page/verified-status and delayed-gallery compatibility tests.
- This document.

## Chrome check

Reload the extension from the newly built `apps/extension/dist`, then refresh source pages once. On `/en/locations.html`, no launcher should exist and the popup transfer button must be disabled. Open an actual authenticated `search.manheim.com` vehicle detail; the action becomes available after identity verification. Search results without a selected vehicle remain disabled. Verify actual downloaded/received/confirmed photo stages separately and review MyAuto before publishing manually.
