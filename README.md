# SAGA Reader by Proxima

Published by **Proxima LLC** (Arizona, USA).

| File | What it is |
|---|---|
| `index.html` | Public waitlist landing page |
| `privacy.html` | Privacy policy (linked in every footer) |
| `saga-reader.html` | The reader app, compiled from `app/` (linked as "Open the reader"). Don't hand-edit it; rebuild it |
| `app/` | Source of the reader app (Vite + React + TypeScript) |
| `site.config.js` | **The one place** to change product name, device name, publisher, domain, contact email, colours, waitlist endpoint and policy date |
| `site/` | Shared CSS and the small script that applies the config |
| `server.js` | Zero-dependency Node server: serves the pages and stores waitlist sign-ups |

## Run it locally

Needs Node 18 or newer. No `npm install` step.

```bash
node server.js
```

Open http://localhost:8080. Sign-ups are appended to `data/waitlist.jsonl` (one `{"email","at"}` per line, gitignored). The server stores nothing else: no IP address, no user agent, no access log.

Use another port with `PORT=3000 node server.js`.

Opening `index.html` straight from disk also works for viewing, but the sign-up form needs the server.

## Rebuilding the reader

`saga-reader.html` is a single self-contained file built from `app/`. Needs Node 20 or newer.

```bash
cd app
npm ci
npm test
npm run build:standalone   # -> app/dist-standalone/saga-reader.html
npm run publish:site       # copies it to ./saga-reader.html at the repo root
```

Commit the new root `saga-reader.html`; GitHub Pages serves it at `/saga-reader.html`. Discover's Gutendex/Gutenberg requests go through the CORS proxy set in `app/src/app/gutendex.ts`; the optional sign-in config (`SAGA_AUTH`) is at the top of `app/index.html`; product switches are in `app/src/app/features.ts`.

## Rename, re-colour, re-point

Edit `site.config.js` and reload. `productName` updates the landing page, the policy heading and both page titles. `accentColor`, `inkColor` and `paperColor` set the colours. The HTML keeps the current defaults as plain text so the pages still read correctly with JavaScript off. If you rename, update those defaults too, or search for `SAGA Reader by Proxima`.

## Before going public

- [ ] Set `domain` and `contactEmail` in `site.config.js` to a domain and inbox you actually control. They're placeholders (`saga-reader.example`) right now. The policy promises deletion requests go to that address.
- [ ] If you store sign-ups anywhere other than `server.js`, update `waitlistStorage` so the policy names where.
- [ ] If you start sending emails through a mail service, name it in `privacy.html` section 1 first.

## Deploying later (free options; nothing has been bought)

**Option A: a small Node host (keeps the built-in waitlist).** Any host that runs `node server.js` works (a free tier on Render, Fly.io or Railway, or a VPS you already have). Set `HOST=0.0.0.0` and the `PORT` the host gives you, and put `data/` on a persistent disk (or set `WAITLIST_DIR`) so sign-ups survive restarts. Download the list with your host's shell or file access.

**Option B: static hosting (GitHub Pages, Netlify, Cloudflare Pages).** Upload `index.html`, `privacy.html`, `saga-reader.html`, `site.config.js` and `site/`. Static hosts can't run `server.js`, so point `waitlistEndpoint` at a form endpoint you trust that accepts a JSON POST of `{"email": "..."}`. Then update `waitlistStorage` and the policy to name that service. Don't pick one that adds tracking.

Remember that static hosts usually keep their own short request logs. The policy already says so in section 2.

## What the site deliberately doesn't do

No analytics, cookies, ad or marketing pixels, third-party fonts or scripts, accounts, App Store badges, or in-app purchase language. If you add any of these, update `privacy.html` in the same change.
