// EPUB -> plain text, in the browser, before upload.
//
// WHY: the device has to hold one whole chapter in RAM to read it, and a
// "chapter" is however big the publisher made it — Project Gutenberg routinely
// puts an entire book in one 75 KB XHTML file. The XH-32S has ~115 KB of free
// heap, and barely 18 KB of contiguous block while the Wi-Fi stack is up, so a
// chapter that size simply cannot be loaded. Converted to .txt the device uses
// its streaming reader instead, which reads in 1 KB chunks and splits the text
// into bounded chapters by itself.
//
// This is a faithful port of the firmware's own extractor
// (src/saga/epub/xhtml_text.cpp) and of tools/add_book.py, so a book converted
// here reads identically to one converted on a PC. Verified byte-for-byte
// against the C++ implementation over the real book plus a fuzz corpus.
//
// Unzipping uses DecompressionStream('deflate-raw'), which is built into
// modern browsers — no library, nothing to download, works offline.

/**
 * Tidy a plain-text book before upload.
 *
 * A .txt has no markup or packaging to strip, so unlike an EPUB there is no
 * large saving to be had — the words are the words. What it does have is
 * Project Gutenberg's licence, a ~20 KB block bolted onto the end of every
 * file (and a short header at the start). The EPUB path already drops those;
 * this makes the .txt path agree, so the same book behaves the same way
 * whichever format you send.
 *
 * Returns the cleaned text. Non-Gutenberg files come back with only line
 * endings normalized.
 */
export function cleanPlainText(raw) {
  let s = raw.replace(/\r\n?/g, "\n");

  // PG marks the body with *** START OF ... *** / *** END OF ... *** lines.
  const start = s.match(/^\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/im);
  if (start) s = s.slice(start.index + start[0].length);
  const end = s.match(/^\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*/im);
  if (end) s = s.slice(0, end.index);

  // Some editions repeat a short produced-by/transcriber note before the text.
  s = s.replace(/^\s*(Produced by|Updated editions will|E-text prepared by)[^\n]*\n+/i, "");

  return s.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------------------------------------------------------------- entities
const NAMED = {
  amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, nbsp: 0x00a0,
  mdash: 0x2014, ndash: 0x2013, hellip: 0x2026, lsquo: 0x2018, rsquo: 0x2019,
  ldquo: 0x201c, rdquo: 0x201d, copy: 0x00a9, reg: 0x00ae, trade: 0x2122,
  deg: 0x00b0, eacute: 0x00e9, egrave: 0x00e8, agrave: 0x00e0, ccedil: 0x00e7,
  uuml: 0x00fc, ouml: 0x00f6, auml: 0x00e4, szlig: 0x00df,
};

const BLOCK = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote",
  "section", "article", "tr", "header", "figure", "figcaption",
]);

function entityCp(body) {
  if (!body) return null;
  if (body[0] === "#") {
    let cp = 0;
    if (body.length > 1 && (body[1] === "x" || body[1] === "X")) {
      if (body.length <= 2) return null;
      for (let k = 2; k < body.length; k++) {
        const c = body[k];
        let d;
        if (c >= "0" && c <= "9") d = c.charCodeAt(0) - 48;
        else if (c >= "a" && c <= "f") d = c.charCodeAt(0) - 87;
        else if (c >= "A" && c <= "F") d = c.charCodeAt(0) - 55;
        else return null;
        cp = cp * 16 + d;
      }
    } else {
      if (body.length <= 1) return null;
      for (let k = 1; k < body.length; k++) {
        const c = body[k];
        if (c < "0" || c > "9") return null;
        cp = cp * 10 + (c.charCodeAt(0) - 48);
      }
    }
    cp = cp >>> 0; // the firmware accumulates in a uint32_t
    return cp > 0 && cp <= 0x10ffff ? cp : null;
  }
  return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : null;
}

