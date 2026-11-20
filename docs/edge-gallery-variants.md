# EDGE Fotorama gallery coverage audit

Both user-supplied vehicle-detail DOCX snapshots were inspected directly before changes. Original authenticated HTML was not added to the repository. The existing sanitized gasoline/electric fixtures preserve their relevant gallery structures.

## What the documents actually contain

Both use `#vdp .gallery .fotorama`, with `img.main-image`, Fotorama stage frames, a `slide-counts` counter and `a.download-pic`. The first has 47 positions in its thumbnail navigation but only 17 distinct image identities loaded in the saved markup. Many thumbnail frames are empty because of lazy loading. The second is a genuine single-photo gallery without a thumbnail strip. Counting `<img>` elements globally would include logos and duplicate stage/thumbnail/print variants.

Vehicle images use `file3.autolookout.net`, with a base64 path segment describing resolutions such as 100x75 and 1600x1200. Those variants identify the same original; an exact observed resize instruction is ignored for deduplication only. The existing downloader validates responses and follows the verified CDN redirect policy. Neither source vehicle IDs, makes, image paths nor counts are hardcoded in the extractor.

The missing 30 references in the first saved snapshot cannot be reconstructed from empty DOM slots. In a running gallery the documented `fotorama.data` API supplies the complete dataset when initialized. If it never becomes available, the transfer retains only genuinely observed photo references and reports the incomplete gallery instead of fabricating URLs.

## Gaps corrected

Previously the DOM fallback read `src`/`data-src` and direct anchors/images, missing Fotorama's documented `data-full`, `data-img` and `data-thumb` sources and nested originals. Lazy readiness watched only `data-src` for those custom attributes. The MAIN-world bridge read the API only when an inspection requested it; an API load event without a corresponding image DOM mutation could be missed.

Changes:

- `packages/parsers/src/edge/gallery.ts`: source-role preference for explicit fullscreen originals, standard images and thumbnail fallbacks; direct Fotorama frame attributes, lazy images and nested image sources; one selected identity per source frame. Invalid full URLs fall back to verified sources on the same frame. Explicit video frames are excluded. All selection stays within the validated vehicle gallery; no document-wide image fallback.
- `apps/extension/src/content/edgeGalleryBridge.ts`: one listener set per gallery for documented `fotorama:ready`, `fotorama:load`, `fotorama:showend` events; refreshes its identity-bound dataset without moving slides, clicking controls or modifying the gallery.
- `apps/extension/src/content/edge.ts`: wakes the existing bounded photo readiness observer when `data-full`, `data-img` or `data-thumb` changes, alongside `data-src`.
- `apps/extension/src/content/edgePreload.ts`: watches those attributes for incremental background preparation too.
- `packages/parsers/tests/edge.browser.ts`: regression coverage for uninitialized 1/5/23/60-photo anchor galleries, full/standard/thumb preference, nested originals, invalid full URL fallback, video exclusion and attribute-only delayed readiness. Existing supplied-fixture, SPA identity, image format, network, batching and uploader tests remain.
- `apps/extension/scripts/verify-transfer.mjs`: simulated Fotorama event subscription/refresh checks for each new SPA gallery; confirms repeated notifications do not multiply listeners.

Fotorama primary documentation used to verify additional variants: [API and events](https://fotorama.io/customize/api/), [fullscreen data-full](https://fotorama.io/docs/4/fullscreen/), [HTML data-img/data-thumb](https://fotorama.io/customize/html/), [nested thumbnails](https://fotorama.io/docs/4/thumbnails/).

## Validation and limits

Build, extension ESLint and parser TypeScript checks pass. The EDGE browser suite and full sanitized workflow suite pass. Tests retain existing text autofill, photo transport/upload verification, description skipping and manual-publication behavior. Admin and other source adapters were not modified by this change.

A compiled-extension check uses real photos extracted from both DOCX files in memory, isolated Chrome, real MV3 APIs/IndexedDB and a simulated MyAuto React form/upload server. It separately checks discovery, preparation, binary delivery, image decoding and confirmed gallery cards. The multi-photo example discovers/prepares 17 files, reuses 15 and confirms 15 in the simulated destination; the single-photo example discovers/prepares/delivers/confirms 1. The simulated form reflects the supplied MyAuto form's verified 15-photo limit. See `edge-gallery-variants-evidence.json` for sanitized results.

Authenticated MyAuto server acceptance is not tested. Unknown future EDGE gallery/CDN structures, unavailable source images, expired authentication and site upload limits cannot be guaranteed away. These changes cover the supplied structures and documented Fotorama variants while preserving safe failure and identity isolation.
