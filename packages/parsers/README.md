# Manheim24 → MyAuto transfer: exact identity and Georgian normalization

This implementation uses the authenticated HTML supplied by the user as DOM evidence. The original HTML, page scripts, account data, authentication cookies, and tokens are not in the repository. The Manheim document is the source for vehicle selectors; the pasted Georgian MyAuto form is the source for destination controls.

**Implementation is not live verification.** Local Chrome fixtures verify the parser, adapters, photo bytes, retries, IndexedDB cleanup, and transfer isolation. No connected authenticated browser/document session was available. The public MyAuto JavaScript URL referenced by the snapshot returned HTTP 403; it was not bypassed. Closed-dropdown and empty-uploader markup do not establish every live interaction. The adapter reports unverified fields/uploads instead of pretending a complete live transfer succeeded.

## Actual Model field and VIN privacy correction

The complete original model must populate the actual **Model** control: BMW / **M5 Touring Wagon** remains BMW / **M5 Touring Wagon**, never M5 or 5 Series. No suffix is moved to trim, body or description as a substitute for a successful model mapping. A source-derived body field and a descriptive mention of the full model may still exist independently; neither counts as filling Model.

`modelField.ts` adds runtime capability checks:

- A visible writable text input/textarea named `primaryFeatures.model` is filled with the full original model through native setters and input/change/blur events, then rechecked. The known model tracker is only eligible when it actually exposes a visible, explicitly labeled Model textbox. Hidden inputs, search inputs, read-only controls, select search boxes and unverified comboboxes are not treated as custom-model support.
- A real native `select[name="primaryFeatures.model"]`, if present, selects only the exact full text and uses its actual option value. Native manufacturer selects are likewise supported.
- The existing custom dropdown adapter now uses strict full-text Model matches, not case-folded/similar model-name matches. Its actual accepted ID is verified separately from source identity.
- Application-generated defaults may be corrected only on an initially empty, explicitly new transfer form. Existing/user-edited values remain protected. Unknown custom-control semantics stay unresolved rather than accepting a search query as a model.
- `primaryFeatures.customModel` is still the confirmed **trim** field. Its name does not establish custom Model support. If no exact option or supported writable Model control exists, the Model result is unfilled; description/trim/body are not a fallback success.

The old description explicitly inserted `VIN: ...`. That template line is removed. `vinPrivacy.ts` now sanitizes the completed generated description, including all dynamic notes, equipment, copied specifications, optional packages and source text. It removes the selected VIN, other VIN-shaped tokens and the English/Georgian VIN labels. Detection uses a normalized shadow with original-character offsets: mixed case, spaces/dashes, zero-width characters, numeric HTML entities, percent encoding and compatibility/full-width forms can be removed without normalizing unrelated model names or option wording. The ordinary 8+9 displayed VIN layout and other labeled layouts are covered. Remaining non-VIN lines are retained readably; the sanitizer is idempotent.

The adapter sanitizes immediately before insertion, enforces privacy again after filling, and checks again before final verification (after photo work). Site-generated description text containing a VIN is cleaned too; a site that continually reinserts identification data yields an explicit unverified/error result, not success. The dedicated `input[name="primaryFeatures.vinCode"]` remains the only VIN destination. If unavailable, that field is reported unfilled internally; form readiness no longer requires inventing another VIN destination. Other text/model fields reject VIN-bearing values. VIN extraction, validation, source review and internal transfer identity are unchanged. No VIN is ever deliberately substituted into another field or the listing description.

All Georgian technical dictionaries, original manufacturer/model extraction, numeric conversions and photo download/upload modules remain unchanged by this correction. The live source snapshot still contains only the closed custom model control, so native/custom variants are tested as explicit local capability fixtures, not claimed to have been observed on live MyAuto. No authenticated browser session was available for live verification.

## Accuracy fix: root cause and exact behavior

