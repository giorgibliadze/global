# Non-blocking full model / optional trim validation

## Root cause and fix

`identity.ts` previously looked for the trim inside the complete structured designation and required it to occur immediately after the catalog model. A valid source such as catalog `Ranger Crew Cab Medium Bed`, designation `Ranger XLT Crew Cab Medium Bed`, trim `XLT` threw the blocking Georgian error. When trim was easy to separate, that branch also kept only the shorter catalog model. Conflicting separately labeled trim fields were treated as an unsafe identity mismatch.

The parser now retains the full source designation in `fullModelName`, both on the normalized vehicle and `original`. `model` remains a compatible alias for the same full designation. Independently labeled catalog/base model data is retained in `baseModel`/`catalogModel`; body style remains a separate source field. No body/trim words are removed from the full designation. Manufacturer and model names are not translated.

The VIN-matched structured standard short description is preferred and checked against the selected visible title. Only the verified year/manufacturer header is removed. If that structured full description is unavailable, the selected detail title can supply the complete suffix after the known header; arbitrary word positions and unrelated result titles are not used. A separately labeled model that is an exact longer prefix extension of a shortened display is preserved as supplied, not shortened to that display. Missing catalog/base metadata is allowed when the full designation is reliable.

Trim is read only from the independent enrichment `trim`, `trims` and `sourceTrim` labels. If no usable trim or conflicting values exist, trim is **null**, not guessed from the title. It is omitted from the MyAuto trim input rather than converted to the string "null". Missing null year enrichment no longer falsely conflicts with a separately available source year.

The non-blocking warning is exactly:

> მოდელი და კომპლექტაცია ცალ-ცალკე ვერ განისაზღვრა. სრული დასახელება შენარჩუნებულია და გადატანა გაგრძელდება.

VIN/source-data mismatch, conflicting manufacturer, unsafe selected-title mismatch and unreliable selected vehicle identity still block. `assertNormalizedVehicle` accepts nullable trim/optional base metadata, validates the new fields, and rejects contradictory canonical full-model aliases. New parser output always populates the full-name fields; their TypeScript wire properties remain optional to tolerate older session records.

## Confirmation and MyAuto behavior

Confirmation is bound to source, listing ID, VIN, manufacturer and complete model. Optional decoding changes alone no longer cancel the entire confirmed transfer. Previously reviewed details remain frozen; if trim changes after review it is cleared to null with the warning, rather than trusting an uncertain value. Other optional changes receive a review warning. Actual vehicle/name changes still require a new review. Detailed snapshots remain in use for active-job deduplication, preserving separate transfers.

MyAuto description, preview, search candidates, native/custom Model entry and final verification prioritize `fullModelName`. Exact model selection is attempted first, followed by an explicitly supported editable Model input. The existing `primaryFeatures.customModel` remains trim; it is never used to disguise failure to fill Model. No shorter or unrelated model is selected.

When an exact MyAuto model cannot be accepted, the model result is unresolved with:

> მოდელის ზუსტი ვარიანტი MyAuto-ზე ვერ მოიძებნა. გადაამოწმეთ მოდელის ველი.

VIN, year, mileage, fuel, engine, cylinders, other mapped fields, Georgian description and photos continue independently. All description privacy boundaries remain in place. Publication remains manual. Discovery, dependency-aware caching, bounded photo concurrency, field-only retries and prior performance optimizations were retained.

## Regression evidence

`tests/modelDesignation.browser.ts` derives sanitized source variants for:

- Ford Ranger XLT Crew Cab Medium Bed (including the old non-adjacent trim failure).
- BMW M5 Touring Wagon.
- Toyota Camry SE.
- Missing and conflicting trim, null trim input behavior, missing base metadata and selected-title fallback.
- A structured full model longer than the display title.
- Canonical full-name mapping despite a shortened legacy alias.
- Missing exact MyAuto model, with no substitution of Ranger and successful independent VIN/year/mileage/fuel/engine/cylinder/description writes.
- Supported custom Model entry.
- VIN-free descriptions and blocking unsafe VIN/canonical-model contradictions.

`tests/receiver.browser.ts` adds vehicle C with ambiguous trim during preview and changed optional trim metadata before confirmation. It validates/claims the payload, fills supported fields, transfers a real photo File through the existing transport and verifies the simulated gallery completion without trim blocking. Existing A/B isolation tests remain.

The main regression suite, TypeScript, extension/parser/shared/test ESLint and root `npm run build` are required. Built UI and real unpacked MV3 A/B/photo/retry fixture tests also verify existing behavior. These controlled fixtures are not authenticated live-site verification. The actual availability of a complete Ford/Toyota/BMW Model option on MyAuto remains a live compatibility question; the adapter reports it unresolved instead of claiming success.

## Files changed for this fix

- `packages/shared/src/index.ts`
- `packages/parsers/src/identity.ts`
- `packages/parsers/src/manheim24.ts`
- `packages/parsers/src/validation.ts`
- `packages/parsers/src/myauto.ts`
- `packages/parsers/src/normalization.ts`
- `apps/extension/src/background/transfers.ts`
- `apps/extension/src/components/VehicleReview.tsx`
- `apps/extension/src/components/TransferProgress.tsx`
- `packages/parsers/tests/modelDesignation.browser.ts` (new)
- `packages/parsers/tests/dropdowns.browser.ts` (synthetic record keeps canonical aliases coherent)
- `packages/parsers/tests/receiver.browser.ts`
- `packages/parsers/tests/workflow.browser.ts`
- `packages/parsers/MODEL_DESIGNATION.md` (new)
- `packages/parsers/README.md`

No Admin, photo transport/uploader, cache engine, timing, branding, launcher, permission or dependency changes were made by this fix.

After reloading the built unpacked extension, refresh the Manheim24 and MyAuto tabs so old content-script contexts are replaced. Preview the complete model, confirm, inspect any model warning and continue manual final review. Do not treat an unresolved model as a successful mapping.

Final results: all parser/workflow regressions passed, including the Ford/BMW/Toyota cases, placeholder/missing/conflicting trim, custom and unavailable Model controls, partial independent-field filling, VIN privacy and receiver C photo transfer. Root `npm run build` completed and regenerated manifest/popup/worker/content assets. Parser and extension TypeScript checks and both ESLint scopes passed. The unpacked-extension A/B photo tests, 19 UI fixtures and fuel-only retry tests also passed; these remain controlled fixtures rather than live authenticated-site verification.
