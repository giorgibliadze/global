# Separate Manheim24 Search support and original mileage units

> Follow-up: the supplied Search24 DOCX has now been inspected. See [actual snapshot findings and validation](search24-snapshot.md). Statements below about pending evidence describe the earlier implementation stage.

## Original evidence and remaining blocker

The user identified **`search.manheim24.com/results#/details/<VIN>/OVE`**, not `search.manheim.com`. The registry previously classified every Manheim24 subdomain as the working detail adapter. A new exact-host Search24 registration now has its own source ID, VIN-hash route gate, parser, gallery ownership and cache namespace. Existing wildcard manifest permissions already cover this host; they are unchanged.

**The user will supply a separate saved HTML file for the failing Search24 page. It has not yet been supplied.** Consequently, the implementation supports the existing verified Manheim24 legacy component contract and demonstrated photo races, but does not invent a modern Search24 layout or reuse regular-Manheim selectors. The exact failing live gallery/download/upload stage remains unproven until that snapshot or sanitized checkpoint report is available. The known live URL's VIN is not hardcoded in tests, code or logs.

A concrete extraction defect is reproduced using the existing sanitized Manheim24 contract: an initializing numbered Fyusion gallery with zero rendered images masks 15 valid `images[].largeUrl` entries in the legacy extractor. The new Search24 extractor prefers complete scoped structured originals instead of returning zero. It also handles an initial single structured image versus a complete numbered gallery, bounded lazy readiness, 1/5/15/23-photo galleries, high-resolution URL normalization and original numeric order. All observed photo references, including unselected primary metadata, are tracked so a stale primary cannot leak after a vehicle change. This is a proven code-level defect, not a claim that it explains the user's entire live failure.

## Source boundaries

- Working `manheim24.com`/`home.manheim24.com` detail pages continue to use the original `manheim24.ts` parser and its original behavior. That file was not edited.
- Exact HTTPS `search.manheim24.com` uses the new `Manheim24Search` source, independently of `Manheim24`, `ManheimSearch` and `ManheimSite`. Search results without a valid VIN detail hash cannot begin a transfer.
- Search24's independent parser currently recognizes only the existing confirmed Manheim24 `.VehicleDetails__container`/scoped StockWave contract. A different root/gallery in the upcoming snapshot will require an explicit Search24-only addition. No regular-Manheim layout fallback is used.
- Search24 owns a distinct Fyusion factory, portal binding and photo-owner WeakMaps. Only a gallery first observed inside its validated root may move into a modal. No document-wide images or unrelated page photos are candidates. Shared URL sanitation and exact arithmetic are neutral utilities; the public MyAuto destination remains common.
- Regular `site.manheim.com` and `search.manheim.com` retain their previously tested independent watcher, exact-host/hash routing, delayed attributes, BFCache/SPA behavior and source galleries. Their mileage handling now uses the original source unit. All observed regular photo references are likewise retained in the regular-only stale-owner guard.
- Prepared cache and transfer identity already include source ID, so Search24 cannot consume a detail or regular-Manheim payload with the same VIN/listing.

## Mileage audit and fix

The audit found conversions in the original detail parser, regular Search parser and regular Site legacy parser, followed by a destination field named `mileageKm` that always rounded the converted value and required the Georgian `კმ` selection. These assumptions caused miles to become kilometers.

`NormalizedVehicle` now has an optional backward-compatible `{value, unit:'mi'|'km'}` mileage property. New Search24 and regular Manheim parsers populate it from their actual odometer field/unit or explicit displayed mileage label, without calling miles-to-kilometers conversion. Original field text/units remain in `raw`. Missing or conflicting values/units remain unresolved. Decimal values or values beyond the known MyAuto numeric input limit are not rounded/truncated into a fabricated listing value.

`mileageKm` remains a legacy optional field and technical result key for backward compatibility. The working detail parser and old payloads retain their old behavior; their existing conversion helper is not removed or silently changed. New unit-aware payloads take priority and never use a converted kilometer fallback. ADESA and Edge Pipeline are untouched.

Confirmed mappings in tests:

- `45,200 mi` → `45200`, `mi`
- `78,500 miles` → `78500`, `mi`
- `12000 mi` → `12000`, `mi`
- Explicit `12000 km` → `12000`, `km`
- Missing or contradictory units → no numeric autofill, manual review.