// Lone surrogates are invalid in XML but fromCodePoint throws on them, and a
// thrown exception mid-book is worse than one odd character.
function cpToStr(cp) {
  if (cp >= 0xd800 && cp <= 0xdfff) return String.fromCharCode(cp);
  return String.fromCodePoint(cp);
}

const isAsciiAlnum = (c) =>
  (c >= "0" && c <= "9") || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");

// --------------------------------------------------- XHTML -> reading text
// Port of saga::epub::xhtml_to_text_inplace().
export function xhtmlToText(html) {
  const out = [];
  const back = () => (out.length ? out[out.length - 1] : "");
  const popSpaces = () => {
    while (out.length && (back() === " " || back() === "\t")) out.pop();
  };
  const trailingNewlines = () => {
    let c = 0;
    while (c < out.length && out[out.length - 1 - c] === "\n") c++;
    return c;
  };
  const paraBreak = () => {
    popSpaces();
    if (!out.length) return;
    if (trailingNewlines() >= 2) return;
    while (out.length && back() === "\n") out.pop();
    out.push("\n", "\n");
  };
  const lineBreak = () => {
    popSpaces();
    if (out.length && back() !== "\n") out.push("\n");
  };
  const emitText = (ch) => {
    if (ch === "\n" || ch === "\r" || ch === "\t" || ch === " ") {
      if (out.length && back() !== " " && back() !== "\n") out.push(" ");
    } else {
      out.push(ch);
    }
  };

  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html[i] === "<") {
      if (html.startsWith("<!--", i)) {
        const e = html.indexOf("-->", i + 4);
        i = e < 0 ? n : e + 3;
        continue;
      }
      const gt = html.indexOf(">", i + 1);
      if (gt < 0) break;
      let t = i + 1;
      let closing = false;
      if (t < gt && html[t] === "/") { closing = true; t++; }
      let name = "";
      while (t < gt && isAsciiAlnum(html[t])) {
        if (name.length < 15) name += html[t].toLowerCase();
        t++;
      }
      i = gt + 1;

      if (!closing && (name === "script" || name === "style")) {
        const close = "</" + name;
        const e = html.indexOf(close, i);
        if (e < 0) {
          i = n;
        } else {
          const egt = html.indexOf(">", e);
          i = egt < 0 ? n : egt + 1;
        }
        continue;
      }
      if (name === "br") lineBreak();
      else if (BLOCK.has(name)) paraBreak();
      continue;
    }

    if (html[i] === "&") {
      let j = i + 1;
      while (j < n && j - i <= 12 && html[j] !== ";" && html[j] !== "<") j++;
      let cp = null;
      if (j < n && html[j] === ";" && j - i <= 12) cp = entityCp(html.slice(i + 1, j));
      if (cp !== null) {
        i = j + 1;
        for (const ch of cpToStr(cp)) emitText(ch);
      } else {
        i++;
        emitText("&");
      }
      continue;
    }

    const c = html[i];
    i++;
    emitText(c);
  }

  while (out.length && (back() === "\n" || back() === " ")) out.pop();
  return out.join("");
}

// ------------------------------------------------------------------- unzip
const rd16 = (dv, o) => dv.getUint16(o, true);
const rd32 = (dv, o) => dv.getUint32(o, true);

