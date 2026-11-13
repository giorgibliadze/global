# Immediate transfer and form persistence

## Confirmed code findings

The source action previously required a preview and a separate confirmation. It
now sends `TRANSFER_BEGIN` on the first click. The background keeps the existing
selected-vehicle validation and fresh source identity check internally; no UI
confirmation or publication step is triggered. Concurrent requests for the same
selected vehicle are coalesced, active jobs are reused, and completed jobs have
a short duplicate-click cooldown. Different vehicles retain independent jobs.

The previous text filler already used native setters and bubbling input/change
events. The confirmed gap was its success criterion: a briefly correct DOM value
was sufficient, without blur or peer-field interaction. Custom dropdowns likewise
checked the selected label/ID without testing persistence after focus changed.
Final verification read values but did not exercise validation/focus lifecycle.
These gaps can conceal a DOM value that is not committed by the form.

The authenticated MyAuto component implementation was not available for live
inspection. This finding is about the extension's previous behavior, not proof
of MyAuto's exact handler/library or the sole cause of every reported reset.

## Implementation

- `inputInteraction.ts`: native owner-document setters, bubbling/composed
  input/change events, cancellable beforeinput, actual focus/blur/focusout and a
  safe text peer; fresh-node persistence reads with bounded retries. The alternate
  text interaction uses the supported selection API. No framework private state,
  synthetic trusted-event claims, or submit/action-button interactions.
- Dropdowns use their real options with pointer/mouse/click interaction, then
  verify both label and underlying value after blur and peer focus. Native
  selects and editable exact-model controls remain supported.
- The receiver verifies all completed fields again after photos. If later
  automation erased owned fields, one targeted recovery pass restores only those
  fields (plus a dependent model when necessary). Recovery is disabled after real
  user pointer/keyboard interaction. It never repeats photo work or creates a tab.
- Progress stores field results and distinguishes persisted, failed and unresolved
  values. Checkmarks and completed counts require `persisted: true`. Failure paths
  reread fields instead of retaining stale successes.
- Original manufacturer/full model, Georgian normalization, dedicated VIN,
  VIN-free descriptions, option discovery/cache and manual publication remain.

## Changed files

- `apps/extension/src/background/index.ts`
- `apps/extension/src/background/transfers.ts`
- `apps/extension/src/components/ImportAction.tsx`
- `apps/extension/src/components/TransferProgress.tsx`
- `apps/extension/src/myauto/Summary.tsx`
- `apps/extension/src/myauto/transfer.ts`
- `apps/extension/src/popup/PopupContent.tsx`
- `packages/shared/src/index.ts`
- `packages/parsers/src/inputInteraction.ts` (new)
- `packages/parsers/src/dropdowns.ts`
- `packages/parsers/src/modelField.ts`
- `packages/parsers/src/myauto.ts`
- `packages/parsers/tests/persistence.browser.ts` (new)
- `packages/parsers/tests/reactForm.fixture.ts` (new)
- `packages/parsers/tests/build-react-fixture.mjs` (new)
- `packages/parsers/tests/transfers.browser.ts`
- `packages/parsers/tests/workflow.browser.ts`
- `apps/extension/scripts/verify-transfer.mjs`
- `apps/extension/scripts/verify-ui.mjs`
- This report.

No Admin files, dependencies, logo, launcher design, or production build
configuration changed.

## Validation and reproducibility

```
npm run typecheck -w @auto-importer/parsers
npm run lint -w @auto-importer/extension
npx eslint --config apps/extension/eslint.config.js packages/parsers/src/inputInteraction.ts packages/parsers/src/myauto.ts packages/parsers/src/modelField.ts packages/parsers/src/dropdowns.ts packages/parsers/tests/persistence.browser.ts packages/parsers/tests/reactForm.fixture.ts packages/parsers/tests/transfers.browser.ts packages/parsers/tests/workflow.browser.ts packages/shared/src/index.ts
npm run test -w @auto-importer/parsers
npm run build:extension
node apps/extension/scripts/verify-ui.mjs
node apps/extension/scripts/verify-transfer.mjs
AUTO_REACT_TEST=1 AUTO_RETRY_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

Result: TypeScript, both ESLint checks, the full browser regression suite, the
extension build, all 19 UI fixtures, the saved-form MV3 harness, and the real React
MV3 harness with fuel-only retry passed. `dist/manifest.json` and bundled popup
and content-script assets were generated. `git diff --check` passed.

The browser suite covers accepted blur-committed values, bounded rejection and
reset detection, first-click background starts, concurrent deduplication, exact
models, optional trim, VIN privacy, isolated vehicles, photos and targeted retry.

The unpacked MV3 harness uses real Chrome messaging, storage, service worker,
content scripts and tabs. The new fixture uses the existing real React/ReactDOM
dependencies to model controlled state, mileage committed on blur, pointer-only
option selection, dependent model loading, and photo-triggered mileage/engine
reset. It asserts public fixture form state after another field and a forced
rerender, exact manufacturer/model, year/fuel/engine/cylinders, VIN-free description,
15 photos uploaded once per independent vehicle, and zero submissions. Fuel-only
retry must not reopen successful fields, redownload photos or create another tab.
The UI harness checks 19 popup/launcher fixtures, including no confirmation UI.

All sites/options/upload-server acknowledgments in these harnesses are simulated;
no authenticated live MyAuto success is claimed. Historical performance numbers
were not regenerated: the transfer timer now starts at the first click rather
than at the former confirmation click.

For live review, reload the unpacked extension and both source/destination tabs,
select a Manheim24 vehicle, and click once. On the new MyAuto form, check values
after clicking another field/empty area, opening and closing a dropdown, and
photo completion. Verify unresolved fields manually and publish only yourself.
