# Passive MyAuto integration and strict transfer activation

## Findings and evidence

The reported intermittent live browser-side MyAuto error was **not reproduced in an authenticated session**. No live error stack, failing request or connected authenticated browser was available. The exact cause of that particular error remains unproven.

Code inspection and Git history established concrete interference/lifecycle defects:

1. `c833a894` added an unconditional, whole-document subtree MutationObserver and permanent `popstate` listener in `src/myauto/index.tsx`. The manifest injects that entry on all MyAuto URLs. Ordinary homepage/search/detail/login DOM mutations therefore ran extension code, including when no transfer existed.
2. The entry statically loaded the form/photo/parser graph. On `/ka/add`, `claimMyautoTransfer` defaulted to 20 requests even after receiving a valid "no pending job" response. A stale/invalidated extension context could produce a visible extension error notice on an ordinary visit.
3. Destination claim checked tab binding and `claimed`, but not running/terminal lifecycle, schema, payload validity or first-document ownership. Completed/corrupt indexes and abandoned unclaimed jobs were insufficiently constrained.
4. No installation/update handler validated persisted transfer schema. Compatible active jobs and incompatible pending records were not distinguished.
5. Active-transfer cleanup was not in an encompassing `finally`; an exception during setup (for example an update callback) left the form ownership lock/listeners installed. The new regression reproduces that setup exception and verifies a second invocation is no longer locked out.

These defects are supported by inspection and regression tests; they are not presented as a proven unique cause of the user's live MyAuto error. No production MAIN-world injection, global fetch/XHR/history overrides, request interception, page replacement or automatic update navigation was found. Native input setters are used only inside authorized active form filling, not assigned over browser APIs. Request interception exists only in isolated test harnesses.

## Fix

### Passive entry

`src/myauto/index.tsx` now installs a small isolated receiver. Non-add URLs return without runtime requests, observers, listeners, DOM changes or heavy transfer module loading. Ordinary `/ka/add` navigation makes one lightweight probe; no job means no form/photo import, DOM mutation, notice or repeated scan. The bootstrap has no MutationObserver or route polling. Reload/history-restoration navigation does not even probe for an old transfer.

The built MyAuto entry is approximately 3.2 kB (before gzip); the transfer runner/form/photo graph is loaded only after a current, validated claim. Existing source scripts and the popup remain as before.

### Event-driven, document-bound activation

A source click still opens the same fresh `https://myauto.ge/ka/add` tab. After saving the destination binding, the background sends `TRANSFER_READY`. If the first content probe raced ahead of storage binding, this event triggers the pending claim immediately. If content loads later, its one initial probe finds the already-ready job. No artificial delay, permanent polling or URL/query marker was introduced.

The first add-page document ID is registered per destination tab, including when the first probe arrives before job binding. A refreshed/replacement document cannot claim that job. Repeated entry installation and READY events cannot execute it twice.

Admission requires the current protocol/schema, UUID transfer ID, valid normalized payload, matching destination tab/add URL/document, running status, READY state and unclaimed intent. A READY intent has a two-minute admission window from creation; already-claimed work retains the existing 30-minute transfer TTL. This prevents an abandoned unclaimed intent from unexpectedly starting much later. Chrome navigation timing also blocks reload/back-forward activation.

Internal metadata follows `IDLE` (no job) → `PREPARING` → `READY` → `TRANSFERRING` → `COMPLETED` / `FAILED`. Existing source UI lifecycle labels/timing are preserved. Existing field retry remains an explicit, already-bound action; it is not automatically invoked on navigation.

### Updates/storage

The background validates state once on worker startup and on `runtime.onInstalled`. It validates normalized vehicle data, timestamps, fields/results, photo counts, IDs and lifecycle consistency; corrupt/expired jobs, malformed legacy reviews and orphan transfer indexes are invalidated. Only extension-owned transfer/review/index/schema keys are touched. `storage.local` settings, saved listing location and unrelated session values are preserved.

A normal worker restart preserves compatible active bound jobs. A real extension update invalidates old content contexts: jobs bound to those old contexts are marked failed while their payload/progress remain for review. A fresh post-startup context is not incorrectly classified as old. Legacy unclaimed records cannot become READY just because MyAuto opens. Incompatible messages cannot claim work.

The startup/update handlers never create/navigate a tab, fill a form or upload photos. Validation does not rewrite current compatible running records during concurrent work; index cleanup checks that a value has not been replaced before deleting it.

### Error/resource isolation

The receiver catches invalid-context, module-loading and transfer errors. Ordinary failures only produce safe developer logs; existing concise Georgian notices are reserved for admitted transfers. It never replaces/reloads the website. On active cancellation/navigation, a document-bound `TRANSFER_ABORT` stops only that extension job and preserves the page/fields/photo state; it does not replay anything.

