# Transfer stability, EV field isolation and 30-tab validation

## Findings, with evidence boundaries

- `PreparedVehicles` evicted generations and cached payloads above **20 source tabs**. The new 1/5/10/20/30-cache test verifies independent records at all those sizes. Capacity is now bounded at 64; the existing two-minute TTL remains. This was cache churn, not proven cross-vehicle corruption: `begin()` already has a safe reconstruction fallback.
- Transfer admission checked the four-running-job limit under **per-source** locks. Concurrent starts from different sources could all observe capacity before saving their own reservations. Admission/count/save now runs under a short shared lock. Vehicle extraction and tab opening remain outside that lock. A 30-simultaneous-start test admits exactly four jobs with distinct destination IDs.
- The staged dropdown loop had no per-field exception boundary. A throwing option adapter skipped the remainder of the batch. That exception now becomes an unavailable field result; subsequent fields continue. Abort and selected-vehicle guards are rechecked and remain fatal. Missing EV engine volume/cylinders already have safe missing-value results; no gasoline requirements or fabricated EV specifications were added.
- Source preparation scheduled parsing and normalization after relevant mutations even in hidden tabs. Automatic preparation now pauses while hidden and schedules on visibility restoration; explicit user-requested resolution remains available. Existing observer ownership/disposal stays in place, with the new visibility listener removed on disposal.
- Photo downloads were already globally bounded at four and destination workers already use four local workers. With four concurrent sessions, up to 16 preparation messages could contend for four download slots, while each message has a 60-second timeout. Three 8-second attempts plus backoff can occupy one slot for roughly 25 seconds. This is a plausible queue-timeout risk, not proof of the user's live failure. The global bound is now eight while the per-destination bound stays four. The synthetic 60-operation queue test verifies peak eight, no starvation, exact source bytes per transfer/index, and cache reuse without redownloading. These limits are not a device-independent performance guarantee.

No single global current vehicle/photo array was found. Existing UUID jobs, source associations, destination bindings, document IDs, IndexedDB photo keys, message checks, abort controllers and per-job locks were retained. Each transfer continues to open its own destination; no active draft is reused.

The specific live EV-to-photo interruption and intermittent network/upload failures cannot be conclusively attributed without the failed attempt's sanitized checkpoints/Network evidence. Fixes above address reproducible code-level weaknesses, not an assertion that every reported live symptom has been reproduced.

## Resource, retry and recovery behavior

- Four admitted active transfers, eight global photo downloads, four photo workers per destination, up to 15 photos per vehicle.
- Excess simultaneous **transfer starts are explicitly rejected with the existing Georgian capacity message**; automatic durable session queuing was not introduced. Photo operations within admitted sessions queue FIFO. Thirty open tabs does not mean thirty simultaneous active transfers.
- Existing transient-only download retry, denial/expired URL handling, bounded uploader waits and ID-confirmed missing-photo retries remain unchanged.
- Existing minimal job metadata persists in `chrome.storage.session`; temporary binary photos remain keyed in IndexedDB. Blob/File messaging was not introduced. Existing chunk/metadata/hash reconstruction remains in use.
- Worker-object recreation test validates persisted job/destination associations. This does not simulate every operating-system suspension point or promise to resume a replacement destination document. Completed uploads are never automatically replayed.
- Closing a source preserves its approved destination job. Closing a destination removes only its own job/blobs. Tests verify other jobs survive and all fixture blobs are released after cleanup.
- No change to mileage values/units, auction galleries, photo order/quality, source routes, VIN handling, description skipping, negotiable price, upload contract or publication. Publication remains manual.

## Diagnostics

Development builds add safe session events with transfer ID, platform, source/destination tab IDs, hashed vehicle ID, stage, elapsed time, result and error category. No payloads, URLs, exception contents, VINs, credentials or cookies are included. Existing photo checkpoints/report continue to distinguish extracted, downloaded, reconstructed, submitted and gallery-confirmed counts. Normal UI has no technical diagnostic output.

## Validation and benchmark

Passed:

- `npm run build:extension`
- `npm run typecheck -w @auto-importer/parsers`
- `npm run lint -w @auto-importer/extension`
- `npm run test -w @auto-importer/parsers`
- Built MV3 isolated Chrome test with **30 page targets** containing mixed home-Manheim24, regular-Manheim and ordinary MyAuto fixtures, followed by two independent vehicle A/B transfers. Separate runs passed for both the home-Manheim24 source and the regular Manheim Search source. Real Chrome storage/messages/tabs/File/DataTransfer and React Hook Form mechanisms were exercised. No photo downloads occurred in the worker before the user transfer.

Per vehicle in that built-extension test: 15 selected, 15 downloaded, 15 Files delivered, 15 images confirmed by the **simulated** destination gallery. Both drafts retained React-controlled fields and remained unpublished. Ordinary MyAuto tabs remained passive.

New synthetic session/cache/admission/60-photo-queue benchmark: approximately **219 ms** in the final run (525 ms in an earlier concurrent test run) on this machine using tiny synthetic blobs and a 2 ms mock download. This is not a real network, memory-pressure or 30-user performance measurement.

Regression coverage also includes 120 source identity changes with observer cleanup, transient download failures, permanent authorization denial, 12 accepted plus three failed-upload retries without duplicating successful cards, partial result reporting, missing/rejected VIN without stopping photos, EV payloads without combustion values, unsupported dropdown exceptions, and abort propagation.

Not live-verified: authenticated auction downloads/MyAuto acceptance, a long-running 30-tab memory-pressure soak, actual OS-driven worker suspension during a file chunk, and the exact user's failed EV listing. Battery capacity/range/motor-power mappings were not invented without confirmed source and MyAuto controls.

## Files changed in this task

- `apps/extension/src/background/preparation.ts`
- `apps/extension/src/background/transfers.ts`
- `apps/extension/src/content/preparation.ts`
- `apps/extension/src/myauto/transfer.ts` (safe development diagnostics only)
- `apps/extension/src/services/diagnostics.ts`
- `packages/parsers/src/stagedMyauto.ts`
- `packages/parsers/tests/sessionStress.browser.ts` (new)
- `packages/parsers/tests/stability.browser.ts`
- `packages/parsers/tests/receiver.browser.ts`
- `apps/extension/scripts/verify-transfer.mjs`
- this report

No Admin, gallery parser, mileage mapping, popup/launcher, shared upload adapter, authentication or cookie changes.
