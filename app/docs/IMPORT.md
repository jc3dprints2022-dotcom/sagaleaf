# Library import

SAGA Reader imports books and highlights into the browser's own storage (IndexedDB).
There is no server-side book store: import works the same in the installed PWA, in the
single-file `saga-reader.html` and in development. Only fetching a book from a link or
from Discover needs the network; reading afterwards is offline.

SAGA opens DRM-free files only. It **detects** DRM so it can refuse honestly; it never
decrypts, strips or works around DRM, and it never fetches or opens Kindle book files.
`tests/library-import.test.ts` ("no DRM circumvention") scans `src/` to keep it that way.

Open **Library → Import** (route `#/import`), or drop files anywhere in the app.

| What | Where in the code | Entry points |
|---|---|---|
| Loose EPUB, PDF, TXT | `src/core/library.ts` (`importBytes`) | Drop anywhere, Home "Choose files", Library "Add books", Import screen |
| Kindle highlights | `src/core/kindle.ts` | Import screen, Highlights & notes "Import Kindle highlights", or drop the file |
| Calibre library | `src/core/calibre.ts` | Import screen (folder or zip), or drop a zip |
| Gutenberg / Standard Ebooks link | `src/app/standardebooks.ts` | Import screen and Discover "Have a link?" |
| Standard Ebooks in Discover | `src/app/standardebooks.ts`, `src/ui/screens/Catalog.tsx` | Discover → Standard Ebooks |

Routing of dropped files is in `src/app/importers.ts` (`importDropped`): a Kindle export
goes to highlights, a zip holding `metadata.opf` files (and no EPUB `mimetype`) goes to the
Calibre importer, everything else is imported as a book exactly as before.

## Kindle highlights (notes only)

Accepted files:

- **My Clippings.txt** from the `documents` folder of a Kindle e-reader. Entries are separated
  by `==========`; each has a `Title (Author)` line, a `- Your Highlight on page 1 | Location 7-8 | Added on …`
  line and the text. English plus common Spanish, German, French, Italian, Portuguese, Dutch
  and Japanese labels are recognised, as are old-firmware headers (`- Highlight Loc. 1405-07`).
  When a highlight was edited on the Kindle, only its last version is kept.
- **Notebook HTML** emailed by the Kindle apps ("Export notebook"): `.bookTitle`, `.authors`,
  `.sectionHeading`, `.noteHeading` and `.noteText` elements, highlight colours included.
- **CSV** exported by the Kindle phone apps (`"Your Kindle Notes For:"` header block, then
  `Annotation Type, Location, Starred?, Annotation` rows).

Parsed fields: title, author (`Austen, Jane` → `Jane Austen`), type (highlight, note,
bookmark), location, page, date text, passage, colour, chapter (HTML). A note Kindle stored at
the end location of a highlight is folded into that highlight; other notes stay notes;
bookmarks are skipped and counted.

**Matching.** A clipping attaches to a library book only when the match is obvious: the same
title ignoring case, punctuation, leading articles and subtitles (`Frankenstein; Or, The Modern
Prometheus` = `Frankenstein`), and, if Kindle gives an author, at least one shared name. If two
different books qualify it isn't obvious and nothing attaches. The same work in several
formats prefers the EPUB.

Attached clippings become ordinary SAGA annotations (id `kindle-<hash>`, tag `kindle`, label
`Kindle, page 1, location 7-8`) anchored by their quoted text with `findQuote`, so they show in
the book, sync and export like any highlight. Passages that can't be found are kept and flagged.

Everything else goes to a **review list** (stored in the local `meta` table, key
`kindle.pending`, not synced) shown at the top of Highlights & notes. There you choose a book
and press Attach, or Discard. When a book is added later, waiting clippings that now match
attach themselves. Re-importing the same file adds nothing (stable ids).

## Calibre library

Choose the library folder (File System Access `showDirectoryPicker` where available, otherwise
an `<input webkitdirectory>`), or a zip of the library. Files are read one at a time when they
are imported. A zip is unpacked in memory, so for a very large library choose the folder.

Each folder holding `metadata.opf` or an ebook file is one book. Title, author(s), series and
index, language, publisher, description, subjects and identifiers come from Calibre's
`metadata.opf` (`dc:*` elements and `calibre:series` / `calibre:series_index`); without an OPF,
title and author come from Calibre's `Author/Title (id)` folder names. Calibre's metadata wins
over the file's own.

