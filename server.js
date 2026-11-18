#!/usr/bin/env node
/*
 * Minimal local server for the SAGA landing page, privacy policy and reader.
 * Zero dependencies. Node 18+.
 *
 *   node server.js            -> http://localhost:8080
 *   PORT=3000 node server.js
 *
 * Serves the static files in this folder and accepts waitlist sign-ups at
 * POST /api/waitlist, appending {email, at} lines to data/waitlist.jsonl.
 * It deliberately stores nothing else (no IP, no user agent) and writes no access log,
 * so it matches what privacy.html says.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = process.env.WAITLIST_DIR || path.join(ROOT, "data");
const LIST = path.join(DATA_DIR, "waitlist.jsonl");
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
// Only these paths are public; server.js, data/, .git etc. are never served.
const PUBLIC = new Set(["/index.html", "/privacy.html", "/saga-reader.html", "/site.config.js"]);
const isPublic = (p) => PUBLIC.has(p) || p.startsWith("/site/");

function existing() {
  try {
    return new Set(
      fs.readFileSync(LIST, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).email)
    );
  } catch {
    return new Set();
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleWaitlist(req, res) {
  let data;
  try {
    const raw = await readBody(req);
    const type = req.headers["content-type"] || "";
    data = type.includes("application/json")
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return json(res, 400, { error: "Couldn't read that request." });
  }
  // Honeypot: real people never fill the hidden "website" field.
  if (data.website) return json(res, 200, { ok: true });
  const email = String(data.email || "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return json(res, 400, { error: "Please enter a valid email address." });
  }
  if (!existing().has(email)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LIST, JSON.stringify({ email, at: new Date().toISOString() }) + "\n", { mode: 0o600 });
  }
  // Same answer whether new or already listed, so the form can't be used to probe the list.
  json(res, 200, { ok: true });
}

function serveStatic(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { p = "/"; }
  if (p === "/") p = "/index.html";
  p = path.posix.normalize(p);
  if (!isPublic(p)) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  const file = path.join(ROOT, p);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Content-Length": st.size,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http
  .createServer((req, res) => {
    const url = req.url.split("?")[0];
    if (url === "/api/waitlist") {
      if (req.method !== "POST") return json(res, 405, { error: "Use POST." });
      return handleWaitlist(req, res).catch(() => json(res, 500, { error: "Something went wrong." }));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Method not allowed." });
    serveStatic(req, res);
  })
  .listen(PORT, HOST, () => {
    console.log(`Serving on http://${HOST}:${PORT}  (waitlist -> ${path.relative(ROOT, LIST)})`);
  });
