# SAGA ecosystem research: ebook publishing and marketplace

Compiled 2026-11-16/17. Sources were fetched on those dates unless noted. Labels: **Verified** = the platform's own official page; **Reported** = press, trade, or survey reports; **Speculation** = my own inference. Several official pages (Draft2Digital's royalty-rate blog, Hypothesis pricing, US PIRG, gov.uk) couldn't be fetched. Claims that rest on them are marked unverified, or cite a secondary source.

Companion files: `ecosystem_findings.json` (34 findings), `unit_economics.json`, `scripts/unit_economics.py`.

---

## 0. Key platform facts (reference)

**Verified**
- **KDP 70%:** pays 0.70 × (list price − VAT − delivery) ([KDP royalty options](https://kdp.amazon.com/en_US/help/topic/G200644210)). On Amazon.com the 70% band is $2.99–$12.99. The ceiling went up from $9.99 on **2026-07-07** ([KDP list price requirements](https://kdp.amazon.com/en_US/help/topic/G200634560)).
- **KDP delivery:** US$0.15/MB with a $0.01 minimum. Brazil, Japan, Mexico and India need KDP Select enrollment to get 70%. The ebook must be priced at least 20% below the print edition. Ebooks in the UK have carried 0% VAT since 2020-05-01 (all from the [KDP digital pricing page](https://kdp.amazon.com/en_US/help/topic/G200634500), last updated 2026-04-21).
- **KDP 35%:** pays 0.35 × (list − VAT), with no delivery fee ([KDP](https://kdp.amazon.com/en_US/help/topic/G200644210)).
- **KDP payment timing:** royalties arrive about 60 days after the end of the sale month, or about 90 days for Expanded Distribution ([KDP payments](https://kdp.amazon.com/en_US/help/topic/GK2MKZUL6U3SFBPZ)).
- **KDP Select:** runs in 90-day terms. Kindle+ royalties come from the KDP Select Global Fund, split by share of KENP pages read or listened to. Pages pay only on first read, and the rate changes every month ([KDP Select](https://kdp.amazon.com/en_US/help/topic/G201541140)). Amazon doesn't publish per-page rates on that page.
- **DRM-free KDP books:** since **2026-01-20**, verified purchasers can download them as EPUB/PDF. Kindle+ borrowers can't ([KDP DRM help](https://kdp.amazon.com/en_US/help/topic/GDDXGH9VR22ACM8U)).
- **KDP AI rules:** AI-generated text, images or translations must be disclosed. AI-assisted work doesn't need disclosure ([KDP content guidelines](https://kdp.amazon.com/en_US/help/topic/G200672390)).
- **Draft2Digital:** keeps about 10% of retail price. New accounts pay a one-time $20 activation fee, and accounts earning under $100/yr pay a $12/yr maintenance fee. Payouts go out monthly around the 15th, with a $10 minimum for direct deposit ([D2D FAQ](https://draft2digital.com/faq/)).
- **Kobo Writing Life:** 70% at or above $2.99 (USD threshold), 45% below that, 20% for public domain. OverDrive library sales pay 50% of the library price, or 10% per cost-per-checkout loan ([KWL](https://kobowritinglife.zendesk.com/hc/en-us/articles/360058976032)).
- **Apple Books:** 70% at any price, with no delivery fees and no price matching ([authors.apple.com](https://authors.apple.com/)).
- **Google Play Books:** 70% in 60+ countries, at any price, once the partner accepts the updated terms. Other markets get the default 52%. The split is calculated on list price ([Google](https://support.google.com/books/partner/answer/9331459?hl=en)).
- **Direct-sales tools:**
  - Stripe: 2.9% + 30¢, plus 1.5% for international cards and 1% for currency conversion. Disputes cost $15. Stripe Tax costs 0.5% per transaction ([Stripe](https://stripe.com/pricing)).
  - Paddle: 5% + 50¢ as merchant of record (MoR) ([Paddle](https://www.paddle.com/pricing)).
  - Lemon Squeezy: also 5% + 50¢, but it has **stopped taking new sign-ups and shuts down 2027-03-31** ([Lemon Squeezy](https://www.lemonsqueezy.com/pricing)).
  - Gumroad: 10% + 50¢ on direct sales and 30% on Discover sales. It has been the MoR handling tax since 2025-01-01 ([Gumroad](https://gumroad.com/pricing)).
  - Payhip: free plan with a 5% fee, $29/mo with 2%, or $99/mo with 0%. Processor fees are extra ([Payhip](https://payhip.com/pricing)).
  - BookFunnel: $30, $200 or $300 per year ([BookFunnel](https://bookfunnel.com/pricing/)).
  - Kickstarter: 5% of funded totals, plus roughly 3–5% for payment processing ([Kickstarter](https://help.kickstarter.com/hc/en-us/articles/115005028634-What-are-the-fees)).

**Reported**
- Kindle Unlimited was renamed **Kindle+** on 2026-10-22 and now pays for audiobook listening from the same fund. Amazon hasn't published per-page rates or the size of the fund increase ([Written Word Media](https://www.writtenwordmedia.com/kindle-plus-for-authors/)).
- Draft2Digital announced its new fees on 2026-04-15. The Smashwords store pays 75% at $2.99 and up, and 40% below ([ALLi](https://selfpublishingadvice.org/what-the-draft2digital-fee-changes-mean-for-you-in-2026/)).

**Unverified**
- IngramSpark's ebook compensation rate. Its help page didn't load.
- KDP account-termination statistics. I found none.
- D2D's payout rate when distributing to Amazon.

---

## 1. Readers (brief)

**Five unmet needs**
1. Real ownership and portability of books they buy.
2. Discovery that isn't driven by ads.
3. Book clubs with shared reading built in.
4. Lending to friends and family.
5. Shorter library hold times.

**Strongest competitors:** Kindle/Kindle+, Apple Books, Kobo, Libby, and Bookshop.org.

**Most frustrating workflows**
- Store ebooks are app-locked licenses. Amazon now offers EPUB/PDF downloads only for books the author marked DRM-free (**Verified**, [KDP](https://kdp.amazon.com/en_US/help/topic/GDDXGH9VR22ACM8U)).
- Bookshop.org ebooks can be exported to apps like Apple Books, Marvin or Calibre, but not to Kindle (**Reported**, [Kindlepreneur](https://kindlepreneur.com/bookshop-org-ebook-platform/)).
- Library holds are long because libraries pay $55 or more for a two-year, single-user license on a book that costs consumers about $13 (**Reported**, [ULC 2026](https://www.urbanlibraries.org/files/E-Book-Pricing-Crisis_2026.pdf)).

**Transformative improvements (Speculation)**
- A DRM-free-by-default library with one-tap EPUB export.
- Club reading rooms with shared annotations.
- Lending for DRM-free titles that the author has opted into.

**Obstacles:** catalog access, Kindle device lock-in, and app-store purchase rules.

**Willingness to pay:** AAP reports that US ebook revenue across all segments was $2.2B in 2025, up 3.2% (**Reported**, [AAP](https://publishers.org/news/aap-statshot-annual-report-publishing-revenues-totaled-33-4-billion-for-calendar-year-2025/)). I found no direct evidence that readers pay extra for "ownership."

**Difficulty:** M.

**Success metrics:** monthly active readers, share of purchases exported or downloaded, club retention, and books finished per reader.

---

## 2. Authors

**Five unmet needs**
1. Owning the reader relationship. Retailers don't share buyer emails.
2. Predictable, fast payouts.
3. Discoverability without escalating ad spend.
4. Freedom from exclusivity traps.
5. One consolidated view of sales.

**Strongest competitors**
- **Amazon KDP/Kindle+:** dominant. Amazon itself claims 67% of US digital book sales. That figure is an estimate, not audited (**Reported**, [Good e-Reader, Jan 2025](https://goodereader.com/blog/electronic-readers/amazon-is-the-dominant-player-in-ebook-sales)).
- **Apple and Google:** both pay 70% at any price (**Verified**, above).
- **Kobo:** pays 70% at $2.99 and up (**Verified**).
- **Aggregators:** Draft2Digital and PublishDrive.
- **Direct-sales stacks:** Payhip, Gumroad, Shopify + BookFunnel, and Kickstarter.

**Most frustrating workflows**
- **KDP's band and exclusivity rules.** A $14.99 ebook drops to 35% on Amazon.com. Authors in Brazil, Japan, Mexico and India need Select exclusivity to earn 70% (**Verified**, [KDP](https://kdp.amazon.com/en_US/help/topic/G200634500)).
- **Kindle+ pay is opaque.** The pool is discretionary, the rate changes monthly, and Amazon hasn't announced how it will price audiobook listening (**Verified/Reported**, [KDP Select](https://kdp.amazon.com/en_US/help/topic/G201541140), [WWM](https://www.writtenwordmedia.com/kindle-plus-for-authors/)).
- **Slow payouts.** KDP pays about 60 days after month end (**Verified**). D2D notes that stores usually pay 30–60 days after the sale month (**Verified**, [D2D](https://draft2digital.com/faq/)).
- **Going wide costs more.** D2D added a $20 activation fee and a $12/yr fee (**Verified**).
- **Direct stacks are fragmented.** Selling direct means stitching together a store, a payment processor, BookFunnel delivery and tax handling (**Verified** fees above).
- **Platform risk.** Lemon Squeezy's shutdown shows the MoR layer itself can disappear (**Verified**, [Lemon Squeezy](https://www.lemonsqueezy.com/pricing)).
- **Ads, AI floods, and a push toward owned channels.** A survey of 582 self-selected authors found:
  - Amazon Ads use rises from 18% of beginners to 59% in the "got traction" tier.
  - 30% of respondents said their income was declining.
  - Respondents named AI-generated content floods and Amazon algorithm changes as problems.
  - Authors are moving to owned channels: their own sites, Payhip and Kickstarter.

  (**Reported**, [WWM 2026 survey](https://www.writtenwordmedia.com/2026-mid-year-indie-author-survey/))

**Potentially transformative improvements (Speculation)**
- Readers opt in at checkout to share their email with the author. This is GDPR-friendly because the reader controls it.
- Payouts every week instead of every 60 days.
- The same share at any price, with no delivery fees, matching what Apple and Google already do.
- Watermarked DRM-free files as the default.
- One sales dashboard, with optional distribution to other stores.
- Discovery through clubs and bookstore curation.

**Obstacles**
- Technical: tax and MoR compliance, building a watermarking pipeline, fraud and refund abuse on DRM-free files.
- Business: getting readers to the store at all (the cold-start problem), and authors' reliance on Kindle+ income.

**Willingness to pay**
- Authors already pay BookFunnel $30–$300/yr (**Verified**).
- They pay Payhip's $29–$99/mo plans (**Verified**).
- They accept Gumroad taking 10% + 50¢ (**Verified**).
- They spend on Amazon and Meta ads (**Reported**, WWM).

This is solid evidence that authors will pay for delivery, storefront and marketing tools.

**Difficulty:** M for store and payouts. L for discovery.

**Success metrics:**
- Number of active authors.
- Share of their revenue coming through SAGA.
- Median author net per sale.
- Size of opted-in reader email lists.
- Days from sale to payout.
- 12-month author retention.

---

## 3. Publishers

**Five unmet needs**
1. Cheap ONIX 3.x metadata pipelines.
2. EAA-compliant accessible EPUB and its metadata.
3. Controlling piracy without hurting readers.
4. Clear handling of territorial rights and pricing.
5. Timely, consistent reporting.

**Strongest competitors:**
- Distributors: Ingram CoreSource, Bookwire, PublishDrive, StreetLib and De Marque.
- Title management: Firebrand.
- Retailers: Amazon, Apple, Kobo and Google.

**Most frustrating workflows**
- **The ONIX migration.** Amazon stopped accepting ONIX 2.1 at the end of March 2026 and takes 3.0 and 3.1 instead. ONIX 3.1 states markets explicitly and needs more data points. The US ADA Title II deadline in April 2026 has accessibility-metadata needs similar to the EAA's (**Reported**, [BookNet Canada](https://www.booknetcanada.ca/blog/2025/5/23/amazon-is-ending-support-of-onix-21-march-2026)).
- **ISBN costs in the US.** Bowker charges $125 for one, $295 for ten and $575 for a hundred (**Verified**, [myidentifiers](https://www.myidentifiers.com/Get-your-isbn-now)). Some countries hand out ISBNs free, for example Canada through Library and Archives Canada. I didn't verify that on an official page this session.
- **European Accessibility Act.** Publications made available from 2025-06-28 must be accessible. That means EPUB 3 structure, alt text and reading order, plus ONIX code list 196 metadata, an accessibility summary, hazard declarations and a public accessibility statement (**Reported**, distributor guidance, [PublishDrive EAA guide](https://help.publishdrive.com/eaa-guide)). I didn't confirm the microenterprise exemption thresholds.
- **DRM choices.**
  - Adobe ACS is the long-standing incumbent.
  - **Readium LCP** is ISO/IEC 23078-2:2024. It has no per-transaction cost; licence providers pay a yearly certification fee to the non-profit EDRLab. EDRLab says it works with screen readers (**Verified, vendor**, [EDRLab](https://www.edrlab.org/readium-lcp/)).
  - Social DRM (watermarking) is the low-friction option.
- **Agency vs wholesale.** Under agency pricing the publisher sets the consumer price and the retailer takes a commission. Bookshop.org says it aims for ebook prices that match every other retailer (**Reported**, [PW](https://www.publishersweekly.com/pw/print/20250203/96906-bookshop-org-debuts-its-e-book-platform.html)). A new store therefore can't win on price for agency titles (**Speculation**, based on standard agency terms).

**Potentially transformative improvements (Speculation)**
- ONIX 3.x ingest plus a simple web form for small presses.
- An accessibility checker built into upload (Ace-style) that produces the EAA metadata automatically.
- A choice of LCP or watermark for each title.
- Daily per-title reporting through an API.

**Obstacles**
- LCP certification and integration.
- Rights and territory logic.
- Publishers won't take a risk on an unproven retailer.
- Big-five deals typically run through distributors and require DRM (see the Risks section).

**Willingness to pay**
- Publishers already pay distributors and title-management systems. The prices aren't public.
- They pay Bowker for ISBNs (**Verified**).
- I found no published evidence of what they'd pay a new channel. Answer: none found.

**Difficulty:** L to XL.

**Success metrics:**
- Number of small presses onboarded.
- Share of titles ingested by ONIX.
- Share of titles passing the EAA checks.
- Time to put a title live.
- Revenue per publisher.

---

## 4. Independent bookstores

**Five unmet needs**
1. A digital revenue line that doesn't send customers to Amazon.
2. Keeping the customer relationship.
3. Curation tools: staff picks and club shelves.
4. A digital partner that lasts.
5. Little or no integration work.

**Strongest competitors**
- **Bookshop.org ebooks**, launched 2025-01-28 with all major publishers (**Reported**, [PW](https://www.publishersweekly.com/pw/print/20250203/96906-bookshop-org-debuts-its-e-book-platform.html)). How the money splits:
  - A store gets 30% of the sale price when the purchase comes through its affiliate page.
  - Sales not tied to a store put 10% into a pool shared by all participating stores.
  - Sales through a store's own site were planned to return 100% of profits to that store.

  App-store rules mean readers have to buy on the web.
- **Libro.fm** for audiobooks. Its site doesn't publish the store share (**Verified**, [Libro.fm](https://libro.fm/about)).

**Most frustrating workflows (Reported)**
- Partners keep churning. ABA partnered with Kobo starting in 2012 ([PW](https://publishersweekly.com/pw/by-topic/industry-news/bookselling/article/53768-more-details-emerge-on-aba-kobo-partnership.html), search result only; I didn't verify the end date).
- Hummingbird joined ABA as a non-exclusive partner in 2018 ([Shelf Awareness](https://www.shelf-awareness.com/theshelf/2018-10-11/aba_hummingbird_digital_media_in_e-book_sales_partnership.html)). ABA dropped it on 2022-09-30 after 360 Media Direct acquired it, citing a conflict of interest and the fact that it ran on Amazon's AWS ([ABA](https://bookweb.org/civicrm/mailing/view?id=6516)).
- Bookshop.org ebooks don't reach Kindle, and indie self-published titles weren't in its catalog at launch ([Kindlepreneur](https://kindlepreneur.com/bookshop-org-ebook-platform/)).

**What makes SAGA attractive vs competitive (Speculation)**
- **Attractive:**
  - A store share at least matching Bookshop.org's 30% affiliate share.
  - Store-branded club rooms.
  - Indie-author catalog that Bookshop doesn't carry.
  - Contractual portability: if SAGA dies, the store keeps its customer list.
  - Not running on Amazon infrastructure, given ABA's stated AWS concern. This is cheap to choose early.
- **Competitive:** a SAGA store that sells the same trade titles and pulls readers directly would compete with Bookshop.org. Partnering with stores, or even integrating with Bookshop.org, is the better position.

**Obstacles:**
- Bookshop.org's 30% share is the benchmark, and SAGA's margin can't pay 30% to a store *and* 20% to itself on a $4.99 book.
- The ABA relationship.
- Trade catalog access.

**Willingness to pay:** stores *receive* money; they don't pay for it. I found no evidence they'd pay SaaS fees. Answer: none found.

**Difficulty:** M.

**Success metrics:**
- Partner stores.
- Revenue routed to stores.
- Club rooms created per store.
- Store churn.

---

## 5. Education and research

**Five unmet needs**
1. Affordable course readings that students keep.
2. Social annotation without per-seat fees.
3. Privacy-respecting analytics.
4. Annotations and citations that can be exported.
5. Accessibility (the ADA Title II and EAA deadlines).

**Strongest competitors**
- **Perusall:** instructors choose a $5–$25 per-student fee (the "Course Choice" model, for courses created after 2026-07-06), or the institution buys an annual licence (**Verified**, [Perusall](https://www.perusall.com/pricing)).
- **Hypothesis.** Its pricing page didn't load, so pricing is unverified.
- **Zotero** for citations.
- **VitalSource and RedShelf** for courseware.

**Most frustrating workflows**
- **Automatic textbook billing ("inclusive access").** Critics say the costs are opt-out and access expires (**Reported**, US PIRG and the Canadian Association of Research Libraries, CARL). I saw these sources in search results only; the [PIRG page](https://pirg.org/edfund/resources/automatic-textbooks-billing-an-offer-students-cant-refuse/) failed to load, and I didn't open the [CARL statement](https://www.carl-abrc.ca/wp-content/uploads/2024/03/CARL_Statement_AutomaticTextbookBillingModels_EN.docx.pdf).
- **FERPA.** FERPA governs education records, and those rights pass to the student at 18 or on entering postsecondary school (**Verified**, [ED](https://studentprivacy.ed.gov/faq/what-ferpa)). Per-student reading analytics collected through courseware raise questions about who can access and share them (**Speculation**, details unverified).
- **Annotation lock-in.** The W3C Web Annotation Data Model has been a Recommendation since 2017-02-23. It uses JSON-LD with text-quote and position selectors (**Verified**, [W3C](https://www.w3.org/TR/annotation-model/)). Most ebook apps still don't export it.

**Transformative improvements (Speculation)**
- Export of W3C annotations plus BibTeX/RIS/CSL-JSON citations.
- Free group annotation on books students own.
- Instructor dashboards that show aggregates only, by default.
- Pricing friendly to open educational resources (OER).

**Obstacles:** LMS (LTI) integration, institutional procurement and data-processing agreements, accessibility audits, and incumbents' textbook contracts.

**Willingness to pay:** institutions and students already pay Perusall's per-student fees and licences (**Verified**).

**Difficulty:** L.

**Success metrics:**
- Courses adopting SAGA.
- Annotations per student.
- Export usage.
- Zero privacy incidents.
- Cost per student compared with inclusive access.

---

## 6. Where interests align

- **Authors, readers and stores** all benefit from discovery that reduces ad spend and from DRM-free, portable files (readers keep their books; authors get word of mouth).
- **Publishers and readers** both need accessible EPUB; the EAA makes accessibility the law, not a nice-to-have.
- **Stores and authors** both want the customer relationship back from Amazon.
- **Students and authors** both benefit from owned, annotatable texts that cite cleanly.

## 7. Where interests conflict (with recommended positions)

1. **Privacy vs analytics.**
   - Authors and publishers want reader data. Readers and students want privacy, and FERPA applies in education.
   - **Recommended position:** sell nothing at the individual level. Give authors aggregate sales and read-through numbers, with minimum cohort sizes. Share an email only when the reader opts in at purchase. In education, show instructors aggregates by default, and never sell reading data to third parties.
2. **Affordability vs royalties.**
   - Readers want cheap books. Authors want 80% or more of the price. Stores want a 30% share.
   - **Recommended position:** a fixed, published platform take of 15%, with no delivery fee. Pay a store share out of SAGA's take only on store-attributed sales, at about 10% to start. A store-attributed $4.99 sale then leaves SAGA a small loss. Accept that as customer acquisition cost, or set a $0.99 floor on price.
   - Don't promise a 30% store share and an 85% author share at the same time; the math doesn't work.
3. **Portability vs licensing.**
   - Readers want DRM-free files. Large publishers require DRM.
   - **Recommended position:** DRM-free with watermarking as the default and as SAGA's identity. Add LCP only when a publisher requires it, and label those titles clearly as "LCP-protected, readable in SAGA and other LCP apps." Never quietly downgrade ownership.

---

## 8. Business model and marketplace feasibility

**Market context**
- US ebook revenue was $2.2B in 2025 (**Reported**, [AAP](https://publishers.org/news/aap-statshot-annual-report-publishing-revenues-totaled-33-4-billion-for-calendar-year-2025/)).
- Amazon's share is an estimate; Amazon claims 67% of US digital book sales ([Good e-Reader](https://goodereader.com/blog/electronic-readers/amazon-is-the-dominant-player-in-ebook-sales)).
- ULC puts US ebook and e-audiobook sales at about $4.5B, with ULC member libraries paying at least $300M in licensing ([ULC](https://www.urbanlibraries.org/files/E-Book-Pricing-Crisis_2026.pdf)).
- **Library licensing (Reported):** a typical library licence costs $55 or more, lasts two years, and allows one user at a time, against about $13 for a consumer copy ([ULC](https://www.urbanlibraries.org/files/E-Book-Pricing-Crisis_2026.pdf)). Kobo pays authors 10% of the library price per cost-per-checkout loan through OverDrive (**Verified**, [KWL](https://kobowritinglife.zendesk.com/hc/en-us/articles/360058976032)). I didn't verify hoopla's pricing.

**App stores**
- Apple historically made apps either use in-app purchase (30%) or remove all links to outside purchase. That's why the Kindle iOS app couldn't sell books.
- After the 2025-04-30 Epic contempt order, Amazon added a "Get Book" button that opens web checkout (**Reported**, [MacRumors](https://www.macrumors.com/2025/05/06/kindle-app-gets-biggest-ios-change-in-a-decade/)).
- On 2025-12-11 the Ninth Circuit ruled that Apple can eventually charge a "reasonable" commission on purchases through external links. The amount goes back to the district court, and Apple can charge nothing until it's set (**Reported**, [MacRumors](https://www.macrumors.com/2025/12/11/APPLE-APP-STORE-FEES-EXTERNAL-PAYMENT-LINKS/)).
- **Plan for a future Apple fee on iOS-originated sales.**
- I didn't verify Google Play's user-choice billing or the EU DMA terms this session.

**Tax**
- EU VAT is charged at the buyer's country rate.
- UK ebooks have been zero-rated since 2020-05-01 (**Verified**, [KDP](https://kdp.amazon.com/en_US/help/topic/G200634500)).
- US state sales tax on digital goods varies by state. I didn't verify the rates per state.
- An MoR (Paddle or Gumroad) absorbs this compliance work, at the higher fee shown below.

**Refunds and chargebacks:** Stripe charges $15 per dispute (**Verified**). For DRM-free files, a "refund" can't take the copy back. Watermarking plus refund rate limits are needed (**Speculation**).

### Unit economics

US buyer, price before US sales tax, 2 MB file (an assumption). The table was computed by `scripts/unit_economics.py`. "Platform net" is the retailer's gross margin, or SAGA's revenue after card processing; it is not profit.

Formulas:
- KDP 70%: author = 0.70 × (P − 0.15 × 2)
- KDP 35%: author = 0.35 × P
- Kobo: author = 0.70 × P
- D2D to Apple or Kobo: author = 0.70P − 0.10P
- Stripe direct: author = P − (0.029P + 0.30)
- MoR direct: author = P − (0.05P + 0.50)
- Gumroad: author = P − (0.10P + 0.50)
- SAGA at take t: author = (1 − t)P; SAGA = tP − processing fee

| Channel | $4.99 author | $4.99 platform | $9.99 author | $9.99 platform |
|---|---|---|---|---|
| (a) KDP 70% (delivery $0.30) | 3.28 | 1.71 | 6.78 | 3.21 |
| (b) KDP 35% | 1.75 | 3.24 | 3.50 | 6.49 |
| (c) Kobo Writing Life 70% | 3.49 | 1.50 | 6.99 | 3.00 |
| (d) D2D → Apple/Kobo (60%) | 2.99 | 2.00 (retailer + D2D) | 5.99 | 4.00 |
| (e) Direct, Stripe (fee 0.44 / 0.59) | 4.55 | 0 | 9.40 | 0 |
| (e') Direct, MoR 5%+50¢ | 4.24 | 0 | 8.99 | 0 |
| Gumroad direct 10%+50¢ | 3.99 | 1.00 | 8.49 | 1.50 |
| (f) SAGA 10%, Stripe | 4.49 | **0.05** | 8.99 | 0.41 |
| SAGA 10%, MoR | 4.49 | **−0.25** | 8.99 | ≈0.00 |
| SAGA 15%, Stripe | 4.24 | 0.30 | 8.49 | 0.91 |
| SAGA 15%, MoR | 4.24 | ≈0.00 | 8.49 | 0.50 |
| SAGA 20%, Stripe | 3.99 | 0.55 | 7.99 | 1.41 |
| SAGA 20%, MoR | 3.99 | 0.25 | 7.99 | 1.00 |
| SAGA 15%, Stripe + $20 prepaid wallet (Speculation) | 4.24 | 0.53 | 8.49 | 1.06 |

**Takeaways (Speculation, derived from the table)**
- On a $4.99 book, card fees eat most of a 10% take. A 10% take via MoR loses money.
- At 15%, SAGA pays authors more than KDP 70% ($4.24 vs $3.28) and more than Kobo ($3.49), while still clearing about $0.30–$0.53.
- Batching purchases through a wallet or cart nearly doubles SAGA's margin on cheap books.
- Even so, about $0.30–$0.90 per sale means SAGA needs millions of sales to pay for staff. Book sales alone won't sustain the company.

### Revenue model options (Speculation, ranked)
1. **Per-book take of 15%**, flat, with no delivery fee, published, and the same at any price. This is the core of the store.
2. **Premium author tools** at $5–$15/mo. Covers: direct storefront, opt-in reader email capture, watermark delivery to any app, a sales dashboard that imports other stores' reports, and ARC/beta-reader rooms. Evidence: authors already pay BookFunnel and Payhip.
3. **Optional reader subscription** for features (clubs, sync, unlimited annotation export), *not* an all-you-can-read pool. A content pool would need large catalog guarantees and would copy Kindle+'s opaque payouts.
4. **Institutional licensing** of annotation and course-reading tools, priced against Perusall's per-student fees.
5. **Publisher services:** ONIX ingest, an EAA accessibility check, LCP hosting at cost plus margin, and optional outbound distribution at about 5–10%, undercutting D2D's ~10% plus fees.
6. **Hardware margin** on the Saga Leaf. This is a small, risky add-on, not a foundation.

---

## 9. Risks and things that are NOT feasible without publisher agreements

- **No big-five or major trade catalog without contracts.** Major publishers sell ebooks through retailer or distributor agreements on agency terms, with DRM. Bookshop.org launched with all major publishers only as an established, funded retailer (**Reported**, [PW](https://www.publishersweekly.com/pw/print/20250203/96906-bookshop-org-debuts-its-e-book-platform.html)). SAGA has **no** such relationships today, and this document doesn't assume any. Plan for a catalog of indie, small-press and public-domain books at launch.
- **DRM-free is a publisher choice, not SAGA's.** Trade titles will probably require Adobe or LCP (**Speculation**). Supporting LCP means certification and integration work ([EDRLab](https://www.edrlab.org/readium-lcp/)).
- **No buying inside the iOS app without Apple's cut.** Web checkout and US external links are allowed for now. A court-set Apple commission is coming ([MacRumors](https://www.macrumors.com/2025/12/11/APPLE-APP-STORE-FEES-EXTERNAL-PAYMENT-LINKS/)). Outside the US, the rules differ and I didn't verify them.
- **No Kindle delivery.** Bookshop.org can't deliver to Kindle either ([Kindlepreneur](https://kindlepreneur.com/bookshop-org-ebook-platform/)).
- **Library distribution** needs OverDrive or hoopla agreements, or a direct library aggregator.
- **Bookstore partnerships** need ABA trust. ABA has walked away from partners over ownership and AWS conflicts before ([ABA](https://bookweb.org/civicrm/mailing/view?id=6516)).
- **Regulatory load:** EAA accessibility of SAGA's own reader and store for EU users ([PublishDrive EAA guide](https://help.publishdrive.com/eaa-guide)), VAT and sales-tax collection, GDPR and FERPA. A prepaid wallet may raise stored-value or money-transmission issues; that's unverified and needs a lawyer.
- **MoR dependency:** Lemon Squeezy's shutdown shows that a payment partner can disappear ([Lemon Squeezy](https://www.lemonsqueezy.com/pricing)).
- **Market risk:** the US ebook market is about $2.2B and growing about 3% a year ([AAP](https://publishers.org/news/aap-statshot-annual-report-publishing-revenues-totaled-33-4-billion-for-calendar-year-2025/)). A new store at a 15% take on indie titles is a niche business unless tools and institutional revenue carry it.
- **Not feasible near-term:** competing with Kindle+ on an all-you-can-read subscription, and selling Kindle-compatible files of trade titles.
