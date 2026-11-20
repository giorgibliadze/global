# EDGE photo functional fix

## Proven failure

In an isolated Chrome MV3 worker, real resized photo URLs taken from the two supplied EDGE snapshots returned HTTP 302 from `file3.autolookout.net` to `dxbrs3zlwqu4z.cloudfront.net`. The shared downloader uses `redirect: error`, causing `TypeError` / `net::ERR_FAILED` before image bytes are read. Allowing redirects without the final host permission reproduced `MissingAllowOriginHeader` CORS failure. See `cdn-before.log`.

Direct main-photo HTTPS URLs returned valid JPEGs even before this fix. Thus the evidence proves the resized-photo download blocker, not that every possible 0-photo failure has the same cause. HTTP main-photo behavior varied (HSTS redirect vs 200); normalizing to the verified HTTPS endpoint avoids that variability without inventing paths.

Previous fully intercepted image fixtures hid the real CDN behavior. Their passing upload assertions did not prove actual photo downloads. The new optional real-CDN test explicitly permits only the two photo origins to reach the network; auction HTML and MyAuto remain simulated.

## Isolated fix

- `src/background/edgeDownloads.ts`: EDGE-only wrapper around the existing downloader. Preserve exact observed paths, use HTTPS, follow ordinary browser redirects, accept only the two verified HTTPS final origins. Preserve credentials, abort signal, MIME sniffing, byte limits, hashes, retries, metadata and Blob contract. Retain original error cause and add safe development diagnostics.
- `src/background/index.ts`: register the wrapper; non-EDGE requests delegate unchanged.
- `manifest.config.ts`: add only the exact CloudFront origin. No wildcard CloudFront permission or browser security bypass.
- No shared downloader, MyAuto uploader, field mapping, UI, concurrency, mileage, or Admin changes in this fix.

## Snapshot findings

BMW: 47 declared thumbnail slots; 16 populated ordered thumbnail identities observed, plus another stage identity. First 15 selected. Only two selected images have observed 1600px variants; the other selected URLs expose 100px thumbnails. No guessed resolution rewriting was added.

Tesla: one genuine distinct photo in a `gallery.no-thumbs` variant; no fictitious extra photos.

Real URLs are read from the original DOCX files into memory only. Saved logs contain no asset paths, VINs, cookies, tokens or original authenticated HTML. The runtime test supplies only observed photo paths through a simulated Fotorama API and keeps all vehicle identifiers synthetic.

## Actual CDN / simulated destination results

| Fixture | URLs selected | Real downloads | Real Files delivered | Simulated gallery confirmed | Authenticated MyAuto confirmed |
| --- | ---: | ---: | ---: | ---: | --- |
| BMW | 15 | 15 | 15 | 15 | Not tested |
| Tesla | 1 | 1 | 1 | 1 | Not tested |

JPEG and PNG content was decoded; unique hashes, dimensions and byte sizes verified. BMW widths 100–1600px, Tesla 1600px. The extension used actual MV3 messaging/session storage/IndexedDB/chunks/File conversion. Destination React state, photo acknowledgment, reload non-repetition and independent vehicle transfers were exercised against the fixture. `real-photo-transfer.log` is evidence; it is not authenticated MyAuto acceptance evidence. Low-resolution thumbnail acceptance still needs live verification.

## Reproduce

From the monorepo root:

```sh
npm run build:extension
npm run lint -w @auto-importer/extension
npm run typecheck -w @auto-importer/parsers
AUTO_EDGE_TEST=1 npm test -w @auto-importer/parsers
npm test -w @auto-importer/parsers
node apps/extension/scripts/probe-edge-cdn.mjs
AUTO_EDGE_TEST=1 AUTO_EDGE_REAL_CDN=1 AUTO_PREFETCH_TEST=1 AUTO_REACT_TEST=1 node apps/extension/scripts/verify-transfer.mjs
```

The last two commands require installed Chrome, network access and the original supplied DOCX files in Downloads. They use a temporary isolated profile; they do not access the user's Chrome profile or authenticated MyAuto account.

## Validation results

Passed: extension TypeScript/Vite build, extension ESLint, parser TypeScript, EDGE regression suite (including exact redirect allowlist, HTTP→HTTPS, transient/permanent errors and non-EDGE delegation), full existing workflow suite, real-CDN probe, and both built-extension real-photo fixture transfers. `git diff --check` passed. `dist/manifest.json` contains the exact CDN origin and popup assets were generated.

## Live acceptance remaining

Reload the unpacked extension in `chrome://extensions`, grant the new exact CDN permission if Chrome requests it, and refresh the EDGE source tabs. Try each vehicle with the usual one-click action. Check actual MyAuto gallery acceptance, especially 100px thumbnail assets. Do not publish automatically. If it still fails, use the transfer-ID photo checkpoints to distinguish failed download, File delivery, uploader readiness and gallery confirmation; do not infer acceptance from a dispatched change event.