async function inflateRaw(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readZipIndex(buf) {
  const dv = new DataView(buf);
  const len = buf.byteLength;
  if (len < 22) throw new Error("not a valid EPUB (file too small)");
  let eocd = -1;
  const floor = Math.max(0, len - 65557);
  for (let i = len - 22; i >= floor; i--) {
    if (rd32(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a valid EPUB (no zip index found)");

  const total = rd16(dv, eocd + 10);
  let p = rd32(dv, eocd + 16);
  const entries = new Map();
  for (let k = 0; k < total; k++) {
    if (rd32(dv, p) !== 0x02014b50) break;
    const method = rd16(dv, p + 10);
    const compSize = rd32(dv, p + 20);
    const uncompSize = rd32(dv, p + 24);
    const nameLen = rd16(dv, p + 28);
    const extraLen = rd16(dv, p + 30);
    const cmtLen = rd16(dv, p + 32);
    const lho = rd32(dv, p + 42);
    const name = new TextDecoder("utf-8").decode(
      new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, { method, compSize, uncompSize, lho });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { dv, entries };
}

async function readEntry(buf, zip, name) {
  const e = zip.entries.get(name);
  if (!e) return null;
  const nameLen = rd16(zip.dv, e.lho + 26);
  const extraLen = rd16(zip.dv, e.lho + 28);
  const start = e.lho + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buf, start, e.compSize);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRaw(raw);
  throw new Error(`unsupported compression in EPUB (method ${e.method})`);
}

const asText = (bytes) =>
  bytes ? new TextDecoder("utf-8").decode(bytes) : null;

// -------------------------------------------------------------- OPF / spine
const dirOf = (p) => {
  const k = p.lastIndexOf("/");
  return k >= 0 ? p.slice(0, k + 1) : "";
};

function resolvePath(base, href) {
  const parts = [];
  for (const seg of (base + href).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") { parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join("/");
}

// Project Gutenberg license sections: long, legal, and not the book.
function isBoilerplate(text) {
  const head = text.slice(0, 1200).toUpperCase();
  return (
    head.includes("THE FULL PROJECT GUTENBERG") ||
    head.includes("START: FULL LICENSE") ||
    head.includes("SECTION 1. GENERAL TERMS OF USE")
  );
}

/**
 * Convert an EPUB ArrayBuffer to plain text.
 * Returns { text, title, author, sections, skipped, biggestChapter }.
 */
export async function convertEpubToText(buf, opts = {}) {
  const onProgress = opts.onProgress || (() => {});
  const zip = readZipIndex(buf);

  const container = asText(await readEntry(buf, zip, "META-INF/container.xml"));
  if (!container) throw new Error("not a valid EPUB (no container.xml)");
  const rootMatch = container.match(/full-path="([^"]+)"/);
  if (!rootMatch) throw new Error("not a valid EPUB (no OPF declared)");
  const opfPath = rootMatch[1];
  const opf = asText(await readEntry(buf, zip, opfPath));
  if (!opf) throw new Error("not a valid EPUB (OPF missing)");
  const opfDir = dirOf(opfPath);

  const meta = (tag) => {
    const m = opf.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`));
    return m ? xhtmlToText(m[1]).trim() || null : null;
  };

  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b([^>]*)>/g)) {
    const id = m[1].match(/\bid\s*=\s*"([^"]*)"/);
    const href = m[1].match(/\bhref\s*=\s*"([^"]*)"/);
    if (id && href) manifest.set(id[1], href[1]);
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref\s*=\s*"([^"]*)"/g)]
    .map((m) => m[1]);
  if (!spine.length) throw new Error("EPUB has no readable spine");

  const parts = [];
  let skipped = 0;
  let biggestChapter = 0;
  for (let k = 0; k < spine.length; k++) {
    const href = manifest.get(spine[k]);
    onProgress({ section: k + 1, total: spine.length });
    if (!href) continue;
    const full = resolvePath(opfDir, href.split("#")[0]);
    const bytes = await readEntry(buf, zip, full);
    if (!bytes) continue;
    if (bytes.length > biggestChapter) biggestChapter = bytes.length;
    const text = xhtmlToText(asText(bytes)).trim();
    // Cover/nav stubs and the Gutenberg licence are not the book.
    if (text.length < 32 || isBoilerplate(text)) { skipped++; continue; }
    parts.push(text);
  }
  if (!parts.length) throw new Error("no readable text found in this EPUB");

  return {
    text: parts.join("\n\n\n") + "\n",
    title: meta("title"),
    author: meta("creator"),
    sections: parts.length,
    skipped,
    biggestChapter,
  };
}