The old parser read `models[0]` (the broad catalog label `M5`) and ignored the selected record's `designatedDescriptionEnrichment.manheimStandardDescription.shortDescription` (`2026 BMW M5 Touring Wagon`). This lost the full marketed model name passed to MyAuto. The example's seller trim is `Base`, and body is separately `Wagon`; neither is a substitute for the full model. The old description printed raw English technical values. Dropdown matching also put exact labels and equivalents at the same priority, and final verification did not retain the accepted option ID.

`identity.ts` now reads only the selected visible detail container and VIN-matched structured record. Manufacturer/model/trim remain original strings, not translations. It preserves both full model `M5 Touring Wagon` and catalog `M5`. The full designation is obtained from the observed structured short-description field by removing only the exact independently verified year/manufacturer prefix; this is not arbitrary title tokenization. The visible title must agree. Explicit trim tokens are not appended to a model as though they were model words. The VIN-matched structured full designation is authoritative over a broader catalog family, including a catalog family named 5 Series; that family is preserved only as catalog metadata and never substituted for M5 Touring Wagon. Explicit full model fields likewise are not shortened. Unsafe VIN/manufacturer/selected-title evidence still blocks transfer. Optional trim ambiguity no longer blocks: fullModelName is retained and trim becomes null when it cannot be independently verified; see MODEL_DESIGNATION.md. Missing manufacturer/model or placeholder values block transfer; no hardcoded fallback or title-only guessed identity exists. Hidden vehicle roots/fields and ambiguous visible duplicates are rejected/ignored as appropriate. The sanitized fixture now includes the real enrichment shape with a synthetic VIN.

`normalization.ts` is the typed, shared exact-phrase dictionary for fuel, gearbox, drivetrain, colors, body, interior, condition, equipment, damage terms and auction notes. `reviewDetails` and `vehicleDescription` use the same terms. Examples: Plug-in Hybrid → დამუხტვადი ჰიბრიდი, Gray → ნაცრისფერი, AWD → სრული ამძრავი. Manufacturer/model/trim/VIN and official uncertain package names remain unchanged. Unknown wording is preserved and explicitly unresolved; there is no word-by-word replacement or invented translation. Original details and units stay in `raw` and `original`, not overwritten with MyAuto IDs.

MyAuto dropdowns rank exact source matches first, then explicit verified equivalents for technical categories. Model families/prefixes are not equivalents: `M5` and `5 Series` cannot replace `M5 Touring Wagon`. Actual accepted IDs are read back from the website's own tracking inputs and saved in `FieldResult.optionId`, along with the observed label and match kind. Both label and ID are checked again after dependent controls render. An exact model may replace a broad VIN-decoder selection only on an initially empty, explicitly new transfer form; existing listings and user-edited controls remain protected. That VIN-decoder behavior is covered by a local simulation, not asserted as a live observation of the user's failure.

The saved MyAuto field named `primaryFeatures.customModel` is visibly labeled **კომპლექტაცია**. It is therefore retained for trim (`Base`), not guessed to be a custom-model fallback. No dedicated custom-model control is established by the supplied HTML. If the exact model or an actually supported writable Model control cannot be confirmed, Model remains unresolved. Mentioning the model in the description is not counted as filling Model, and no unrelated option is selected. The extension cannot guarantee that MyAuto's own VIN decoder will clear an unsupported broad default; an unresolved model must be reviewed manually and is never reported as success.

Numeric conversions still operate only on explicit odometer/displacement fields. A model `500L` or trim `4.4i Black Edition` never becomes a numeric specification. Engine options need explicit L/cc units. Georgian UI terms are not written as fabricated option IDs. Known source option IDs remain platform-specific mappings; all source names remain separately preserved.

## User workflow and stages

