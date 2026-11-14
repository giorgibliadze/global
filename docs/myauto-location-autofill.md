# MyAuto listing location autofill

## Behavior and priority

The popup and shared floating panel now have a compact Georgian “მდებარეობის პარამეტრები” section. Choose a durable default, clear it to use verified source evidence, or choose a location only for the next transfer. The one-transfer override is consumed on starting a transfer and stored on that transfer record; it is not reused for the next vehicle.

Priority is explicit override → durable default → verified source → manual. The preference lives in `chrome.storage.local`, outside temporary transfer/session cleanup. It is read at transfer creation, rather than frozen in a prefetched vehicle. Invalid preferences are rejected. A storage-read failure leaves location unresolved without blocking text/photos. Saving a preference briefly disables starting the transfer to prevent a race with the old value.

Location runs after existing automatic text/dropdown/mandatory specification operations and before photo preparation/upload. It is attempted once, with a bounded 900ms wait for an opened menu. There are no blind reopen/retry loops. Missing controls/options and unsupported mobile modal behavior produce a manual field result and do not stop photos. No listing is published.

## Source evidence

The original Manheim24 document contains `pickupLocationCountry`, `pickupLocationCity`, `auctionCountry` and `atAuction`. Only pickup country/city are treated as physical-location evidence. Auction country is usable only when the source explicitly confirms `atAuction: true`; auction country alone cannot establish vehicle location. No seller address, full pickup address, cookies, tokens or page script state is copied.

The sample's pickup country is US, independently of its auction country, so with no preference/override it resolves to აშშ. Supported aliases include the requested USA, Germany, Japan, South Korea, Canada, Dubai, France, Italy, Netherlands and Georgian cities. Matching normalizes case, spacing, hyphens and dots. Unknown countries remain unresolved rather than selecting “სხვა”. A recognized foreign country conflicting with a Georgian city remains unresolved. Country names are not interpreted as city names.

Generic United Kingdom/UK evidence is deliberately not equated with England without verification that MyAuto's ინგლისი option represents the whole UK. England itself and an explicit user choice of ინგლისი are supported.

Shipping is separate typed evidence (`verified`, `in-transit`, destination). Automatic “გზაში საქ.-სკენ” requires confirmed transit specifically to Georgia. Even a stored/default requested transit label is left unresolved without that confirmation. The supplied Manheim24 document does not expose a verified shipping-status source; no shipping selector or status is invented.

## Actual MyAuto contract

The supplied MyAuto DOM names the control `location.location`, with testids:

- `single-select-location.location`
- `single-select-trigger-location.location`
- `single-select-input-location.location`
- `single-select-value-location.location`

Its public bundle `main.f81b0e156752.js` renders the existing generic Controller dropdown with `name: "location.location"` and `options: appData.data.locations`. The generic component supplies inline named leaf/child options; a real option click commits `{id,title}`. Parent rows with children are nonselectable headers. The registration input remains empty even after a valid selection.

The existing dropdown adapter now accepts an explicit form namespace while keeping its default `primaryFeatures.*` behavior. Location uses the same actual menu/leaf/child handlers, exact Georgian label matching and live option IDs. No location IDs are hardcoded, inferred from list order or stored in preferences. The selected label/clear control is checked again after focus/rerender/photo processing. A preexisting MyAuto selection is protected, including when an explicit override/default requests something else. Final verification observes manual changes and does not restore the old location.

Settings labels come from the user's supplied option list. Availability is still checked in the actual rendered menu: a group heading or absent option is never clicked as a workaround. MyAuto's distinct mobile modal below 768px remains unverified and is left manual.

## Modified files

New:

- `packages/parsers/src/listingLocation.ts`: labels, aliases, source/default/override resolver.
- `packages/parsers/src/locationField.ts`: field descriptor, one selection attempt and read-only verification.
- `apps/extension/src/services/locationPreferences.ts`: validated durable preferences.
- `apps/extension/src/components/LocationPreferences.tsx`: default and one-transfer settings UI.
- `packages/parsers/tests/location.browser.ts`: mapping, evidence, storage and dropdown regressions.

Updated:

- `packages/shared/src/index.ts`, parser validation and Manheim24 extraction: typed location evidence and listing intent.
- `packages/parsers/package.json`: internal location subpath export; no dependency/install changes.
- `DropdownAdapter.ts`, `myautoContract.ts`, `myauto.ts`, `stagedMyauto.ts`: namespace support and location read verification.
- Background index/transfers and `extensionApi.ts`: preference messages/storage type and per-transfer intent.
- MyAuto transfer receiver: location between form operations and photos, with no automatic location repair.
- `ImportAction.tsx`, `TransferProgress.tsx`, `Summary.tsx`, shared `ui.css`: settings and Georgian result messages.
- Tests/harness: sanitized source fixture, RHF form fixture/types, browser import map, workflow/prefetch suites and unpacked-MV3 script.

## Validation

Passed: `npm run build:extension` (includes extension TypeScript), parser TypeScript, extension ESLint, complete browser regression suite, 19 built-UI Chrome fixtures and `git diff --check`. Manifest and popup assets are generated. No Admin files changed. Existing photo downloader/uploader and mandatory mappings were not modified.

Regressions verify required country/city aliases, confirmed transit, unknown/ambiguous locations, protected manual selections, nonselectable headers, durable preference change/clear/restart, priority and per-vehicle override isolation. The full suite also confirms unchanged text behavior and automatic photo transfer.

The built-MV3 test uses real Chrome messaging/storage and MyAuto's public React Hook Form module with source-derived UI handlers. It saves აშშ through the actual extension settings UI and verifies the durable local value, then selects თბილისი through the one-transfer UI for vehicle B. The corresponding default/override is attached to the correct transfer record; actual RHF location state survives focus/rerender and both vehicles finish with 15 verified gallery photos. A fuel-only retry does not reopen location or reupload photos.

Reproduce the extended MV3 fixture with `AUTO_REACT_TEST=1 AUTO_RHF_MODULE=<temporary-extracted-public-RHF-module> AUTO_SPEC_TEST=1 AUTO_LAZY_PHOTOS_TEST=1 AUTO_RETRY_TEST=1 AUTO_LOCATION_TEST=1 node apps/extension/scripts/verify-transfer.mjs` after building. The public module stays outside the repository.

**This is not authenticated live MyAuto verification.** Source/target website responses and upload acknowledgments are simulated. To test live, reload the extension and site tabs, set a default in the popup/shared panel, select a vehicle and transfer. Verify the Georgian location in MyAuto, change focus, wait for photos and check it remains. Repeat with a different one-transfer location and then verify that a later vehicle uses the saved default. Existing manual MyAuto location choices must remain untouched; publication stays manual.
