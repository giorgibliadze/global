# Parallel transfer scheduling

The receiver previously completed autofill before starting photo downloads and
upload. Its field order placed dropdowns between VIN and the remaining text
fields. This added the two pipelines' durations and delayed independent mileage
and description fields behind unrelated dropdowns.

The receiver now starts form autofill and photo preparation/upload together after
the fresh destination form is identified. Independent text/choice fields run
first. Dropdowns stay serialized, with manufacturer before model; no competing
shared-overlay interactions were introduced. Selected label/ID verification no
longer repeats portal discovery after a selection is already present.

Form readiness and uploader readiness use MutationObserver notifications with one
bounded deadline, not startup polling. Existing bounded dropdown waits, context
cache and live-option validation remain. A missing option does not block text,
other independent fields, or photos. Both pipelines settle before final blur and
rerender persistence verification and any single targeted repair pass.

Photo downloads retain three bounded workers, per-photo deduplication, transfer
blob reuse, original ordering and SHA-256 transport checks. The confirmed MyAuto
uploader supports one batch into an empty gallery. Upload starts when that batch
is ready, independently of form completion. **Incremental append uploads have not
been verified**, so the implementation does not append successive FileLists or
claim that remaining downloads overlap that same batch's upload. It still verifies
the final 15-photo count and loaded remote previews, not just local FileList state.

Each document has one active form owner, including failed-field retries. Shared
abort signals stop writes on navigation/identity mismatch; delayed photo responses
are ignored after cancellation. Real user edits are protected per field rather
than disabling recovery for every click anywhere on the page. A safe inspection
click can therefore coexist with post-photo recovery. The final publication
control is never clicked.

Georgian progress now displays `მონაცემების შევსება: X/Y`,
`ფოტოების ატვირთვა: X/15` (actual source total if fewer), prepared photos,
current field and total elapsed time. Only persisted fields count as completed.
Background progress merges field and photo updates under the existing job lock.

## Measured comparison

Two sanitized vehicle fixtures, 15 photos each, real unpacked Chrome MV3 APIs,
intercepted websites/options/upload acknowledgments, 120 ms response latency per
image, three download workers. Runs were performed without concurrent browser
tests. The sequential control temporarily restored the former pipeline scheduling
and VIN → dropdowns → other fields order while keeping common instrumentation
and verification. The parallel source and build were restored afterward.

| Metric, mean of vehicles A and B | Sequential control | Parallel |
| --- | ---: | ---: |
| Click to completed result | 5,077 ms | 3,152 ms |
| Click to first visible input | 363 ms | 340 ms |
| Click to visible mileage | 2,003 ms | 464 ms |
| Source extraction | 3.2 ms | 3.4 ms |
| Job creation to destination controls ready | 271 ms | 249 ms |
| Receiver start to first persisted field | 92.9 ms | 89.7 ms |
| Dropdown discovery, cumulative | 825 ms | 828 ms |
| Form autofill | 2,153 ms | 2,130 ms |
| Photo preparation/download/transport | 770 ms | 743 ms |
| Batch upload verification | 1,079 ms | 1,089 ms |
| Final verification | 607 ms | 605 ms |

Total click-to-result time decreased 37.9%; mileage appeared 76.9% sooner. The
first input was already fast and changed only slightly (6.3%). Individual work
durations remain similar; overlap removes their addition. These two-sample fixture
measurements are not a statistical guarantee or authenticated MyAuto timings.
Click-to-result includes the harness's 100 ms completion polling and tab startup.
The first visible field measurement precedes blur certification; the separate
`firstField` production metric records the first persistence-certified result.
Overlapping stages must not be summed to infer elapsed time.

Raw measured values: [parallel-transfer-measurements.json](parallel-transfer-measurements.json).

## Files changed for this optimization

- `apps/extension/src/myauto/transfer.ts`: concurrent pipelines, final join,
  timing milestones, form ownership and field-specific recovery protection.
- `apps/extension/src/photos/client.ts`: discard aborted photo results.
- `apps/extension/src/services/domReady.ts`: event-driven readiness (new).
- `apps/extension/src/background/transfers.ts`: validated photo/form progress.
- `apps/extension/src/components/TransferProgress.tsx`: independent counters.
- `packages/shared/src/index.ts`: form denominator and timing milestone types.
- `packages/parsers/src/myauto.ts`: independent inputs before dropdowns;
  protect user edits to native/custom model controls.
- `packages/parsers/src/dropdowns.ts`: avoid discovery during selected-value
  verification and respect aborts in option interaction.
- `packages/parsers/src/inputInteraction.ts`: abort checks before input writes
  and option interactions.
- `packages/parsers/tests/receiver.browser.ts`: prove form/download overlap,
  dependent dropdown order and exclusive ownership.
- `packages/parsers/tests/persistence.browser.ts`: DOM readiness, cancellation
  and prevention of stale writes.
- `packages/parsers/tests/run-browser.mjs`: serve the new readiness helper.
- `apps/extension/scripts/verify-transfer.mjs`: first-input/mileage measurements
  and trusted safe inspection during parallel React transfer.
- This report and its raw measurement JSON.

Earlier uncommitted popup, icon, translation and persistence work was preserved.
No Admin files, dependencies, artwork or manifest configuration changed.

## Verification

TypeScript, extension ESLint, ESLint on changed parser/shared/test TypeScript,
the full sanitized browser regression suite, `npm run build:extension`, 19 built-UI
fixtures, sequential/parallel MV3 harnesses, and the real React fixture with
failed-fuel-only retry were exercised. Fixtures cover missing/rejected VIN fields,
exact full model, ambiguous optional trim, dependency order, blur/rerender
persistence, early independent fields while downloads are gated, 15/15 photos,
photo-induced field resets, no duplicate jobs, vehicle isolation, no photo retry
on field retry, and no publication.

The React harness uses the installed React/ReactDOM dependencies and checks its
public controlled form state after rerender. It also performs a trusted CDP click
on a safe fixture control while transfer is running. The extension itself uses
supported DOM events and does not fake trusted events or access React internals.

**No authenticated live Manheim24 → MyAuto browser validation was performed.**
Real production dropdown timings, upload responses and component behavior remain
subject to live verification. Reload the extension and both site tabs, transfer
once into a fresh listing, inspect values while photos process, then check
dropdowns and gallery before publishing manually.
