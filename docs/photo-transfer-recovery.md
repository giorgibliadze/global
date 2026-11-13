# Vehicle photo transfer recovery

## Confirmed failure and scope

The reported Ford transfer shows downloaded 0/0 and uploaded 0/0, with “no photo prepared.” This proves that this attempt reached MyAuto with an empty source photo list, before any download or FileList submission. It is not evidence of CORS, MIME or an upload server rejecting 15 files.

The source preparation path accepts a valid selected vehicle while its dynamically rendered photo gallery is still empty. Its transfer verification checks selected identity and preparation generation, not photo readiness. The old receiver consumed `transfer.photos.total` directly, so an accepted zero-photo payload permanently skipped downloading. This failure is reproduced in the new browser test, and in the built MV3 harness with an initially empty cached gallery.

The actual Ford gallery DOM was not supplied. Consequently, lazy rendering/cache timing is a demonstrated failing path, not proof that Ford has no additional unsupported URL/markup variant. We cannot attribute the user's complete live failure to a specific newer commit without that evidence. Git comparison with `87575bc` shows no changes to the photo downloader/store/client/uploader or image host permissions through HEAD before this fix; the previous working download implementation is retained.

## Fix

1. Keep all existing text adapters, field mapping, description skip, negotiable price and user-edit persistence unchanged.
2. Settle existing automatic form operations, without requiring a valid listing or resolved manual fields; then enter the photo phase.
3. When a prepared transfer has zero photos, ask the original source content script for gallery-only data. Wait on DOM notifications for at most six seconds, validate selected VIN/listing against the transfer and return only allowed photo URLs. Update only the photo payload, not prepared text fields. A changed/unavailable/empty source produces a specific Georgian extraction error.
4. Reuse the existing selected-panel gallery selector and structured `images[].largeUrl`. Add only the independently confirmed `mainImage.largeUrl` fallback from the supplied Manheim24 document. Existing ordering, high-resolution deduplication, limit 15 and URL/privacy allowlist remain.
5. Retain authenticated bounded downloads (three concurrent), Blob storage in IndexedDB, MIME signature checks, checksummed chunk retrieval and File reconstruction. Chrome extension runtime messaging is JSON serialized; existing base64 chunks are retained only at that transport boundary, rather than introducing unsupported Blob messaging.
6. Submit real Files through DataTransfer and the native change event. The current named MyAuto gallery adapter uses actual source-confirmed loading/item/image testids. A loaded HTTPS image in a completed item and the site's count are required. Local previews alone are never success. Small server thumbnails are accepted without the older arbitrary 128px threshold.
7. Track local IDs in original submission order. At most one retry resubmits only files whose IDs were observed and then removed by the site's completion handler, after no loading placeholders remain. Successful cards stay in place. Unknown/pending mappings are reported without unsafe retries. Legacy gallery verification remains supported and retains partial confirmed counts.

No publication, authentication bypass, uploader private API calls or text refactor were added.

## Modified files

- `packages/parsers/src/manheim24.ts`: reusable selected gallery extraction, confirmed main image fallback.
- `apps/extension/src/content/photos.ts` (new), `content/manheim.ts`: bounded, identity-bound gallery-only refresh message.
- `apps/extension/src/background/index.ts`, `background/transfers.ts`: destination-bound PHOTO_REFRESH, payload update and submitted/text-complete progress validation.
- `apps/extension/src/myauto/transfer.ts`: text-first scheduling, zero-gallery refresh, photo progress and specific errors.
- `apps/extension/src/photos/galleryUpload.ts` (new), `photos/upload.ts`: current gallery verification, safe failed-file-only retry, partial results.
- `packages/shared/src/index.ts`, `apps/extension/src/components/TransferProgress.tsx`: discovered/downloaded/submitted/confirmed counts and Georgian phase messages.
- Tests: `photoRegression.browser.ts` (new), `myautoContract.fixture.ts`, `receiver.browser.ts`, `run-browser.mjs`, `workflow.browser.ts`, `apps/extension/scripts/verify-transfer.mjs`.

## Validation and limits

Parser TypeScript, extension build/TypeScript, ESLint and full browser regression tests pass. New regressions verify zero-photo reproduction/refresh, structured main image, missing/changed source rejection, 12+3 selective retry to 15, no duplicate batch and unchanged text/description/negotiable controls. Existing tests cover selected vehicle gallery identity, limit/order/dedup, MIME/auth failures, binary storage/chunks and photo A/B isolation.

The built unpacked extension is exercised with real Chrome extension APIs and MyAuto's actual public RHF module using source-derived form/gallery handlers. `AUTO_LAZY_PHOTOS_TEST=1` starts with a cached 0-photo vehicle and reveals its gallery only after text completion; it must finish with 15 confirmed photos. The second vehicle has separate source URLs. This verifies extension mechanics against fixtures; website requests, dropdown options and upload acknowledgments are simulated.

No authenticated live Manheim24 → MyAuto success is claimed. On the user's actual Ford listing, reload the extension and source/destination tabs, leave the selected source details/gallery open and start a fresh transfer. Observe text completion → preparation → submission → gallery-confirmed count. Check that description is unchanged and negotiable price remains selected. If photo count remains zero, the current Ford gallery markup or a non-sensitive photo URL is needed to verify any additional source variant. Pending/unknown uploads are left intact for manual review; final publication remains manual.

Final verification: the full browser suite passed; final unpacked-MV3 lazy-gallery plus field-retry run passed for both vehicles with 15 confirmed photos each; all 19 built-UI checks passed. Build generated `apps/extension/dist/manifest.json` and popup assets. `git diff --check` passed. Git confirms no changes to Admin or the working MyAuto text adapters/mappings.
