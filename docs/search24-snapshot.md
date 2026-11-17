# Search24 supplied snapshot follow-up

The supplied `Untitled document (6).docx` contains the selected vehicle details component, scoped StockWave metadata and an initialized Fyusion viewer. It confirms the Search24 component contract; it is not evidence of an authenticated MyAuto upload.

## Findings and narrow fix

Structured metadata supplies only one primary image. The actual `.svfy_carousel .svfy_scroller` has 25 direct DIV entries, in gallery order. Only 19 entries have `.svfy_tip`; six are classless. Tips are descriptive rather than numeric. The All counter is an anchor with `.svfy_catbtn[data-name="All"] span.svfy_chp`, reporting 25.

The previous scoped viewer image scan could prepend the active preview, changing carousel order. A dedicated Search24 carousel reader now reads all direct entries, deduplicates by photo identity and retains the first 15 in their original order. Main-preview resolution upgrades apply only to identities already in the carousel. It checks the declared gallery count and available slots, uses the existing bounded gallery-readiness observer, and retains existing source ownership guards. The selected outer wrapper VIN/listing key must agree with scoped metadata before extraction. No document-wide image fallback was added.

The fully loaded supplied snapshot already yielded 15 URLs before this correction. Therefore it does **not** prove the cause of an intermittent live 0/15 download/upload failure. Live diagnostic checkpoints for the failing attempt remain necessary to distinguish extraction, downloading, messaging and destination confirmation.

Confirmed extracted fixture fields: BMW; complete model `X3 Sports Activity Vehicle xDrive30i`; separately supplied trim `xDrive30i`; year 2021; dedicated VIN (masked in fixture); 38,548 mi with the original unit retained; 2.0 L / 2000 cm³; four cylinders; gasoline; automatic; AWD; SUV; four doors; white exterior; black leather interior; condition grade; and 138 explicitly supplied equipment descriptions. Equipment strings now also come from the verified `designatedDescriptionEnrichment.installedEquipment[].primaryDescription` field. Steering position is not inferred. Auction price and description autofill remain skipped.

## Privacy and files

The regression fixture preserves component ancestry, labels, carousel shape and image ordering, but replaces VIN, listing ID, Fyusion identity and image URLs with synthetic values. Scripts, session/account data and auction notes were omitted.

This follow-up changes:

- `packages/parsers/src/manheim24Search.ts`
- `packages/parsers/src/manheim24SearchGallery.ts` (new)
- `packages/parsers/tests/fixtures/manheim24-search-snapshot.html` (new sanitized fixture)
- `packages/parsers/tests/search24Snapshot.browser.ts` and `search24Snapshot.runner.ts` (new)
- `packages/parsers/tests/workflow.browser.ts` and `run-browser.mjs`
- `packages/parsers/tests/reactForm.fixture.ts` and `myautoContract.fixture.ts`
- `apps/extension/scripts/verify-transfer.mjs`
- this report and the follow-up link in `search24-and-mileage.md`

Working home-Manheim24 parser, shared photo uploader and preparation implementation remain unchanged. No Admin changes.

## Validation

Parser TypeScript, extension ESLint, full parser/browser tests and `npm run build:extension` passed. Snapshot regressions cover exact identity/model/specifications, equipment, 25 discovered/15 selected, preview changes without reordering, lazy gallery population, and mismatching listing identity.

The built extension passed isolated Chrome MV3 tests for two independent vehicles with real storage, messaging, File/DataTransfer and React-controlled fixture fields. Remote websites, photo responses, dropdowns and upload acceptance were simulated:

| Stage | Per fixture vehicle |
| --- | --- |
| Gallery entries found | 25 |
| URLs selected | 15 |
| Images downloaded in isolated test | 15 |
| Files delivered to destination fixture | 15 |
| Images confirmed by simulated destination | 15 |
| Images confirmed on authenticated live MyAuto | Not tested |

Reload the unpacked extension and refresh the source page before live testing. Check original mileage plus its mile unit and compare source/download/received/confirmed photo checkpoints. Review and publication remain manual.
