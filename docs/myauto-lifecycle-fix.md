# MyAuto field lifecycle fixes and remaining acceptance gap

**The production acceptance criterion is not yet verified.** No authenticated
MyAuto browser connection was available. The code fixes below address reproduced
extension defects and observed HTML contracts; they do not establish that all
controls on the current production MyAuto form now persist.

## Evidence and root causes

1. **Unsafe event sequencing, reproduced with real React.** The old adapter
   dispatched input/change, immediately blurred the control, focused a peer and
   immediately blurred that peer, all in the same JavaScript task. The verifier
   also refocused controls and dispatched synthetic focusout on unfocused wrapper
   divs. In a real React controlled form with deferred blur commits, the second
   blur used a prior form snapshot and erased mileage. The harness runs that old
   sequence first and asserts that the data disappears, then runs the fixed
   extension and asserts public React state persists. The actual MyAuto handler
   implementation remains unavailable, so this reproduced mechanism is **not
   claimed as the conclusively identified production-site cause**.
2. **Description length, confirmed against the supplied HTML.** Its textarea
   has `data-testid="description-textarea"` and `maxlength="4000"`. The filler
   previously rejected an overlong description without trying to fit it.
3. **Dropdown discovery/verification contract, confirmed in code.** The adapter
   only enumerated `role="option"` nodes, even within explicitly linked portals,
   and did not check whether the tracking value matched a clicked option's own
   explicit value metadata. The saved HTML has nonfocusable div triggers,
   opacity-zero/pointer-events-none tracking inputs, and closed dropdowns. It has
   **no opened options**, so it does not prove which list/option markup the live
   application uses or that those tracking inputs contain committed option IDs.
   Claiming that semantic selectors are the exact production failure would be
   guessing. Unobservable committed choices are now reported as unverified.
4. **Verified structured model ignored for destination mapping.** The complete
   title designation was always used for Model. A separately labeled source base
   model followed by its independently verified trim and further descriptors can
   now map to that exact structured model. No word-position parsing, fuzzy model
   substitutions, or hardcoded Ford names were added.

Public JavaScript URLs referenced by the saved document returned HTTP 404. A
credential-free request to the current `/ka/add` shell returned HTTP 403. No access
controls were bypassed and no credentials, cookies, profile storage or session
tokens were read. There were no connected Codex document/browser sessions. The
saved HTML was inspected through an attribute allowlist; it was not copied into
the repository or used as a raw authenticated test fixture.
An additional read-only Apple Events probe located an existing Chrome listing
tab but JavaScript evaluation returned `javascript-unavailable:12`. The probe
requested only a boolean control-presence check, not field values. Browser
settings were not changed, and no live DOM/form persistence test was possible.

## Implemented lifecycle

`myautoFields` still creates static typed fields, including prepared-cache reuse.
`fillMyautoForm` targets live inputs and uses the owner document's native setter,
beforeinput/input/change events and fresh queries. The native setter already
existed; it was not replaced with direct `.value` mutation as a supposed fix.

`commitTurn` uses MessageChannel task boundaries rather than arbitrary sleeps.
This allows the input update and blur commit/render to finish before the next
focus operation. `probePersistence` blurs only the actual focused control or
descendant, does not refocus a wrapper, and leaves the safe peer focused instead
of artificially blurring it. It then re-queries and verifies stable values. No
React private state is read or changed, and synthetic events are not presented as
trusted user input.

After dependency-changing dropdown operations, earlier fields are read again.
Observed resets record `resetAfter` as sequencing evidence, **not proof of
causality** (photos can run concurrently). Only affected owned fields are repaired
after dependencies/photos settle; recovery orders dropdowns before restored text.
Trusted user changes protect the field and stop retries. There is no ongoing
observer refilling controls or overwriting later manual edits.

`verifyMyautoFields` and `verifyMyautoPersistence` read current controls and use
the same fitted description expectation, including during unrelated field retry.
An unverified selection is distinct from an observed reset or missing field.
Unverified/review-required fields cannot produce a falsely completed transfer.

## Dropdowns

Existing portal ownership, search, async and virtualized traversal, live cache
validation and manufacturer-before-model order remain. Explicit `data-value`
options/native options are accepted inside **already owned/linked scopes** as
well as ARIA options. Metadata IDs are checked against the observed selected ID.
No guessed MyAuto CSS selectors, arbitrary page text clicks, guessed IDs or
fabricated hidden-input values were added. The actual open MyAuto list structure
still requires verification. A component requiring trusted keyboard/pointer
events may need a different supported integration; this change adds no debugger
permission, private React access or repeated blind interaction.

## Model and description

