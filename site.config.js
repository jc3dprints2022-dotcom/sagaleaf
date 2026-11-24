/*
 * site.config.js — the ONE place to rename, re-colour or re-point the public site.
 *
 * index.html (landing) and privacy.html (policy) both load this file and fill in
 * every element marked data-site="<key>". Change a value here, reload, done.
 * The HTML also carries the default text as a no-JavaScript fallback.
 *
 * The reader app itself (saga-reader.html) is a separate build and is not affected.
 */
// GoatCounter account (cookieless page-view counts). Loaded by site/site.js on the public pages
// and mirrored in leaf-site/src/lib/goatcounter.ts. Skipped on localhost at runtime.
window.GOATCOUNTER_CODE = "saga-proxima";

window.SITE_CONFIG = {
  // Naming
  productName: "SAGA Reader by Proxima", // public title; never shorten to just "SAGA"
  appName: "SAGA Reader",                // short name for the app
  deviceName: "SAGA Leaf",               // the e-paper device (no ship date, on purpose)
  publisher: "Proxima LLC",              // always shown as publisher
  publisherLocation: "Arizona, USA",

  // Domain & contact — TODO before going live: replace with a real domain/inbox you control.
  domain: "saga.proxima-3d.com",
  contactEmail: "ex3dprint@mail.com",

  // Look
  accentColor: "#2c7a6b", // buttons, links, highlights
  inkColor: "#1f2a30",    // headings / dark surfaces
  paperColor: "#eceee9",  // page background (matches the reader app)

  // Waitlist
  // "/api/waitlist" is served by server.js in this repo (stores to data/waitlist.jsonl).
  // If you host the static files elsewhere, point this at your own endpoint and update
  // waitlistStorage below so the privacy policy stays true.
  waitlistEndpoint: "https://formspree.io/f/xgakypyr",
  waitlistStorage: "Formspree (formspree.io), a form service that stores sign-ups and emails them to Proxima LLC",

  // Privacy policy
  policyEffectiveDate: "18 November 2026",

  // Link to the app
  readerUrl: "saga-reader.html",
};
