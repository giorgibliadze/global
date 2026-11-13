# Fast partial autofill: description opt-out and negotiable price

## Behavior

Description is omitted from generated form plans. No description is generated on the production transfer path, source descriptions are stripped from destination payloads, and legacy prepared description/price entries are replaced by the current policy both before transmission and on receipt. Description is excluded from verification, retry, failure counts and form readiness. Existing descriptions, including manually entered text, are never edited or privacy-sanitized by this transfer anymore.

The selling-price input is never written by the extension. `price` in the form plan now represents enabling negotiability, not copying the source price. Missing controls are marked `ხელით შესავსები`, without blocking other fields/photos or adding retries. Skipped description has a separate informational line, without a failed-field result.

## Verified source contract

The supplied MyAuto HTML contains `input[type=checkbox][name="sale.isNegotiablePrice"]` inside the named toggle label. The referenced public MyAuto bundle `main.f81b0e156752.js` registers that native checkbox with React Hook Form (`register(name)`), rather than using a visual-only custom state. The adapter calls `.click()` only when unchecked, yields one commit turn and verifies `checked`. Final transfer verification checks the state again after the independent photo pipeline. It never assigns `.checked` or writes `sale.price`.

The public price component watches negotiability. Its own effect clears `sale.price` when negotiability becomes true. That intended site behavior is preserved; the extension does not restore/overwrite the price. When already enabled, no click occurs.

## Changed implementation files

- `packages/parsers/src/negotiablePrice.ts`: native registered-checkbox adapter and read verification.
- `packages/parsers/src/myauto.ts`: description-free plan, negotiable price field and legacy-payload policy.
- `packages/parsers/src/stagedMyauto.ts`: isolated toggle stage and persistence evidence.
- `packages/parsers/src/myautoContract.ts`: description removed from readiness requirements.
- `packages/shared/src/index.ts`: toggle plan mode and negotiability evidence type.
- `apps/extension/src/background/transfers.ts`: strip source description, enforce outgoing policy, validate evidence.
- `apps/extension/src/myauto/transfer.ts`: enforce received policy and remove description mutation/privacy checks.
- `apps/extension/src/components/TransferProgress.tsx`, `apps/extension/src/myauto/Summary.tsx`: explicit Georgian skip, negotiable price and manual-field statuses.

Updated tests: sanitized MyAuto HTML; staged adapter; form lifecycle; model/privacy/designation; prefetch; receiver; source-derived RHF fixture/types; built-MV3 verification harness.

## Validation scope

The full browser regression suite covers untouched descriptions (empty/manual/stale prepared payload/retry), no description failures, enabling the checkbox once, preserving an already-enabled checkbox, detecting a reset, missing control isolation and no writes to a manually entered price. The built extension is tested using real Chrome extension storage/messaging and MyAuto's public RHF module with source-derived handlers: negotiability must remain true in form state and DOM after peer interaction, rerender and 15-photo upload for two independent vehicles. Public modules remain temporary local test inputs, not repository assets.

This is not authenticated live MyAuto verification. Reload the extension and MyAuto/Manheim24 tabs, perform a transfer, then confirm that description is unchanged, `ფასი შეთანხმებით` remains enabled after another field changes and photos finish, and no auction price appears. Final publication remains manual. Admin and photo-transfer implementation are unchanged.

Final results: parser TypeScript, extension TypeScript/build (`npm run build:extension`), extension ESLint, complete browser regression suite, 19 built-UI fixtures and the built-MV3 two-vehicle/fuel-only-retry suite passed. Manifest and popup assets were generated. No Admin files changed.

The source-derived desktop fixture supports 16 controls: dedicated VIN, mileage, verified trim, manufacturer, exact model, year, fuel, engine volume, cylinders, body, transmission, drivetrain, exterior/interior colors, interior material and negotiable price. Optional missing values, unavailable/nonexact dropdown options, vehicle condition and unverified mobile dropdown contracts remain manual. Description is intentionally excluded, rather than counted as one of those failures. These counts describe the fixture; actual live options determine the available subset.
