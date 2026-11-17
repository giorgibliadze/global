# Regular Manheim detection and isolated lifecycle fix

## Confirmed findings

The manifest already matches both `https://site.manheim.com/*` and `https://search.manheim.com/*` through its existing Manheim matches/host permissions, runs at document idle in the top frame and lets CRXJS generate the content assets. No missing permission was demonstrated; the manifest is unchanged. No private endpoints, broad permissions, frame injection or authentication traffic changes are added.

Four defects were reproduced with the existing sanitized detail fixtures:

1. Search's VIN-hash helper rejected a valid `#/details/<VIN>/<sale>` contract on any outer document path except `/` or `/results`. The helper is now path-independent on the exact HTTPS Search host. A matching visible vehicle root, structured listing/VIN and original identity are still required; a URL alone cannot import.
2. When a root received its real `data-test-id` after insertion, the old readiness observation could miss that identity attribute change. The regular-only observer now watches both confirmed attribute spellings (`data-test-id`, `data-testid`), listing/VIN, visibility and relevant subtree changes. It does not invent alternate vehicle selectors.
3. Site disposed its watcher on pagehide and never reinstated it on BFCache pageshow. Both regular domains now use one **regular-Manheim-only** document lifecycle: pause/dispose activation on persisted pagehide, re-observe/revalidate/re-register on persisted pageshow, and release everything on terminal unload.
4. Site chose the modern layout merely because a matching node existed, even if it was hidden/stale and the supported legacy details were visible. It now chooses a visible confirmed layout. Its dedicated parser remains independent of Manheim24.

These are fixture/code-level findings, not proof that every reported live inactive page has one of these causes. Unknown actual layouts, embedded-frame layouts or installed-build/context problems require a sanitized snapshot/live observation; no universal selector support is claimed.

## Implementation boundaries

`content/regularManheim.ts` owns the Site/Search watcher, route state, blocked stale selection, activation/disposal, Navigation API `currententrychange` listener and BFCache behavior. Hashchange/popstate and filtered DOM observation remain fallbacks. It never wraps/replaces history/navigation APIs and uses no interval or permanent polling. A WeakMap makes initialization idempotent. Search and Site continue to use their own source adapters/parsers/gallery namespaces; the unchanged shared transport receives the explicit regular adapter.

On route change, the old launcher/parser is disposed before activation. VIN hash routes independently match the new selected vehicle; unstructured Site path changes require a changed identity/root to prevent reusing the previous listing. Query-only changes in the same view can revalidate the unchanged vehicle. Results/login/informational pages with no verified vehicle remain passive. A known component can arrive later without refresh. The launcher keeps the existing design/position; a regular-only Georgian tooltip indicates preparation/not-ready state.

Modern Site/Search visibility is shared in the new `manheimVisibility.ts` utility **within regular Manheim**, not imported from or applied to Manheim24. There is no document-images fallback. Existing structured galleries, numbered Fyusion galleries, lazy readiness, owned modal nodes, URL normalization, ordering and deduplication remain unchanged. An unknown gallery/modal not bound to the selected listing remains unsupported rather than borrowing unrelated images.

## Parsed data and photos

The existing modern fixture provides manufacturer, complete original model, independently verified trim, year, VIN/listing ID, mileage/units, engine displacement/cylinders, fuel, transmission, drivetrain, body, doors, exterior/interior colors, material and equipment. Missing steering/condition remains missing/manual. Source prices are excluded by regular adapters, descriptions retain existing VIN privacy and the shared MyAuto description-skipping policy remains unchanged.

The modern fixture exposes 98 distinct original photo candidates and selects the first 15. Existing partial structured array (one photo), complete DOM gallery, hidden/owned modal, delayed and legitimate smaller-gallery tests remain. Extraction is not claimed as downloading or uploading. Built MV3 fixtures separately verify real File delivery and 15 simulated gallery confirmations per vehicle.

## Manheim24 protection

No edits were made in this task to Manheim24 parsing/gallery/caching/authentication or to shared preparation/transport/upload behavior. SHA-256 checks captured before editing and rechecked afterward confirm byte-for-byte unchanged:

- `packages/parsers/src/manheim24.ts`
- `apps/extension/src/content/manheim.ts`
- `apps/extension/src/content/preparation.ts`
- `apps/extension/src/background/preparation.ts`
- `apps/extension/src/photos/galleryUpload.ts`
- `apps/extension/manifest.config.ts`

The shared content entry changes only the regular-Manheim branch. Manheim24 keeps its existing branch and default launcher props. The shared route helper change is exclusively in `searchManheimRouteVin`; Manheim24 does not use it. ADESA, Edge Pipeline, MyAuto field/upload implementations and `apps/admin` are untouched. Older unrelated uncommitted changes in this workspace were preserved.

## Files

Created:

- `apps/extension/src/content/regularManheim.ts`
- `packages/parsers/src/manheimVisibility.ts`
- `packages/parsers/tests/regularManheim.browser.ts`
- This report.

Modified:

- `apps/extension/src/content/siteManheim.ts` (compatibility export to the dedicated regular lifecycle)
- `apps/extension/src/content/index.tsx` (regular-only initialization branch)
- `apps/extension/src/content/FloatingLauncher.tsx` (optional regular-only readiness tooltip)
- `packages/shared/src/index.ts` (Search-only hash route helper)
- `packages/parsers/src/{searchManheim,siteManheim}.ts` (regular visibility/layout selection)
- `packages/parsers/tests/{workflow.browser.ts,run-browser.mjs}`
- `apps/extension/scripts/verify-transfer.mjs` (optional regular-only lifecycle fixture flag; Manheim24 test flow unchanged)

## Verification scope

Independent regressions cover exact hosts, VIN hash paths, delayed attribute-based initialization, two source adapters, no duplicate watcher/launcher, SPA identity switches, stale route blocking, BFCache suspension/restoration, terminal cleanup and hidden modern/visible legacy selection. The full existing suite includes Manheim24 parsing/gallery/cache tests, platform dependency isolation, 120 accelerated source transitions, MyAuto fields and photo transport. UI tests preserve Georgian styling and default behavior.

The built extension runs in isolated Chrome with real MV3 APIs, storage, File/DataTransfer and React/RHF-controlled form fixtures. Site and Search independently initialize launchers and complete two isolated simulated transfers. The optional regular lifecycle fixture dispatches BFCache events and performs an actual History API query transition; it does not reproduce a browser-managed authenticated BFCache navigation. Sites, dropdown options and server photo acceptance are intercepted/simulated. Live authenticated Manheim/MyAuto testing was not performed. Publication remains manual.