1. Build and reload `apps/extension/dist` in `chrome://extensions`; refresh existing source/destination tabs.
2. Authenticate normally on both sites. Open a single rendered Manheim24 vehicle detail panel.
3. Click **MyAuto-ზე გადატანა**. The existing light interface displays original manufacturer/model/trim, original extracted fields, Georgian normalized fields, missing/unresolved details, equipment and auction notes.
4. Review and confirm **დადასტურება და გადატანა**, or cancel. Review alone opens no destination and writes no MyAuto form fields.
5. Confirmation rereads the selected source vehicle and compares the normalized snapshot, including exact identity and specifications. If a vehicle or its details changed after review, transfer stops and requires a new review. Reviews expire after five minutes and are bound to the source tab.
6. Confirmation opens the existing isolated MyAuto/photo pipeline. Inspect verified/unfilled fields and photos; final publication is manual.
7. For Vehicle B, perform a fresh review. In-flight transfers with an identical full snapshot reuse their destination; a different model/trim/specification snapshot cannot reuse Vehicle A's data.

The UI uses real stages: **ავტომობილის მონაცემების წაკითხვა**, **ფოტოების მომზადება**, **MyAuto-ს გახსნა**, **მონაცემების შევსება**, **ფოტოების ატვირთვა**, **შედეგის შემოწმება**, **მზადაა გადასამოწმებლად**. Counts represent downloaded files and verified uploads, not invented percentages. Unconfirmed results never receive the ready stage. Before confirmation, the review is held separately from transfers. The source progress poll exists only while its React UI is mounted and the job is running.

## Extracted vehicle evidence

The parser scopes to exactly one visible `.VehicleDetails__container` containing `[data-testid="vdp-title-text"]`. It reads that container's `.StockWaveInfo.stockwave-vehicle-info` JSON, including VIN-matched designated-description enrichment and specific detail attributes. A valid visible `vdp-vin` must agree with the embedded VIN; conflicting odometers and ambiguous detail panels fail. Extraction rereads the current DOM on every click, not a cached result-list item, so hash routes and dynamically replaced vehicle details are supported.

| Data | Confirmed source / fixture |
| --- | --- |
| Identity | `vdp-title-text`, `vdp-vin`; JSON/enrichment identity fields and structured standard short description: 2026 BMW M5 Touring Wagon; catalog model M5; seller trim Base |
| Mileage | JSON `odometer`, `odometerUnits`; actual `vdp-decription-info` spelling: 1,048 mi → 1,686.592512 km. The structured unit is blank, so visible `mi` supplies evidence; unknown units are not guessed. MyAuto integer entry rounds to 1,687 km. |
| Engine | `engineDisplacement`, `engineType`, matching `card-view-*` attributes: 4.4 L → 4,400 cc, 8 cylinders |
| Fuel / gearbox / drive | `engineFuelType`, `transmission`, `driveTrain`: Gasoline Plug-In Hybrid / Automatic / AWD |
| Colors / interior / body | `exteriorColor`, `interiorColor`, `interiorType`, `bodyStyle`: Purple / Black / Leather / Wagon |
| Condition | `conditionType`, `conditionGradeNumeric`: With Condition Report, grade 5 |
| Damage flags | Explicit `hasFrameDamage`, `salvageVehicle` booleans. `false` remains a source report, not a certification of no accidents/damage. Detailed damaged-part/repair data is not supplied by these fields. |
| Equipment | Actual `.standard-equipment li.cr-component-options` descendants (115 in the source); allowlisted structured arrays if supplied. Optional-package header/count summary comes from `#optional-package-and-equipment-section`. Hidden package names are not invented. |
| Announcements | `announcementsBySource[].text`, e.g. Previous Canadian. Account/source metadata around those entries is excluded. |
| Auction | `auctionName`, `auctionStartTime`, `auctionEndTime`, `sourceStatus` |
| Price | `buyNowPrice` + `currency`: 118,000 USD, explicitly buy-now rather than a completed sale or a retail asking price |
| Description | `comments`/`remarks` only when supplied. They are absent in the original example; the MyAuto adapter separately generates a labeled summary including equipment, source notes, auction and auction-price context. |
| Photos | Actual `#fyusion-prism-viewer img[src]` and `images[].largeUrl`, in observed order, capped to 15 selected URLs. `availableImageCount` records the deduplicated available count. |

