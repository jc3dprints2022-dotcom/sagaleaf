# Business model and marketplace feasibility

*I'm not a lawyer or financial adviser. This is a feasibility analysis from published
sources. Tax, payments and publishing contracts need professional review before any money
moves.* Full sourcing is in `research/ecosystem_research.md` and
`research/unit_economics.json`; the live calculator is the *Unit economics* sheet in
`docs/SAGA-competitive-benchmark.xlsx`.

## Market reality

- **The US ebook market is about $2.2B a year and growing about 3%** (AAP StatShot, 2025). Amazon claims about two thirds of US digital book sales; that's an estimate, not audited.
- **SAGA has no publisher relationships.** Big-five and most trade ebooks require distribution contracts, agency pricing and usually DRM (E-017). Launch catalogue: indie authors, small presses, public domain.
- **App stores constrain in-app selling.** Since the April 2025 Epic order, US iOS apps can link out to web checkout. A December 2025 appeals ruling lets Apple charge a commission still to be set. Plan for a fee on iOS-originated sales.
- **Card fees punish cheap books.** Stripe's 2.9% + 30¢ is about 8.9% of a $4.99 sale. A merchant of record (5% + 50¢) is about 15%.

## What authors keep today (per sale, US buyer, 2 MB file)

| Channel | $4.99 book | $9.99 book |
|---|---|---|
| KDP 70% (0.70 × (price − $0.30 delivery)) | $3.28 | $6.78 |
| KDP 35% | $1.75 | $3.50 |
| Kobo Writing Life (70% ≥ $2.99) | $3.49 | $6.99 |
| Draft2Digital to Apple or Kobo | $2.99 | $5.99 |
| Direct, card processor | $4.55 | $9.40 |
| Direct, merchant of record | $4.24 | $8.99 |
| **SAGA at a 15% take** (proposed) | **$4.24** | **$8.49** |

After card fees, SAGA keeps $0.30 on a $4.99 sale and $0.91 on a $9.99 sale through a card
processor. Through a merchant of record that drops to about $0.00 and $0.50.

## Recommendation

1. **A flat, published 15% take at every price, with no delivery fee and no exclusivity.** Authors keep more than on KDP at common prices and the rule fits in one sentence. Batch card fees with a cart or prepaid balance (needs legal review: stored value can trigger money-transmission rules).
2. **Book sales won't fund the company.** At 15% of indie sales, SAGA earns cents per book. Margin has to come from elsewhere:
   - **SAGA Leaf hardware**, sold at a positive margin (V2 BOM target ≤ $30).
   - **Optional SAGA+ for readers**, selling capability rather than content: hosted encrypted sync with file storage beyond a free tier, high-quality TTS voices, on-device assistant features. Reading, import, export and basic sync stay free forever.
   - **Author tools** ($5–$15/month, priced against existing tools): direct-sales storefront, ARC and review-copy distribution with watermarking, opt-in mailing list export, launch analytics.
   - **Institutional annotation licences** for courses, priced against Perusall's $5–$25 per student, private by default.
   - Later, **publisher services** (validation, accessibility conformance, ONIX).
3. **Partner with bookstores, don't compete.** Store-attributed sales earn the store about 10% out of SAGA's take. A partner store's share is never taken from the author.

## What this means for the build order

The reader and the Leaf are the product. The store is a feature that becomes worth
building once there's an audience and a working merchant-of-record setup. That's why the
publishing side in this repository is a validated prototype with test data, not a
half-built payments system.

## Risks

- **Catalogue:** without trade titles, SAGA is a reader for books bought elsewhere. That's fine: it's the product the research supports.
- **Platform fees:** Apple's coming commission on linked-out purchases. Google Play's billing rules outside the US are unverified.
- **Regulation:**
  - EU Accessibility Act duties for SAGA's own reader and store.
  - VAT at the buyer's country rate.
  - GDPR, and FERPA in education.
  - Possible stored-value rules.
- **Payment partner risk:** Lemon Squeezy is closing on 2027-03-31; choose a merchant of record with a long runway and keep payment code behind an adapter.
- **Sync service cost:** encrypted file storage is the main variable cost. The free tier should cover positions and notes; file storage beyond a small allowance belongs in SAGA+.
