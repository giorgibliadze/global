> Superseded status: current DOM and public component-handler evidence was subsequently supplied. See [implemented staged adapter and validation](myauto-staged-adapter.md). The historical blocked gate and baseline below are retained for context.

# Autofill architecture audit — real-form debugging gate blocked

## Current status

No production adapter or orchestration code was changed for this request. The
mandatory procedure requires proving mileage commit and manufacturer selection
on the actual MyAuto form **before** replacing adapters or optimizing the pipeline.
That gate could not be completed: a read-only probe of the existing Chrome
listing tab returned `javascript-from-apple-events-disabled`. Browser settings
were not changed. No field values, VINs, cookies or tokens were read.

Earlier instructions requested finishing without live testing; the new request
explicitly makes real-form mechanism verification mandatory. A fixture result
cannot reconcile those requirements or justify another blind adapter rewrite.
An asynchronous clarification is pending: make the existing browser accessible,
or supply current component/DOM evidence. Even with source evidence, production
acceptance still requires a real form retaining values after interaction.

## Confirmed architecture costs

- `writeControlledInput` calls `probePersistence` after every attempt, with up to
  two attempts. Each failed probe can consume an 800 ms deadline. It focuses a
  peer after the write; the probe uses multiple task boundaries and stability reads.
- `settleField` requires at least 32 ms of stability and repeatedly constructs a
  document-wide MutationObserver with a capped timer fallback. This is a code
  lower bound, not a measured count of all verification time on the live site.
- `fillMyautoForm` probes each selected dropdown/choice. Its fallback branches can
  interact with that control again. After each successful dropdown it also loops
  over previously completed fields and calls `verifyMyautoFields` individually.
  Ordinary input checks are not themselves a full-form pass, but the combined
  dependency checks grow with field count.
- `onResult` awaits a runtime/storage progress round trip after each field.
- `verifyMyautoPersistence` first rereads results, then probes each completed
  field again. Controller recovery can run a targeted refill and another complete
  persistence pass. Thus ordinary success still incurs repeated focus verification.
- Dropdown discovery has a 3000 ms per-control deadline. Several undiscoverable
  controls can consume repeated full deadlines. That is consistent with a possible
  slow failure path, but **does not establish the cause of the reported 23.9 seconds**.
- Owner/option lookups and computed visibility checks are repeated while polling;
  observers cover the whole document. Existing cache metadata does not remove all
  discovery work, because live options/ownership/selection must still be verified.

Relevant functions/files:

- `packages/parsers/src/inputInteraction.ts`: `commitTurn`, `probePersistence`,
  `writeControlledInput`.
- `packages/parsers/src/dropdownDom.ts`: `waitForDropdownChange`, `settleField`,
  scope/option lookup and visibility.
- `packages/parsers/src/dropdowns.ts`: `selectDropdown` and option cache use.
- `packages/parsers/src/myauto.ts`: `myautoFields`, `fillMyautoForm`,
  `verifyMyautoFields`, `verifyMyautoPersistence`.
- `apps/extension/src/myauto/transfer.ts`: progress messaging, photo/form join,
  final verification and targeted recovery.

## Working paths to preserve

The prepared payload is already read once in the receiver; static fields are
cloned from `preparedFields` when available. Existing normalization timings confirm
that destination static preparation is approximately 0.1 ms in the warm fixture.
Repeated description/translation normalization is therefore not demonstrated as
the main bottleneck for that path. Description fitting and privacy checks still
perform separate string work.

Independent text/choice fields are already ordered ahead of dropdowns. Manufacturer
precedes model, overlays are serialized, and photo work runs in a parallel task.
Photo downloads are bounded at three and the supported upload remains one batch.
The description uses the live maxlength, VIN sanitization and omission reporting.
These paths should not be replaced while determining the actual input contract.

## Measured baseline, without adapter changes

The existing unpacked MV3 harness ran alone using warm prefetch, two sanitized
BMW fixture vehicles, 15 images each, 120 ms intercepted response latency per image
and three download workers. Websites, options and server upload acknowledgments
were simulated. These are **not** measurements of the user's Ford or production
MyAuto. No before/after improvement is claimed because no new mechanism was applied.

| Metric | Fixture A | Fixture B |
| --- | ---: | ---: |
| Click to form ready | 311 ms | 263 ms |
| Ready to first visible input | 42 ms | 37 ms |
| Ready to first persistence-certified field | 82 ms | 75 ms |
| Form filling | 2,330 ms | 2,185 ms |
| Dropdown discovery, cumulative | 860 ms | 831 ms |
| Dropdown selection, cumulative | 357 ms | 361 ms |
| Reported field verification, cumulative | 528 ms | 530 ms |
| Final verification | 619 ms | 606 ms |
| Click to verified photo completion | 2,380 ms | 2,187 ms |
| Click to completed result | 3,341 ms | 3,187 ms |

The existing `fieldVerification` counter does not cover every text probe/task
boundary. Dropdown timing counters also overlap selection verification; photo
and form durations overlap. Do not sum them or treat them as complete operation
profiling. Click-to-result includes the harness's completion polling. Raw values:
[autofill-architecture-baseline.json](autofill-architecture-baseline.json).

## What must happen before implementation

1. Use a fresh authenticated MyAuto form. Reproduce mileage loss, then determine
   the real onChange/onInput/onBlur/mask behavior and whether supported synthetic
   interaction is accepted. Confirm mileage after another input and rerender.
2. Open the real manufacturer control. Capture its actual list/portal, option
   metadata and selected-state contract. Select Ford and verify it persists after
   leaving the control; inspect the resulting model dependency.
3. Only after both contracts work, implement separate `TextInputAdapter` and
   `DropdownAdapter` execution plans: resolve inputs once, apply the proven
   minimal events, serialize dependency operations, run one staged read pass, then
   at most one safe repair of genuinely failed fields. Do not remove a required
   component commit merely to improve a fixture benchmark.
4. Profile first input, all independent inputs, dropdowns and total time before
   and after on the **same vehicle**, retaining photo independence, manual-edit
   ownership and final manual publication.

Useful evidence if a browser connection cannot be provided: the actual mileage
input and its public handler/mask code; the opened manufacturer control/list
outerHTML; selected control state before/after blur/rerender; actual model options
after Ford. Omit VINs, session scripts, tokens and cookies. The prior saved HTML
has closed controls only and cannot prove the live selection mechanism. The
existing deferred-blur React fixture is useful regression coverage, not proof of
the production handler implementation or trusted-event requirements.

## Files and validation for this request

Only this audit and `docs/autofill-architecture-baseline.json` were added. Earlier
uncommitted work was preserved; no Admin, adapter, permission, configuration or
photo implementation changes were made. Requested TypeScript/lint/build and the
existing regression suite were run against that unchanged baseline. Acceptance
remains blocked on real-form access, not on compilation.

Results: parser TypeScript, extension ESLint, the existing full browser regression
suite, the warm MV3 benchmark, `npm run build:extension`, and `git diff --check`
passed. The build generated the extension manifest and popup/content/worker
assets. No after-change benchmark exists because no adapter change was applied.