Original values/units are preserved in an allowlisted `raw` record. Raw account state and arbitrary scripts are never copied. Equipment/announcements are bounded arrays; runtime validation rejects malformed numeric values, unsafe image URLs, unexpected raw keys and obvious credential-shaped strings. Original VIN, listing ID and image-group identifiers are replaced by synthetic equivalents in fixtures.

## Photo transfer implementation

- Only the observed HTTPS image hosts `i.fyuse.com` and `images.cdn.manheim.com` have added host permissions. Source cookies are never read or forwarded manually.
- Source filtering excludes data placeholders, thumbnail elements, video tag images, icons/logos, foreign hosts and credential-bearing URLs/query parameters. Existing high-resolution variants replace duplicate lower-resolution URLs in place; unobserved original-image URLs are never manufactured.
- Worker fetch uses `credentials: 'include'`, the browser's normal domain/SameSite rules, no referrer, no custom authentication headers and no redirects. Requests use no private API endpoints. Signed/unknown query parameters and redirected hosts require further evidence rather than weakening access controls.
- Downloads have an 8-second attempt timeout and at most three attempts for transient network/5xx/429 failures. HTTP 401/403 is not retried/bypassed. JPEG/PNG/WebP magic bytes establish MIME; HTML login/error pages are rejected. Maximum size is 15 MiB per image and 15 such files per transfer. Oversize/quota failures are explicit; files are not recompressed or altered.
- Binary data is staged as per-transfer/per-index Blobs in extension-origin IndexedDB, not in `chrome.storage.session` or a single huge message. Session storage holds only vehicle/progress metadata. Chunk responses are at most 192 KiB before base64. The destination reassembles, SHA-256 checks and creates Files with correct MIME and transfer-specific filenames.
- The confirmed input is `[data-testid="photo-video-dropzone"] input[type="file"]` inside `[data-testid="photo-video-container"]`, **not** the adjacent non-file `photo-video-input` tracker or VIN photo input. Files are assigned through DataTransfer, followed by bubbling `input`/`change` events.
- Success requires the site's photo count to match and the same number of new, unique, fully loaded HTTPS image previews inside that container, with no busy/progress/error indicators and a short stable interval. Static `/build/assets/` icons, SVGs, small icons and tracking pixels are excluded; qualifying remote previews require at least 128 natural pixels in width. Local blob/data previews and `input.files.length` alone are never success.
- Upload retry is limited to one extra assignment, only after the site explicitly reports failure and clears its input queue, count and previews. Unknown/pending state, partial galleries and timeout-only outcomes are never blindly retried, preventing duplicates.
- If the live widget uses background images, tiny thumbnails, a portal outside the confirmed container, different counters, trusted-gesture-only events or different completion semantics, the result remains **unverified**. The exact observable failure appears in Georgian. Inspecting an actual uploaded gallery is required before adapting those structures; no success is claimed from an assumption.

Temporary blobs are deleted on finish/failure or destination-tab close. Records expire after 30 minutes; a one-shot alarm and startup/next-operation cleanup remove expired and orphaned data. Active state is capped at four transfers. Source-tab closure does not cancel an already-started destination. Tab/document binding and one-time claiming prevent another tab or a refreshed document from reusing a job. Nothing is sent to an external relay, sync storage or a URL query string.

## MyAuto confirmed mappings and verification

| Field | Actual control |
| --- | --- |
| VIN | `input[name="primaryFeatures.vinCode"]` |
| Trim | `input[name="primaryFeatures.customModel"]` |
| Mileage | `input[name="primaryFeatures.mileage"]`, with confirmed km display or successfully selected km option |
| Description | `[data-testid="description-textarea"]` |
| Manufacturer/model/year | `single-select-trigger-primaryFeatures.manufacturer`, `.model`, `.issueYear` data-test IDs |
| Fuel/engine/cylinders/body | `single-select-trigger-primaryFeatures.fuelType`, `.engineVolume`, `.cylinders`, `.vehicleCategory` data-test IDs |
| Transmission | Confirmed `single-checkbox-primaryFeatures.gearTypeId-*` IDs; Automatic=2, Manual=1, CVT=4 |
| Drivetrain | `single-checkbox-primaryFeatures.driveTypeId-*`: front=1, rear=2, AWD/4WD=3 |
| Exterior / interior / material | Confirmed `vehicleColorId-*`, `saloonColorId-*`, `saloonMaterialId-*` controls. Source fixture Purple=19, Black=16, Leather=1. |