Formats are tried EPUB, then PDF, then TXT; the first that imports wins, so a book whose EPUB
has DRM can still come in from a DRM-free PDF. Every skipped file is listed with its reason:

- EPUB with `META-INF/rights.xml` or non-font encryption in `META-INF/encryption.xml`, and PDFs
  using the Adobe ADEPT (`/EBX_HANDLER`) or LiveCycle (`/Adobe.APS`) security handlers, get the
  existing refusal: *"This book is DRM-protected. SAGA doesn’t remove DRM, so it can’t be opened."*
- Folders with only MOBI/AZW3/KFX etc. are skipped with a note to convert DRM-free books to EPUB
  in Calibre.

## Project Gutenberg and Standard Ebooks links

Paste a link into **Import → A free book from a link** or **Discover → Have a link?**.

**Project Gutenberg** (handled by the existing Discover code in `src/app/gutendex.ts`):

- Recognised: `gutenberg.org/ebooks/<id>` (with or without `.epub3.images` etc.),
  `/cache/epub/<id>/…`, `/files/<id>/…`, and `gutenberg.pglaf.org` / `aleph.gutenberg.org` mirror paths.
- Metadata: `https://gutendex.com/books/<id>` (Gutendex API).
- File: the EPUB URL Gutendex lists, then `https://www.gutenberg.org/ebooks/<id>.epub.noimages`,
  then plain text.
- Gutendex and Gutenberg don't allow browser (CORS) requests, so all of these go through SAGA's
  read-only proxy (`PROXY` in `gutendex.ts`). Books marked as in copyright in the USA are refused.

**Standard Ebooks** (`src/app/standardebooks.ts`), fetched **directly**, never through the proxy,
because Standard Ebooks downloads send `Access-Control-Allow-Origin: *`:

- Book page: `https://standardebooks.org/ebooks/<author>/<title>[/<translator-or-illustrator>…]`.
  Links to pages inside a book (`…/text/chapter-1`) and to its downloads are accepted too.
- EPUB: `https://standardebooks.org/ebooks/<segments>/downloads/<segments joined by _>.epub`, the
  "compatible epub", for example
  `https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub`.
  A pasted `…_advanced.epub` link is kept; `.azw3` and `.kepub.epub` links are replaced by the compatible EPUB.
- The response is checked to be a zip. If the site answers with an HTML page instead, SAGA says
  so and asks you to download from the book page; if the browser blocks the request, it links
  to the file to download by hand.
- Books are stored with `catalogId` `se~<author>~<title>…` so Discover shows them as owned.

**Standard Ebooks in Discover** lists the public new-releases Atom feed,
`https://standardebooks.org/feeds/atom/new-releases`. Standard Ebooks' full catalogue feeds (OPDS
at `https://standardebooks.org/feeds/opds`, and `/feeds/atom/all` with its `query` search) need a
Patrons Circle login, so SAGA doesn't use them; for anything not in the new-releases list,
Discover points to `https://standardebooks.org/ebooks` and the paste box. Only `standardebooks.org`
links from the feed are trusted. The last list is cached in `localStorage` for offline viewing.

**Not verified from this build environment.** The sandbox this was built in could not reach
standardebooks.org, so the URL patterns above follow Standard Ebooks' documented layout and the
CORS behaviour stated for this task; tests mock the responses. If the new-releases feed turns out
not to allow browser requests, Discover shows a notice and the paste box still works for downloads.

## Tests

- `tests/library-import.test.ts`: Kindle parsing (`tests/fixtures/kindle/`), matching, attaching
  and the review list; Calibre OPF parsing, a mock tree (`tests/fixtures/calibre/metadata.opf` +
  sample EPUB), DRM refusal, format fallback, zip import; link parsing, direct Standard Ebooks
  download vs proxied Gutenberg download (mocked `fetch`); feed parsing; the DRM-circumvention scan.
- `e2e/import.ts`: against the published `saga-reader.html` + `sw.js`, with Gutenberg (via the
  proxy URL) and standardebooks.org mocked by Playwright. Calibre folder and zip, Kindle
  clippings and review, one Gutenberg and one Standard Ebooks book obtained through the UI,
  then a relaunch with the browser offline and the server down: all three books open.
  Run with `npm run build:standalone && npm run publish:site && npx tsx e2e/import.ts`.