`myautoModelName` uses the independently supplied base model only when the full
designation starts with that exact model plus independently verified trim and
additional descriptors. For the supplied example's structured data this gives
Model `Super Duty F-350` and Trim `XLT`, while preserving the complete original
title `2019 Ford Super Duty F-350 XLT Crew Cab Long Bed DRW`. It does not infer
separate cab/bed/rear-wheel properties from arbitrary title positions; those words
remain intact in the source title/description. `M5 Touring Wagon` stays unchanged
because `Touring Wagon` is not a separately verified trim. Exact real destination
options/custom inputs are still required; unavailable models remain unresolved.

`fitDescription` reads the current textarea's actual `maxLength`. It keeps whole
statements and the full identity line, prioritizes condition/damage/auction notes,
and omits lower-priority equipment when necessary. Oversized important notes are
never silently cut: the field requires review, the UI reports the omission and
the description directs the user to the source listing. Original details and the
full prepared description remain in the isolated transfer snapshot. VIN is
sanitized before fitting and before writing, and remains available only for the
dedicated VIN control. No source values are fabricated.

## Changed files for this task

- `packages/parsers/src/inputInteraction.ts`: `commitTurn`, `probePersistence`,
  `writeControlledInput` sequencing and user-edit guards.
- `packages/parsers/src/descriptionFit.ts` (new): limit-aware whole-statement fitting.
- `packages/parsers/src/myauto.ts`: `myautoModelName`, `myautoFields`,
  `fillMyautoForm`, `verifyMyautoFields`, dependency reset observation and repair order.
- `packages/parsers/src/dropdownDom.ts`: explicit-metadata options in owned scopes.
- `packages/parsers/src/dropdowns.ts`: clicked metadata-ID validation and unverified state.
- `packages/parsers/src/dropdownDiagnostics.ts`: unverified outcome.
- `packages/shared/src/index.ts`: unverified, reset and omission result metadata.
- `apps/extension/src/background/transfers.ts`: result validation and honest completion.
- `apps/extension/src/myauto/transfer.ts`: targeted repair of observed resets.
- `apps/extension/src/myauto/Summary.tsx`: unverified/omission feedback.
- `apps/extension/src/components/TransferProgress.tsx`: unverified counter.
- `packages/parsers/tests/formLifecycle.browser.ts` (new): targeted regressions.
- `packages/parsers/tests/reactForm.fixture.ts`: deferred-blur race and 4000-character limit.
- `packages/parsers/tests/fixtures/myauto.html`: confirmed `maxlength="4000"` only.
- `packages/parsers/tests/workflow.browser.ts`: include targeted regressions.
- `apps/extension/scripts/verify-transfer.mjs`: old-sequence reproduction and batched mode.
- This report.

Earlier uncommitted prefetch work was preserved. No Admin, dependencies, manifest
permissions, logo, launcher design or photo downloader/uploader implementation changed.

## Tests and acceptance

```
npm run typecheck -w @auto-importer/parsers
npm run lint -w @auto-importer/extension
npm run test -w @auto-importer/parsers
npm run build:extension
node apps/extension/scripts/verify-ui.mjs
AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 AUTO_BATCHED_TEST=1 AUTO_RETRY_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

Changed parser/shared/test TypeScript was also checked with the extension ESLint
configuration. All listed checks passed, including 19 built-UI fixtures and the
batched React/MV3 harness. `dist/manifest.json` and popup/content-script/worker
assets were generated; `git diff --check` passed. The browser suite covers text blur/peer-focus/rerender persistence,
model/trim and compound models, portal metadata/ID mismatch, description limits,
critical omissions, VIN exclusion, user-value protection, dependency reset
observation, targeted repair, prefetch identity/cache, independent jobs and photos.
The real React/MV3 harness reproduces old mileage loss and verifies new controlled
state after later operations, 15/15 uploads, one upload per vehicle, field-only
retry and zero submissions. The websites/options/upload acknowledgments are
simulated. These are real browser tests, **not real authenticated MyAuto tests**.

### Remaining live evidence needed

To determine and fix the exact current-site dropdown contract, capture only:

1. The opened Ford manufacturer trigger/control and its actual list/portal
   outerHTML, including option attributes and any search input.
2. The model list after Ford is selected, including the actual `Super Duty F-350`
   option and ID if present.
3. Selected controls immediately after selection and after another field/rerender,
   including tracking input **properties** (`value`, `checked`), ARIA state and
   native names/types. Closed markup alone cannot establish this contract.
4. Mileage/trim input markup and relevant public component onChange/onBlur or mask
   handler code; whether trusted native typing persists while synthetic events do
   not. Do not send VIN values, page scripts containing sessions, tokens or cookies.

Live acceptance remains: reload extension and tabs, transfer once into a fresh
authenticated form, click a second input/empty area, open/close dropdowns, let
photos finish, then recheck every value without submitting the listing. Until
that succeeds, the reported production bug is **not declared fixed** and no
reduction from the reported 23.9-second live duration is claimed.