Text uses native setters plus React-compatible bubbling input/change events, and is rechecked after rendering and again at the end. Make is selected before model; model is skipped if make cannot be verified. Exact English/Georgian semantic candidates are only used to match **real rendered options**, never to invent an option ID. Engine selection requires explicit liter/cc units; a bare number does not establish units.

The source HTML does not contain open dropdown options. Runtime discovery therefore only selects exact visible `[role="option"]` entries owned by a confirmed component, or a listbox explicitly related through `aria-controls`; it never searches/clicks arbitrary global text or guessed CSS classes. The component's actual selected-value span must confirm the result. The fallback is an explicit unfilled result if its custom menu has no accessible ownership/option evidence.

Fixed custom choices count as filled only when the corresponding confirmed tracking input reports the exact expected ID. Existing text/selections are preserved. The final verification detects fields cleared by dependent rerenders. Condition, equipment and announcements are included in the generated description when no confirmed dedicated control mapping exists. Auction buy-now price is not silently repurposed as a retail asking price/currency.

## Remaining live compatibility blockers and reproduction

1. **Dropdown option structure:** On a fresh authenticated MyAuto add page, open manufacturer, then model after selection. Inspect the component and any portal list. The saved HTML lacks option markup/IDs, dependency loading and selected-state transitions. If no owned accessible options appear, the adapter reports the exact unverified control. Supply the opened control + list DOM (without page scripts/auth state) to establish a precise custom-option adapter.
2. **Completed uploader structure:** Transfer one authorized vehicle photo, then inspect the confirmed photo container and real upload progress/completion/error DOM. The saved page has zero photos. A local blob preview is insufficient; if the real server gallery differs from the runtime checks above, uploaded previews cannot be certified yet. This is the primary blocker to asserting live automatic photo completion.
3. **Image access:** Check the request result in the extension worker without copying cookies/tokens. HTTP 401/403, blocked SameSite access, unknown signed parameters, redirects, unsupported bytes, oversized files and quota limits are reported rather than bypassed. The referenced public MyAuto script itself returned 403 during this task, so it provided no additional trustworthy component evidence.
4. **Dedicated equipment/condition and asking price:** Their exact taxonomy/control semantics are not established. Data is retained in description/results, and dedicated unknown fields remain unfilled rather than guessed. The ready state is withheld whenever fields or uploads remain unconfirmed.

After those structures are established, run two different real vehicles A/B in the same session, verify VIN/model/year/mileage and every selected field, verify all photo previews and upload completion, then inspect a second fresh destination. Review/publish manually. Inspect source content-script, destination content-script and worker consoles without logging raw HTML or session data.

**No live authenticated end-to-end test was performed.** Exact identity and translation fixes are verified by the sanitized fixture/regression suite; MyAuto live option IDs and gallery behavior remain subject to the existing evidence limits. The complete production behavior cannot honestly be signed off until the missing live control/gallery evidence and two-vehicle test are available. The code attempts the automatic supported path and reports actual failures; manual photo upload is not substituted and called an automated success.

## Validation

From the monorepo root:

```sh
npm run typecheck -w @auto-importer/parsers
npx tsc -b apps/extension/tsconfig.json
npm run lint -w @auto-importer/extension
npx eslint --config apps/extension/eslint.config.js packages/parsers/src packages/parsers/tests/*.ts packages/shared/src
npm run test -w @auto-importer/parsers
npm run build:extension
node apps/extension/scripts/verify-ui.mjs
```

