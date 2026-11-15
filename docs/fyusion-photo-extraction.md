# Fyusion photo extraction

## Cause and scope

The previous photo URL validator admitted only `i.fyuse.com` and `images.cdn.manheim.com`, and rejected `size` query parameters. Therefore the newly described `images--cdn.manheim24.com/...jpg?size=w300h210` format was discarded even if the gallery had 23 images. The previous generic gallery scan also skipped `svfy_thumb` images and did not use numeric `Image N` ordering. The new dedicated extractor reads the user-confirmed numbered tip contract instead.

The original 23-image failing snapshot was not available in the accessible attachments/downloads. The older available DOCX documents contain a different Fyuse gallery. `fyusion-contract-23.html` is explicitly a **synthetic contract fixture**, based on the selectors/host/count supplied in the request. It is not represented as a sanitized copy of the missing failing snapshot.

## Changes

- `packages/parsers/src/fyusion.ts`: selects a single visible real Fyusion container within the already validated selected vehicle root. Skips skeletons and unrelated containers. Reads `.svfy_tip img[src]` only for numeric `tip="Image N"`; reads the All counter; sorts numerically, rejects placeholder/logo/icon paths, deduplicates and selects the first 15 valid originals.
- `packages/parsers/src/photoUrls.ts`: shared URL safety/identity helpers moved without breaking the parser's public exports. Adds the exact CDN hostname; strips the confirmed `size` transform using `URL.searchParams.delete`, preserves other previously allowed rendering parameters, retains HTTPS/host/type/authentication-query protections and legacy resolution preference. No arbitrary host guessing or authentication bypass.
- `packages/parsers/src/manheim24.ts`: dedicated gallery takes priority over unrelated/old structured photo fallback. Incomplete numbered galleries publish no prefetched photo list, so the receiver requests bounded source readiness instead of freezing a one-photo list. Maintains gallery count separately from selected photo count. Legacy structured images and existing Fyuse/CDN sources remain. Legacy Fyuse album paths are checked against `fyuseUid` when independently supplied.
- `apps/extension/src/content/photos.ts`: MutationObserver waits for source selection/gallery readiness, including temporarily absent/hidden details, changed `src`, `tip`, counter and visibility. Deadline remains six seconds. A nonempty safe partial list may be returned at the deadline; an empty/stale list fails. Identity mismatches or hash/history navigation abort the old request. First-zero extraction waits for the correct gallery instead of ending immediately.
- `apps/extension/src/background/transfers.ts`: preserves the source gallery count separately from the selected transfer limit during delayed refresh.
- `apps/extension/manifest.config.ts`: explicit HTTPS permission for `images--cdn.manheim24.com` (the existing Manheim24 wildcard already covered subdomains).
- `packages/parsers/tests/fyusion.browser.ts`, `tests/fixtures/fyusion-contract-23.html`, `tests/workflow.browser.ts`: extraction, order, normalization, lazy readiness, SPA identity, host variants and separated binary/upload-stage tests.

Gallery ownership is remembered per document and selected identity. Previously observed photo identities cannot silently reappear under a different vehicle, even with changed thumbnail/quality transforms; fresh same-container content can be accepted. If the extension first observes an already-stale DOM and no independent media identifier exists, DOM alone cannot prove ownership; this remains a live-verification limitation rather than an invented VIN-to-image mapping.

Existing one-click navigation, authorized background downloads, IndexedDB/base64/SHA/File transport, post-text-upload order and remote MyAuto gallery confirmation remain in place. No text/price/location changes, new dependencies, Admin changes or automatic publication.

## Separate results

Local browser contract test (mocked network and MyAuto completion):

| Stage | Result |
|---|---:|
| All counter / unique valid photo candidates | 23 / 23 |
| Original ordered URLs selected | 15 |
| Images downloaded through existing download function | 15 |
| Hash-verified Files reconstructed at MyAuto receiver | 15 |
| Images confirmed by existing adapter in simulated MyAuto gallery | 15 |

The gallery fixture is intentionally in reverse DOM order, with a duplicate, unrelated page image, logo and placeholder. Assertions require URLs 1–15 in numeric order, no `size` query, preserved quality/format and no unrelated images. Additional tests cover all three authorized photo hosts and delayed first-photo/SPA stale-content cases. Existing regression tests continue covering denied/expired responses, conversion/messaging failures, partial upload and no-duplicate behavior.

These counts do **not** establish 15 real downloads or 15 live MyAuto uploads. Authenticated CDN access and actual MyAuto server completion were not tested. Use existing checkpoint/report logs to distinguish selected URLs, background downloads, reconstructed Files and confirmed gallery images for a real transfer. Signed/unknown URL formats still fail safely rather than being persisted or bypassed. No implementation can guarantee success when access has expired or an external upload service is unavailable.

## Validation

Passed `npm run build:extension`, parser TypeScript, extension ESLint, the full parser browser test suite and `git diff --check`. The built manifest includes the CDN permission and popup assets are generated. Tests use isolated Chrome with fixtures/mocked network; no authenticated live upload was performed.