Generated regular descriptions use e.g. `გარბენი: 45,200 მილი`. Existing description skipping remains in force; VIN remains excluded and never moves to descriptions.

## Actual MyAuto contract

Inspection of the existing local **public** MyAuto bundle confirms a nonclearable `primaryFeatures.mileageType` select populated from `appData.data.mileageTypes`; publication mapping reads its selected object's ID into `car_run_dim`. The actual mile option ID is not hardcoded. Runtime adapters inspect available native/custom options and select the exact recognized unit label/verified equivalent (`მილი`, `მლ`, `mi`, `Miles`, etc.). The selected option's own ID is used by the site's normal React handler.

The default kilometer unit may be replaced only for a unit-aware source payload while the mileage number is still empty. Existing manual numeric values/observed manual unit edits are protected. A nonclearable selection is verified using the confirmed controller-derived label, closed menu and selected-state/arrow contract; it does not require an unavailable clear button. Numeric mileage is entered only when the desired unit is selected, and final persistence checks include both value and unit. If only kilometers are offered, miles stay unfilled; no conversion or mislabeled numeric value is submitted.

The shared MyAuto uploader implementation is unchanged. All source field preparation still overlaps the existing photo pipeline; no additional confirmation, sequential image downloads, backend endpoint or publication is added.

## Validation counts and scope

- Existing legacy fixture: 26 discovered / first 15 selected, original working detail output unchanged.
- Derived Search24 numbered-gallery regression: 23 discovered / first 15 selected; 1-, 5-, and 15-photo variants keep their actual counts. An initializing empty gallery with 15 structured originals now returns 15, not 0.
- Regular modern fixture: 98 discovered / first 15 selected.
- Built Search24 (using the known legacy component fixture), regular Search, regular Site and working detail Chrome workflows independently exercise vehicle A/B, real MV3 storage/messages/File/DataTransfer, exact models, mileage, React persistence and shared photo delivery. Remote website options and upload acceptance are simulated, not authenticated/live.
- Simulated Chrome workflows select/download/deliver/confirm 15 photos per vehicle; these counts do not certify the user's upcoming actual Search24 snapshot. **Actual authenticated MyAuto photos accepted: unverified.**

## Files

Created: `packages/parsers/src/{manheim24Search,mileage}.ts`; `packages/parsers/tests/{manheim24Search,mileageUnits}.browser.ts`; this report.

Modified: `packages/shared/src/index.ts`; `packages/parsers/package.json`; `packages/parsers/src/{validation,searchManheim,siteManheimLegacy,myauto,stagedMyauto,DropdownAdapter,myautoContract,normalization}.ts`; `apps/extension/src/services/sourceRegistry.ts`; `apps/extension/src/content/{sourceAdapters,index}.ts[x]`; `packages/parsers/tests/{workflow,searchManheim}.browser.ts`; `packages/parsers/tests/run-browser.mjs`; `packages/parsers/tests/{reactForm,myautoContract}.fixture.ts`; `apps/extension/scripts/verify-transfer.mjs`.

The test-only React checkbox fixture received unique option keys, removing a reconciliation artifact exposed by adding the mileage selector; production door/drivetrain/transmission logic was not changed. Protected original detail parser, uploader and prepared-cache implementation are checked against pre-change hashes. No changes to `apps/admin`, authentication/cookies, website storage, ADESA or Edge Pipeline were made.

After reloading the unpacked build, manually refresh source tabs before testing so the new Search24 adapter is injected. On a fresh MyAuto form, verify original mileage and the selected mile unit, then compare visible photo counts. Review/publication remains manual. The requested saved Search24 HTML is still required to validate/add its exact live layout and identify the original live photo failure.

Validation completed: parser TypeScript, extension ESLint, full browser regression suite and `npm run build:extension` passed. New gallery tests include 1/5/15/23 photos, initializing empty gallery versus complete structured metadata, lazy population, primary-only metadata and stale-vehicle references. Original detail parsing/photo behavior remains unchanged. Four independent built Chrome scenarios (detail, Search24 known contract, regular Search and regular Site) passed two-vehicle field/photo flows; mile selectors persisted through React rerenders and photo side effects. The actual new Search24 HTML remains pending.