Tests run a separate local Chrome profile with no authenticated accounts. The workflow runner uses local DevTools polling so real IndexedDB and asynchronous uploader tasks can settle; fixture fetches and uploader DOM/state transitions are simulated. It covers parsing, conversions/missing fields, equipment/damage provenance, image filtering, one-click UI, runtime validation, A/B IDs/tabs/documents, byte/name/hash separation, bounded chunks, retries/denials/size rejection, async dropdowns, populated-form protection, actual FileList assignment, remote-gallery/count verification, local-only preview rejection, upload retries and cleanup. Simulation is explicitly distinct from live MyAuto verification.

## Modified files in the Model-field/VIN correction

- `packages/parsers/src/modelField.ts` (new): supported writable/native Model and manufacturer controls.
- `packages/parsers/src/vinPrivacy.ts` (new): description-only VIN detection/redaction.
- `packages/parsers/src/myauto.ts`: actual Model integration, sanitized generation/insertion/final checks, missing VIN handling and result verification.
- `packages/parsers/src/dropdowns.ts`: strict full-text Model matching.
- `packages/parsers/tests/modelPrivacy.browser.ts` (new): model mapping and VIN privacy regressions.
- `packages/parsers/tests/workflow.browser.ts`: includes the new regression suite.
- `apps/extension/src/myauto/index.tsx`: final description privacy enforcement and form readiness when a dedicated VIN input is missing.
- `packages/parsers/README.md`.

The build regenerates `apps/extension/dist`. No additional dependencies, Georgian dictionary changes, Admin files, logo/icon changes, launcher changes or photo transfer implementation changes were introduced.

Regression coverage includes full model text in an editable Model control, exact native/custom dropdown choices, no shortened model fallback, trim remaining Base, only the dedicated VIN field receiving the code, dynamic-note and encoded VIN removal, later site-generated VIN cleanup, readable descriptions and missing VIN controls. Existing identity, translation, unit conversion, stale-review and photo isolation/upload tests remain part of the suite.

## Transfer regression investigation

Compared the current working tree with Git revision `e7fa1bc` (`manheim24 starter implementation before fix`). The recent model/privacy edits do not change the source parser or vehicle validator. That revision is the available comparison point; it is not independently established as a working live deployment.

Root cause reproduced with the **actual unpacked MV3 extension and real Chrome APIs**: `chrome.storage.session` reordered top-level and nested object keys. `vehicleSnapshot` compared raw `JSON.stringify()` output, so the persisted review differed from a fresh, unchanged source parse purely by insertion order. Confirmation was rejected before `tabs.create()`. The earlier in-memory storage mocks used `structuredClone`, retaining insertion order and hiding this defect. Snapshot serialization now sorts object keys recursively while preserving values and array order. Regressions also serialize/reorder nested storage data; real vehicle changes continue to require a new review.

Additional confirmed fixture failures:

- The MyAuto receiver awaited every photo download before filling any vehicle fields. A deliberately held photo response reproduced an entirely empty form. The receiver now fills the supported fields first, then prepares/uploads photos through the existing binary transport and uploader.
- A rejected dedicated VIN field aborted photo upload. It now remains an individual unfilled field; a genuinely different nonempty VIN or changed destination still stops the transfer to protect vehicle isolation.
- Source preview creation depended on optional photo-cache cleanup. A failing photo cache prevented extraction from running at all. Metadata validation remains required, while optional cache cleanup no longer gates source preview creation.

The production receiver orchestration is shared with `tests/receiver.browser.ts`. This regression runs the actual source parser listener, JSON message serialization, review/validation, tab-bound claim, form filling, photo transport/upload verification and completion for independent vehicles A/B. It includes rejected/missing VIN controls, VINs in source descriptions, delayed photos, runtime-message retries and cache cleanup failure. Photo server completion uses simulated loaded remote previews plus the widget count; it is not proof of a real MyAuto upload.

