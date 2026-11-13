# MyAuto staged adapter — current source evidence and validation

The newly supplied current HTML and its public MyAuto bundles provided the missing component evidence. The implementation uses that contract without private React state, session data, dependencies or authenticated page scripts in the repository.

## Confirmed mechanisms

- `main.f81b0e156752.js` native inputs use React Hook Form Controller. Mileage parses integers and limits to six characters. A native value setter followed by one bubbling input event commits it; focus/change/blur sequences are unnecessary. The description commits the selected locale into an object and has a 4,000-character limit.
- Dropdown registration inputs have a ref and onBlur, but no controlled value binding. Their empty DOM value does not mean selection failed. Named option clicks commit `{id,title}`; rendered label and clear control reflect that state. Options are named testids, without the generic ARIA roles previously searched for. Disabled parent group headings are excluded.
- Manufacturer changes clear and reload models. The adapter serializes that dependency and matches actual options without shortening original model names. Cached metadata remains a hint; a live matching option is required.
- Choice controls commit through setValue and render confirmed selected-state classes.
- The source loading wrapper leaves controls in the DOM while invisible/noninteractive. Readiness now observes class/style changes and checks visibility before writing.

The original discovery path could spend full deadlines looking for another option contract, then incorrectly reject committed selections through empty registration inputs. It also repeated persistence probes/focus operations. This is demonstrated against the supplied source contract. Authenticated live reset behavior was not observed, so a specific live rerender cause is not claimed.

## Implementation

`TextInputAdapter.ts` resolves native controls, commits one batch and verifies controlled render evidence. `DropdownAdapter.ts` handles the actual menu/option/selection contract once per field. `myautoContract.ts` centralizes evidence. `stagedMyauto.ts` orders text, dependent dropdowns and choices; the transfer controller performs the final read after parallel photo work. At most one targeted repair runs, followed by verification of those fields only. Manual edits remain protected. The existing compatibility adapter remains for other contracts.

Description fitting, Georgian translations, VIN sanitization, exact source identity/model preservation, metadata caching and the existing automatic photo downloader/uploader remain intact. VIN is written only to its dedicated field. No publication action occurs. Prepared fields are reused rather than renormalized per control.

MyAuto uses a different mobile modal below 768px. This desktop contract adapter returns an explicit unverified dropdown result before opening that unknown modal. Text/photo transfer continues. Mobile modal selection requires separate verified evidence; it is not claimed supported.

## Validation

- Parser TypeScript and extension TypeScript/build: passed.
- Extension ESLint: passed.
- Complete parser/browser workflow regressions: passed, including 16 supported fields, no per-field focus/change probes, one menu, targeted recovery, manual-edit protection, maxlength, VIN privacy and independent vehicle transfers.
- Actual public RHF module (80824 from `847.513e96b52f98.js`) exercised in isolated Chrome with source-derived handlers: mileage survives rerender; manufacturer commits while ref.value remains empty.
- Built MV3 extension: two independent vehicles; source → real extension storage/messages → destination claim → 16 verified fields → 15 verified photos → final verification passed. Missing fuel retry touches only fuel, without a new tab or repeated photo download/upload.
- These are simulated website/server fixtures using real Chrome extension APIs, not authenticated live Manheim24/MyAuto acceptance.

Measurements: [raw numeric results](myauto-staged-measurements.json). Vehicle A: form filling 243ms, first mileage 789ms after click, all 15 photos verified at 2,768ms, completed result 2,918ms. Vehicle B: form filling 189ms, result 2,889ms. Text/photo stages overlap; do not sum them. Earlier failing control took about 21 seconds, but viewport/fixture conditions differed, so no matched speedup percentage is claimed.

To reproduce public-module verification, download only the referenced public vendor bundle to a temporary file, run `node apps/extension/scripts/prepare-myauto-contract.mjs <vendor.js> <temporary-rhf-body.js>`, then set `AUTO_REACT_TEST=1 AUTO_RHF_MODULE=<temporary-rhf-body.js>` when running `node apps/extension/scripts/verify-transfer.mjs`. Add `AUTO_RETRY_TEST=1` for partial retry. No authenticated HTML fixture or session data is needed.

For live acceptance, reload the built extension and both site tabs; select a vehicle, transfer, then interact with mileage, manufacturer/model and another field. Check retained values, exact model or explicit unresolved result, Georgian description without VIN, dedicated VIN and 15 photos. Repeat with another vehicle. Final review/publication remains manual. This live step remains unverified.
