# One-click direct transfer UX

The floating icon now directly calls the existing `TRANSFER_BEGIN` workflow. It no longer opens a panel, preview, confirmation, separate transfer button or results screen. The official icon, fixed top 100px/right 16px position, blue glow, Shadow DOM isolation and reduced-motion support remain. Only a subtle busy ring appears while processing. A complete failure produces one small five-second error; ordinary completion leaves the MyAuto form unobstructed.

The toolbar popup retains location preferences and a direct transfer button, without field lists, counters/history or a large result panel. Default/one-transfer location rules remain available there. Direct floating-icon transfers use the configured default or verified source evidence.

## Lifecycle and navigation

`IDLE → PREPARING → NAVIGATING → FILLING → UPLOADING_PHOTOS → COMPLETED`, or `FAILED` when no vehicle data/photos were transferred. A negotiable-price/location-only result cannot hide a completely failed vehicle transfer. Partial drafts with actual vehicle fields or photos are left open for review without a warning list.

The shared `useDirectTransfer` hook takes a synchronous click lock before awaiting extraction. The existing background vehicle identity/generation checks and concurrent-start deduplication remain authoritative. Reloaded source pages recover the running job through `TRANSFER_ACTIVE`; an old asynchronous lookup cannot replace a newer click's state. Only user clicks start jobs; preparation/SPA events do not.

Lifecycle is persisted alongside the existing job in `chrome.storage.session`. Source preparation remains bound to the currently selected vehicle. MyAuto's content script claims the destination-bound pending transfer automatically, fills existing supported fields and location, then runs the unchanged photo pipeline. No second click is needed.

Each new transfer opens a new MyAuto add-listing tab. Existing tabs/drafts are left intact rather than guessing whether it is safe to reuse them. The source page stays open. Publication remains manual.

After the final photo verification, temporary binary storage and active/destination bindings are cleaned up. The short-lived terminal job remains available for source polling and developer diagnostics under the existing 30-minute TTL/pruning. A completed destination reload cannot reclaim it. Destination document identity checks remain: a reload during an unfinished upload does not blindly replay files into a replacement form.

## Existing behavior preserved

No field-mapping or photo-processing adapter was refactored for this request. VIN/mileage, dropdowns, steering/transmission/drivetrain/doors, location, negotiable price, untouched selling price/description, manual-edit protection, text-before-photos order and maximum 15 photos remain covered by regressions.

The detailed Summary/TransferProgress screens and obsolete panel/progress CSS were removed. Technical job errors/timings and existing stage logs remain in developer diagnostics, not normal UI. MyAuto receives no results overlay; only complete failure can create a temporary noninteractive error toast.

## Files changed for this UX request

New:

- `apps/extension/src/services/useDirectTransfer.ts`: shared immediate-start hook, busy/error feedback and active-job recovery.
- `apps/extension/src/services/transferLifecycle.ts`: persisted lifecycle derivation and complete-failure classification.

Updated:

- `apps/extension/src/content/FloatingLauncher.tsx`, `content/launcher.css`: icon-only direct action, motion-aware busy ring, no panel/status labels.
- `apps/extension/src/components/ImportAction.tsx`: minimal toolbar action with existing location preferences.
- `apps/extension/src/myauto/index.tsx`: automatic receiver without a results screen.
- `apps/extension/src/background/index.ts`, `background/transfers.ts`: active-job recovery message, persisted lifecycle and terminal binding cleanup.
- `packages/shared/src/index.ts`: optional lifecycle type/metadata.
- `apps/extension/src/styles/ui.css`: remove obsolete summary/preview styling.
- `apps/extension/scripts/verify-transfer.mjs`, `verify-ui.mjs`, parser browser runner and transfer regressions: direct-icon UX, lifecycle, no-overlay and reload tests.

Deleted: `apps/extension/src/myauto/Summary.tsx`, `apps/extension/src/components/TransferProgress.tsx`.

## Validation

`npm run build:extension`, parser TypeScript, extension ESLint, complete parser/workflow regressions and built-UI Chrome checks pass. Build emits the manifest/popup assets. No Admin files changed.

The unpacked MV3 harness now clicks the floating icon directly twice in the same task and verifies one destination per vehicle. It exercises actual Chrome messaging/storage with MyAuto's public RHF module and source-derived handlers. Both independent vehicles retain exact identity, required specifications, location and negotiable price; description stays empty; each ends with 15 verified gallery photos after text autofill. No confirmation/dialog/large summary exists. Reload after completion does not redownload/reupload or reclaim the job. Safe existing manual-input and source A/B isolation regressions still pass. All 19 built-UI fixtures verify icon position/assets, loading lock, no panel, Georgian feedback, page control usability and SPA duplicate-host protection.

Website responses, dropdown IDs and upload acknowledgments in that harness are simulated. **Authenticated live Manheim24 → MyAuto success is not claimed.** The working real extraction workflow remains Manheim24; the other auction launchers report their existing unsupported-transfer limitation in one concise message.

To test in Chrome, reload the extension and auction/MyAuto pages, open one Manheim24 vehicle, then click the floating icon once. MyAuto should open a new form, fill supported values, upload photos and leave the draft open without any extension summary to close. Final review/publication remains yours.
