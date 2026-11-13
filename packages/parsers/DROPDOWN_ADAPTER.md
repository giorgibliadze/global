# MyAuto dropdown adapter update

The existing saved MyAuto form establishes custom `div` controls, selected-label spans, tracking inputs and initially hidden search inputs. It does **not** establish which component library is used or contain any opened option lists. The public add-page fetch exposed no inspectable dropdown content, and the companion page reported no connected document/browser. A read-only Chrome automation check found two existing MyAuto listing tabs, but Chrome refused DOM access because “Executing JavaScript through AppleScript is turned off.” No browser security setting was changed. Authenticated live dropdown inspection remains unavailable until the user enables that browser capability or supplies the opened dropdown DOM.

The old adapter only inspected descendant `role="option"` elements or a directly linked `aria-controls` listbox. It did not follow `aria-owns`, relationships to portal wrappers, `aria-labelledby`, newly opened unlinked listboxes, search inputs or virtual scrolling. It also failed immediately when a dependent control was disabled. These are confirmed adapter limitations; which limitation matches MyAuto's current opened menu remains subject to live DOM inspection.

## Behavior

- Keep the confirmed `single-select-primaryFeatures.<key>` owner and `single-select-trigger-primaryFeatures.<key>` trigger anchors. Prefer an actual nested combobox/button when present.
- Wait for a visible, enabled control and its asynchronous options within a deadline. Fill manufacturer, model, year, fuel, displacement, cylinders and body sequentially.
- Discover accessible options inside the owner, through `aria-controls`/`aria-owns` (including portal wrappers), and via listbox `aria-labelledby`. An unlinked portal is eligible only if it is the single newly visible semantic list, the opened control has focus/expanded evidence, and no relationship points to another field. Existing unrelated menus and ambiguous new portals are ignored.
- Use the observed `single-select-search-primaryFeatures.<key>` only after it becomes a visible writable search input. Also support owned semantic search/combobox inputs. Use native input setters and bubbling DOM events, not React internals.
- Traverse one confirmed scroll pane for virtualized results. Use MutationObserver plus bounded polling, controlled search queries and one reopening retry. Never repeatedly click a selected option.
- Verify both the selected label and the site's `single-select-input-primaryFeatures.<key>` value after the component updates. A click alone is not success. Keep final whole-form verification.
- Native selects use the same exact/equivalent/unit mappings and bounded async verification.
- Exact model matching remains mandatory. A short `Ranger` option does not silently replace an extracted `Ranger XLT Crew Cab Medium Bed`. The saved `primaryFeatures.customModel` is trim, not a verified custom Model input.

The user confirmed cylinders 1–12 and the engine volume UI range 0.05–13. The MyAuto engine control is treated as a liter-valued domain: normalized 2300 cm³ matches an actually rendered `2.3` option; 4400 cm³ matches `4.4`. Only this explicitly configured engine control permits bare numeric liter labels within that range. Arbitrary numeric labels in other controls do not acquire units. Search derives liters even if the original displacement label is unavailable. No option IDs are generated from these numbers: accepted IDs are read from the actual form.

## Diagnostics and limits

Each custom/native selection emits `[Auto Importer dropdown]` with an allowlisted field/selector, control type, opened state, option count, sanitized expected candidates, matching/verification booleans and a bounded outcome code. It never logs raw HTML, option contents, exception objects, VINs, cookies or tokens. VIN-shaped/encoded/formatted expected values are redacted. UI failure messages remain Georgian and distinguish unavailable controls, missing options, missing matches, ambiguity and rejected selection.

Still requiring live inspection for **manufacturer, model, year, fuel, engine volume and cylinders**: actual opened option markup and portal relationships; whether non-semantic options need a site-specific stable selector; accepted option IDs; search behavior; dependency loading; engine unit labels; and availability of the complete original Model/custom input. If the live menus have neither semantic roles nor verified relationships, the adapter reports them unresolved rather than clicking global text or guessing CSS selectors. No library-specific selector was invented.

## Validation

`tests/dropdowns.browser.ts` covers portals via ownership/labels and unlinked lists, searchable comboboxes, async options and disabled dependencies, virtual scrolling, controlled retries, unavailable/ambiguous options, actual selected-value verification, numeric units, native async controls and safe diagnostics. A Ford/full Ranger fixture verifies manufacturer → model → year → gasoline → 2.3 L → four cylinders sequentially, retaining dedicated VIN and VIN-free Georgian description.

`apps/extension/scripts/verify-transfer.mjs` now exercises custom portal dropdowns rather than replacing them with native selects. It loads the real unpacked MV3 extension, blocks external DNS, intercepts all web traffic with sanitized fixtures, and verifies real Chrome messaging/storage, all six dropdown values, automatic photo transfer and independent vehicles A/B. Portal/options and server upload acknowledgments remain simulated. This does not claim authenticated MyAuto success.

Modified files for this task:

- `packages/parsers/src/dropdowns.ts`
- `packages/parsers/src/dropdownDom.ts` (new)
- `packages/parsers/src/dropdownDiagnostics.ts` (new)
- `packages/parsers/src/modelField.ts`
- `packages/parsers/src/myauto.ts`
- `packages/parsers/tests/dropdowns.browser.ts` (new)
- `packages/parsers/tests/workflow.browser.ts`
- `apps/extension/scripts/verify-transfer.mjs`
- `packages/parsers/DROPDOWN_ADAPTER.md` (new)
- `packages/parsers/README.md`

Manheim extraction, photo transport/uploader implementation, VIN sanitization, translations, launcher/branding and Admin files were not changed by this task.

After rebuilding, reload the unpacked extension, refresh source/destination tabs, then transfer and confirm a vehicle. On MyAuto, inspect the manufacturer and model labels/accepted values first, then year, fuel, engine and cylinders. Keep final publication manual. If a control fails, its sanitized diagnostic identifies discovery versus matching versus verification failure; inspect only that opened control/menu DOM, excluding page scripts and session data.

Final checks passed: parser TypeScript checks; extension TypeScript checks through `npm run build:extension`; extension ESLint and explicit parser/shared/test ESLint; `npm run test -w @auto-importer/parsers`; 19 built popup/launcher fixtures; and two complete isolated MV3 fixture transfers with custom portals and all six dropdown values verified. Manifest, popup and content-script assets were regenerated. The Ford test uses a synthetic normalized vehicle record to test the adapter; it is not a claim of parsing a newly supplied Ford HTML fixture. The user elected to finish without live-site verification after Chrome blocked Apple Events JavaScript access.

## User-supplied manufacturer/year catalog

`src/myautoCatalog.ts` retains the complete manufacturer label list supplied by the user, including its punctuation and spelling. Only case/whitespace normalization identifies a corresponding display label; source manufacturer/model values are not rewritten and partial/related names are not substituted. The catalog supplies display/search candidates and useful Georgian failure hints, never option IDs.

The known year range starts at 1990 and ends at the current browser calendar year (at least the confirmed 2026 baseline). It therefore grows to include 2027, 2028, etc. without a new extension build. This is reference data, not a restriction on live options: a newly added brand or future model-year option can still be selected if the actual form exposes an exact match. No missing/unsupported source year is replaced with a default year.

Regression coverage checks manufacturer spelling, case-only mapping without source mutation, distinct related names, 2026/2027/2030 year boundaries, and acceptance of newly available live labels. Files changed for this follow-up: `src/myautoCatalog.ts` (new), `src/myauto.ts`, `tests/dropdowns.browser.ts`, and this document. The parser, images, description privacy, Admin and popup design are unchanged.