Development logs contain only an allowlisted transfer ID (or `pending` before identification), pipeline stage and event. No VINs, URLs, payloads, exception messages, cookies or tokens are logged. Source read failures report a Georgian error instead of a raw Chrome exception. Destination claim failures retry briefly and then display a Georgian connection error rather than disappearing silently.

The user supplied a fully populated Ford Ranger preview and reported an error after confirmation. This located the reported stop between preview and opening. The real-Chrome fixture then reproduced the storage/snapshot comparison defect at precisely this boundary. The authenticated Ford transfer itself has not been tested. Confirmation controls now appear before the lengthy specification list in a sticky action area with explicit Georgian instructions and an opening status. No automatic confirmation or publication was added. Do not describe receiver/cache fixes as proof of the cause of the reported live incident.

To verify in Chrome: reload the unpacked extension from `apps/extension/dist`, then refresh existing auction and MyAuto tabs so invalidated old content-script contexts are replaced. Select one Manheim24 vehicle, click **MyAuto-ზე გადატანა**, inspect the original/full model preview, and confirm. Verify the dedicated VIN field (if supported), VIN-free description, exact Model field and photo widget completion. Repeat with a different vehicle in a fresh destination. Leave publication manual. If no preview appears, capture only the Georgian error and `[Auto Importer]` structured stage entries from the source console and extension service worker; do not copy page scripts, session data or vehicle identifiers.

### Validation and files for this regression fix

Passed:

- `npm run typecheck -w @auto-importer/parsers`
- Extension TypeScript project checks (also run by the production build).
- `npm run lint -w @auto-importer/extension`
- `npx eslint --config apps/extension/eslint.config.js packages/parsers/src packages/parsers/tests/*.ts packages/shared/src`
- `npm run test -w @auto-importer/parsers`
- `npm run build:extension` (generated `apps/extension/dist/manifest.json`, popup, worker and content-script assets).
- `node apps/extension/scripts/verify-ui.mjs` (19 built UI fixtures).
- `node apps/extension/scripts/verify-transfer.mjs` (two full fixture transfers through the actual unpacked extension, real worker, storage and messaging). This runner blocks external DNS, intercepts web/image requests, uses native FileList assignment and actually loaded fixture preview images. MyAuto options and upload acknowledgments are controlled test fixtures, not verified live server behavior.

Files changed for this regression investigation/fix:

- `apps/extension/src/background/transfers.ts`
- `apps/extension/src/background/index.ts`
- `apps/extension/src/content/manheim.ts`
- `apps/extension/src/services/diagnostics.ts` (new)
- `apps/extension/src/myauto/index.tsx`
- `apps/extension/src/myauto/transfer.ts` (new; existing receiver orchestration extracted for testing)
- `apps/extension/src/components/ImportAction.tsx`
- `apps/extension/src/components/VehicleReview.tsx`
- `apps/extension/src/styles/ui.css`
- `packages/parsers/src/myauto.ts` (VIN privacy scoped to description)
- `packages/parsers/tests/receiver.browser.ts` (new)
- `packages/parsers/tests/workflow.browser.ts`
- `packages/parsers/tests/run-browser.mjs`
- `apps/extension/scripts/verify-transfer.mjs` (new)
- `apps/extension/scripts/verify-ui.mjs`
- `packages/parsers/README.md`

Pre-existing uncommitted exact-model and description-privacy changes were retained. No Admin files, brand/icon assets, parser selectors or translation dictionaries were changed by this regression fix. Final publication remains manual.

The subsequent custom-dropdown adapter update, confirmed DOM evidence, tests and outstanding live selectors are documented in [DROPDOWN_ADAPTER.md](DROPDOWN_ADAPTER.md).

The subsequent discovery/cache, field-only retry and photo-concurrency work, raw before/after timings, changed files and live-verification limits are documented in [PERFORMANCE.md](PERFORMANCE.md).

The latest full-model/optional-trim correction and regression evidence are documented in [MODEL_DESIGNATION.md](MODEL_DESIGNATION.md). Optional trim metadata no longer blocks confirmation; canonical full model and selected vehicle identity remain protected.
