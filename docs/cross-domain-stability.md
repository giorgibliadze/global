# Cross-domain / long-session stability audit

## What is established

The report that normal Chrome stopped serving the auction/MyAuto sites, that Manheim24 returned `session_unavailable`, that disabling the extension did not immediately restore it, and that Incognito or clearing browsing data helped does not establish extension causation. No affected authenticated browser profile or failing Network capture was accessed here. Website session/SSO state, blocked redirects, first-party storage/service-worker state, another extension, network policy or browser-profile corruption remain hypotheses, not diagnosed causes.

Static audit found no extension cookie API, authentication interception/rewrite, website localStorage/sessionStorage writes, automatic recovery reloads, redirects, global fetch/XHR/history overrides, setInterval, or object URLs in the extension source. The only extension photo fetch uses the allowlisted image hosts, existing credentials policy, no-referrer and redirect rejection. The extension's deliberate navigation remains the one-click MyAuto tab creation. Source parsing remains platform-specific. Normal MyAuto pages use the existing passive activation guard.

## Confirmed extension defects and targeted fixes

- Repeated `registerManheimParser` calls could add duplicate runtime listeners. A per-document WeakMap now makes registration/disposal idempotent. Listeners close over their own preparation instance instead of a module-global instance. Terminal pagehide removes the listener/observer; BFCache documents are not permanently disposed by that handler. Search returns the same disposer. Site retains its existing activation cleanup.
- An invalidated source context left its preparation MutationObserver running. Subsequent vehicle mutations could trigger repeated runtime calls that were guaranteed to fail. A narrowly matched context-invalidation error now sets the error state and permanently disposes preparation, aborting readiness waits and disconnecting observers/listeners. It never reloads the website.
- Closing/aborting the destination did not cancel an in-flight photo fetch. Transfer-specific AbortControllers now cancel pending network work on destination removal, explicit abort and finish. Retry backoff is abortable; cancellation is never retried as a transient network failure. Queued requests recheck their transfer before downloading. Closing the source still does not cancel an already authorized destination transfer.
- Temporary completed metadata had time-based expiry but no history-count cap. Maintenance now retains at most 20 completed records (plus active work; concurrent completions may remain until the next existing maintenance/begin trigger). Disposal releases matching receiver bindings without deleting a binding owned by a newer job/document. Existing review bounds, source cache TTL/20-entry limit, file limits, global four-download limit and transfer UUID photo namespace remain.
- Cleanup formerly used creation time even for recently progressing long-running claimed work. Active claimed work now uses its most recent progress timestamp for idle expiry. Pending/unclaimed or completed work still uses its existing creation-time deadline. No progressing active transfer is evicted to satisfy completed-history limits.
- IndexedDB pruning independently deleted old photo blobs even if an owner record was still valid. Valid owner IDs are now authoritative; orphan blobs are removed only when they predate the maintenance snapshot. Finishing/aborting/closing a destination releases its photos. No website storage is touched.

## Resource/storage validation

The isolated browser stress test executes 40 vehicle changes per adapter (Manheim24, Manheim Site, Manheim Search): 120 total. Each change asserts current identity and 15 source-specific photos, then repeats warm resolve to catch duplicate parsing. A test-only counted MutationObserver checks bounded active observers and zero remaining after disposal. Each source is then given a simulated invalidated context; later mutations must cause no additional API calls. This is accelerated synthetic navigation, not a multi-hour authenticated session or Chrome heap measurement.

Other new tests cover duplicate listener initialization and repeated disposal; 100 completed records plus a recently active 40-minute-old transfer; cleanup to 20 completed records while retaining active work and removing obsolete receiver bindings; cancellation of a pending fetch with exactly one attempt/no retries; and retaining an actually aged photo blob whose owner remains valid. Existing regressions cover partial photo failures, exact fields, SPA isolation, real File transport, passive MyAuto browsing and extension update schema guards.

No real extension update/restart of an authenticated Chrome session, OS memory plateau or multi-computer behavior was observed. Existing schema/reload fixtures test lifecycle contracts; they cannot certify a browser-profile outage is resolved.

## Safe live diagnostic procedure

Use the same URL and record only timestamps, domain, request type, HTTP status/error code and whether a login or detail page renders. Do not export raw HAR files, request headers/bodies, cookies, signed URLs, VINs, session tokens, passwords or page scripts.

1. In the affected normal profile, test with Auto Importer enabled. Note whether failure happens before clicking the launcher. Inspect sanitized Console error categories and the first failed document/SSO request status. In the extension service-worker DevTools, record the first failing checkpoint, transfer UUID and platform, excluding payloads.
2. Disable Auto Importer and **manually reload** that page. Existing injected content scripts can remain until the document is replaced; disabling alone is not a controlled comparison.
3. Test the same normal profile with all extensions disabled, then manually reload. If failure persists, record that separately rather than attributing it to Auto Importer.
4. Compare Incognito with extensions disabled and a fresh Chrome profile, using the website's normal login flow. Profile/cookie differences mean this is evidence about profile state, not proof of a specific cause.
5. If investigating site-specific data clearing, the user may choose it manually after recording the baseline. It can sign the user out or remove drafts. The extension never performs it. Compare one site's behavior before/after rather than clearing all browsing data as an automatic repair.
6. During extended use, use Chrome Task Manager to compare the relevant tab and extension-worker memory/CPU at idle and after 100+ transitions. Record counts/MB only. Inspect extension-owned storage key counts and aggregate bytes without printing values. Check that terminal/expired jobs and orphan photos shrink after maintenance, while active work remains.
7. Separately exercise slow/failed photos, multiple auction tabs, idle/resume, manual page refresh and extension update. Stop before publication; compare first field persistence and actual visible MyAuto gallery count. A website `session_unavailable` needs the failing document/SSO status and profile comparisons above to diagnose.

## Changed files

- `apps/extension/src/content/{manheim,searchManheim,preparation}.ts`
- `apps/extension/src/services/extensionApi.ts`
- `apps/extension/src/background/{transfers,transferState}.ts`
- `apps/extension/src/photos/{download,store}.ts`
- `packages/parsers/tests/{stability,workflow,passiveMyauto}.browser.ts`
- This report.

No changes to platform parsers, field mappings, icon/design, authentication headers/cookies, website storage, publication or `apps/admin` were made in this follow-up.

Validation completed: extension build, parser TypeScript, extension ESLint and full browser regression suite passed, including the 120-transition test and actually aged photo ownership fixture. Built MV3 Site/MyAuto fixtures also passed delayed-gallery recovery, ordinary-page passivity, informational-page exclusion, two independent transfers with 15 simulated gallery confirmations, and React field persistence. Authenticated profile outages remain unverified.