The transfer runner validates its claim before installing resources and uses an outer `finally` to abort its own work and remove route observers, listeners and form ownership, including setup failures. The bootstrap removes listeners after completion/pagehide. The existing bounded notice timer is cleaned up on pagehide.

A new lazy import would normally acquire Vite's web-page preloader. Inspection of the generated helper showed page `<link>` creation and a website-global `vite:preloadError` event on chunk failure. For this extension's sole, CSS-free lazy runner, a narrow Vite transform replaces that helper with native ESM loading so errors stay in the receiver's catch boundary. No website event handler/API is replaced or suppressed. The built-artifact regression rejects any reintroduced `vite:preloadError` helper. This is an additional isolation safeguard, not a claim that this newly introduced helper caused the original report.

## Preserved behavior

No parser rewrite, source integration removal, MyAuto field adapter rewrite, UI redesign, manual value clearing, description re-enabling or publication. Manheim24 and Manheim Search keep their current prefetch and photo behavior; ADESA/Edge Pipeline detection and existing launcher behavior remain. Photo concurrency, file transport, gallery confirmation, VIN/mileage/specification/location filling and negotiable-price policy are unchanged. All source/transfer tests are retained.

No new permissions. The MyAuto content-script world is explicitly `ISOLATED`.

## Validation

Passed:

- `npm run build:extension` (extension TypeScript included).
- `npm run typecheck -w @auto-importer/parsers`.
- `npm run lint -w @auto-importer/extension`.
- `npm run test -w @auto-importer/parsers`: passive/activation/update regressions plus the complete existing parser, source, text and photo suite.
- `git diff --check`.

Built unpacked extension test:

```sh
AUTO_PASSIVE_TEST=1 AUTO_REACT_TEST=1 \
AUTO_RHF_MODULE=/tmp/auto-current-myauto/rhf-body.js \
AUTO_SPEC_TEST=1 AUTO_LOCATION_TEST=1 \
node apps/extension/scripts/verify-transfer.mjs
```

This uses an isolated Chrome profile, real extension messaging/session storage/tab APIs, actual React/RHF mechanisms and simulated websites/network/upload acknowledgments. Homepage, search, vehicle, login and ordinary add-form fixtures remain untouched, without mutation-driven claim polling or error notices. Refresh makes no claim. Two source vehicles still complete one-click text/specification/location/negotiable filling plus **15/15 simulated gallery photos each**, retain state after rerenders and never publish. Completed reloads do not restart photos.

Unit/browser regressions additionally cover stale protocol/IDs/payloads, terminal/expired states, delayed binding/READY, duplicate entry/events, cancelled lazy loading, contained module errors, setup cleanup, replacement-document blocking, old intent expiry, update schema preservation/invalidation, malformed reviews and preservation of unrelated local/session settings.

These tests do not reproduce the user's original authenticated browser failure. Actual login/search/site availability, an actual Chrome extension version update with legacy open tabs and real upload-server behavior still need live verification.

## Files changed for this fix

New:

- `apps/extension/src/myauto/activation.ts`.
- `apps/extension/src/services/transferActivation.ts`.
- `apps/extension/src/background/transferState.ts`.
- `packages/parsers/tests/passiveMyauto.browser.ts`.
- This document.

Updated:

- `apps/extension/src/myauto/index.tsx`, `myauto/transfer.ts`: passive entry, one-probe claim helper and guaranteed cleanup.
- `apps/extension/src/background/index.ts`, `background/transfers.ts`: update validation, lifecycle/protocol/document guard, READY notification and scoped cancellation.
- `apps/extension/src/services/extensionApi.ts`, `packages/shared/src/index.ts`: additive event/lifecycle types.
- `apps/extension/manifest.config.ts`, `vite.config.ts`: explicit isolated world and native lazy-load isolation.
- `apps/extension/scripts/verify-transfer.mjs`: built ordinary-browsing and preload isolation regressions.
- Existing direct-claim tests in `optimization.browser.ts`, `transfers.browser.ts`, `searchManheim.browser.ts`: explicit current protocol.
- Browser test import allowlist and workflow registration.

The preceding Manheim Search work was already present in the working tree and is preserved. `apps/admin` is untouched.

## Manual verification

Reload the built unpacked extension. Refresh MyAuto tabs that were open under the old version once: Chrome does not retroactively replace/remove the old anonymous content observer, and this fix intentionally does not force website reloads. Visit homepage/search/detail/login/add normally; nothing should autofill or upload. Open a supported auction listing and click once; verify fields, manual values and actual gallery counts. Refresh the destination: it must not resume. During an actual extension update, review any partially filled draft manually and start a fresh source transfer when needed. Never publish automatically.

If the original browser-side error recurs, the missing evidence is the exact sanitized error/stack, page URL path and document/network failure status, together with extension console stages at that time. Do not share VINs, authentication headers, cookies or signed URLs.
