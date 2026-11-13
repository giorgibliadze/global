# Four mandatory vehicle specifications

## Actual MyAuto control contract

The supplied MyAuto HTML and its referenced public `main.f81b0e156752.js` confirm custom single-choice buttons, not dropdowns/native radios. Each button invokes React Hook Form `setValue(name, id)` and validation. The hidden registration input has no controlled value binding. The adapter clicks the real option and reads the source-confirmed selected-state output after a commit and final rerender verification. It never sets a CSS class or hidden input to fake a selection.

| Specification | Actual key | Accepted IDs |
| --- | --- | --- |
| Steering | `primaryFeatures.wheelTypeId` | 0 left, 1 right |
| Transmission | `primaryFeatures.gearTypeId` | 1 manual, 2 automatic, 3 Tiptronic, 4 CVT |
| Drivetrain | `primaryFeatures.driveTypeId` | 1 front, 2 rear, 3 4x4 |
| Doors | `primaryFeatures.doorTypeId` | 1 for 2/3, 2 for 4/5, **4** for >5 |

IDs come from the controls' testids, not the SVG labels. All four choices are prioritized before other choice fields. Existing text/dropdown/trim operations remain intact. The photo pipeline still starts after the automatic form operations settle; missing specifications produce field-level manual results without waiting/retrying indefinitely.

## Source extraction and conservative mapping

- Preserve original transmission/drivetrain strings, matching only complete known aliases. Manual/MT, Automatic/AT, Tiptronic/explicit manual-shift automatic, CVT/Continuously Variable Transmission are distinct. Generic automatics are never Tiptronic.
- Front/Rear/All/Four Wheel Drive and FWD/RWD/AWD/4WD map exactly. Hyphen/spacing/case differences are normalized. DRW is never treated as 4WD; it is not read from a model/title as drivetrain.
- The actual Manheim24 document has structured `doorCount: 4` and `doors: "4"`. Both original values are retained in raw data. Valid consistent integer counts map to the accepted MyAuto group. Conflicting/ambiguous counts stay unresolved and their original values are shown.
- No steering field or labeled steering DOM control exists in the supplied source sample. Steering remains missing there. If an existing selected-vehicle equipment entry explicitly equals LHD/Left Hand Drive or RHD/Right Hand Drive, it can supply the value. Conflicting left/right entries remain unresolved. Country, VIN, make, model and model title are never used to infer it. Typed prepared payloads can also carry an explicit `steeringWheel` string.
- Source values are retained separately from option IDs (`sourceValue` in prepared fields/results). The summary displays the original source value for unresolved fields. Existing user selections are protected; disabled/missing controls are skipped.

## Populated versus manual

In the original sanitized BMW source sample: **transmission Automatic → 2, drivetrain AWD → 3 and 4 doors → 2** are populated. **Steering requires manual selection**, because the sample has no verified steering evidence.

In the explicit-RHD test payload: **all four fields** populate and retain their committed values after another field is focused, rerender and 15-photo transfer. That payload is a test, not evidence that the user's BMW/Ford is right-hand drive.

## Modified files

- `packages/parsers/src/mandatorySpecifications.ts` (new): typed mappings, explicit steering evidence, door conflict handling and four field descriptors.
- `packages/parsers/src/manheim24.ts`: selected-vehicle door extraction and explicit equipment steering evidence.
- `packages/parsers/src/myauto.ts`: four mandatory descriptors; original values in partial results.
- `packages/parsers/src/stagedMyauto.ts`: choice priority, disabled-control guard and source-value preservation.
- `packages/parsers/src/validation.ts`, `packages/shared/src/index.ts`: normalized/metadata types and safe validation.
- `apps/extension/src/background/transfers.ts`: validate original-value result metadata.
- `apps/extension/src/myauto/Summary.tsx`: show original values for manual selection.
- Tests: `mandatorySpecifications.browser.ts` (new), sanitized Manheim24 fixture, staged/workflow tests, source-derived RHF fixture and built-MV3 harness.

## Validation

TypeScript, ESLint, full browser regressions and `npm run build:extension` pass. Regression coverage includes LHD/RHD, all four transmission groups, all four drivetrain aliases and their full names, 2/3/4/5/6/7 doors, DRW exclusion, ambiguous/missing data, original values, protected selections, focus/rerender retention, description skipping and unchanged photo flow.

The unpacked-MV3 run uses real Chrome messaging/storage, MyAuto's public RHF module and source-derived UI handlers. With `AUTO_SPEC_TEST=1 AUTO_LAZY_PHOTOS_TEST=1 AUTO_REACT_TEST=1 AUTO_RHF_MODULE=<temporary-public-RHF-module>`, all four fields persist in actual RHF state; both independent vehicles finish with 15 verified gallery photos. Websites/options/upload acknowledgments are simulated. Authenticated live-site success is not claimed.

No Admin files or publication behavior changed. No edits to the photo downloader/uploader, text adapter, dropdown adapter, description-skip or negotiable-price logic were needed.
