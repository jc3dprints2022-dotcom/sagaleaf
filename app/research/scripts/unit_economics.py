"""SAGA unit economics. US buyer, prices exclusive of US sales tax (tax added at checkout, not deducted).
Formulas are in each row's notes. All rates sourced in ASSUMPTIONS."""
import json

A = {
 "file_size_mb": {"value": 2.0, "source": "Speculation: typical text-only novel EPUB ~1-3 MB; assumption only"},
 "kdp_delivery_usd_per_mb": {"value": 0.15, "source": "https://kdp.amazon.com/en_US/help/topic/G200634500", "as_of": "page last updated 2026-04-21"},
 "kdp_70_band_usd": {"value": [2.99, 12.99], "source": "https://kdp.amazon.com/en_US/help/topic/G200634560", "as_of": "ceiling raised from 9.99 effective 2026-07-07"},
 "kdp_70_rate": {"value": 0.70, "source": "https://kdp.amazon.com/en_US/help/topic/G200644210"},
 "kdp_35_rate": {"value": 0.35, "source": "https://kdp.amazon.com/en_US/help/topic/G200644210"},
 "kobo_rate_at_or_above_2_99": {"value": 0.70, "source": "https://kobowritinglife.zendesk.com/hc/en-us/articles/360058976032", "as_of": "fetched 2026-11-16"},
 "apple_rate": {"value": 0.70, "source": "https://authors.apple.com/", "as_of": "fetched 2026-11-16"},
 "d2d_cut_of_retail": {"value": 0.10, "source": "https://draft2digital.com/faq/", "as_of": "fetched 2026-11-16; plus $20 one-time activation (new accounts) and $12/yr if <$100/yr royalties"},
 "stripe_pct": {"value": 0.029, "source": "https://stripe.com/pricing", "as_of": "fetched 2026-11-17; +1.5% intl cards, +1% FX"},
 "stripe_fixed": {"value": 0.30, "source": "https://stripe.com/pricing"},
 "mor_pct": {"value": 0.05, "source": "https://www.paddle.com/pricing (Paddle 5%+50c); Lemon Squeezy same but closing to new sign-ups, shutdown 2027-03-31 per https://www.lemonsqueezy.com/pricing"},
 "mor_fixed": {"value": 0.50, "source": "https://www.paddle.com/pricing"},
 "gumroad_direct": {"value": [0.10, 0.50], "source": "https://gumroad.com/pricing", "note": "MoR, tax handled since 2025-01-01; 30% on Discover sales"},
 "payhip_free_pct": {"value": 0.05, "source": "https://payhip.com/pricing", "note": "plus Stripe/PayPal fees"},
 "wallet_topup_usd": {"value": 20.00, "source": "Speculation: hypothetical SAGA prepaid wallet to amortize fixed card fee"},
}
r = lambda x: round(x + 1e-9, 2)
rows = []
def add(ch, P, cut_pct, fee, author, plat, notes):
    rows.append(dict(channel=ch, list_price=P, platform_cut_pct=round(cut_pct, 1),
                     delivery_or_processing_fee=r(fee), author_net=r(author), platform_net=r(plat), notes=notes))

sp, sf = A["stripe_pct"]["value"], A["stripe_fixed"]["value"]
mp, mf = A["mor_pct"]["value"], A["mor_fixed"]["value"]
mb = A["file_size_mb"]["value"]
for P in (4.99, 9.99):
    d = A["kdp_delivery_usd_per_mb"]["value"] * mb
    au = 0.70 * (P - d)
    add("KDP 70%", P, (P - au) / P * 100, d, au, P - au, "author = 0.70*(P - delivery); delivery = $0.15/MB * 2 MB; platform_net = Amazon gross margin before its own costs")
    au = 0.35 * P
    add("KDP 35%", P, 65, 0, au, P - au, "author = 0.35*P; no delivery fee")
    au = 0.70 * P
    add("Kobo Writing Life", P, 30, 0, au, P - au, "author = 0.70*P (P >= $2.99)")
    au = 0.70 * P - 0.10 * P
    add("Draft2Digital -> Apple/Kobo", P, 40, 0, au, P - au, "author = 0.70*P (retailer) - 0.10*P (D2D); platform_net = retailer 30% + D2D 10% combined. D2D-to-Amazon not modeled (rate unverified). Ignores $20 activation / $12 yr fees")
    fee = sp * P + sf
    add("Direct via Stripe (author's own store)", P, fee / P * 100, fee, P - fee, 0, "author = P - (0.029*P + 0.30); author handles tax registration, delivery (e.g. BookFunnel $30-$300/yr), support")
    fee = mp * P + mf
    add("Direct via MoR (Paddle-type)", P, fee / P * 100, fee, P - fee, 0, "author = P - (0.05*P + 0.50); MoR handles global VAT/sales tax")
    fee = 0.10 * P + 0.50
    add("Gumroad direct", P, fee / P * 100, fee, P - fee, fee, "author = P - (0.10*P + 0.50); Gumroad is MoR; platform_net shown gross (Gumroad pays its own processing)")
    for t in (0.10, 0.15, 0.20):
        fee = sp * P + sf
        add(f"SAGA {int(t*100)}% take, Stripe", P, t * 100, fee, (1 - t) * P, t * P - fee,
            f"author = (1-{t})*P; SAGA = {t}*P - (0.029*P + 0.30); SAGA absorbs processing; tax compliance is SAGA's cost (not modeled)")
        fee = mp * P + mf
        add(f"SAGA {int(t*100)}% take, MoR", P, t * 100, fee, (1 - t) * P, t * P - fee,
            f"author = (1-{t})*P; SAGA = {t}*P - (0.05*P + 0.50)")
    W = A["wallet_topup_usd"]["value"]
    t = 0.15
    fee = (sp * W + sf) * (P / W)
    add("SAGA 15% take, Stripe + $20 prepaid wallet (Speculation)", P, t * 100, fee, (1 - t) * P, t * P - fee,
        "per-book processing = (0.029*20 + 0.30) * P/20 (fee on top-up allocated pro rata); ignores breakage/refund liability and money-transmitter/stored-value legal questions")

out = {"assumptions": A, "rows": rows,
       "notes": ["US buyer; list price excludes US sales tax. EU/UK prices are VAT-inclusive, so author share is computed on price net of VAT (UK ebooks 0% VAT since 2020-05-01 per KDP page G200634500).",
                 "platform_net for retailers is their gross margin, not profit.",
                 "Generated by research/scripts/unit_economics.py on 2026-11-17."]}
json.dump(out, open("/home/claude/saga/research/unit_economics.json", "w"), indent=2)
print(f"{'channel':58s} {'P':>5s} {'cut%':>6s} {'fee':>5s} {'author':>6s} {'plat':>6s}")
for x in rows:
    print(f"{x['channel']:58s} {x['list_price']:5.2f} {x['platform_cut_pct']:6.1f} {x['delivery_or_processing_fee']:5.2f} {x['author_net']:6.2f} {x['platform_net']:6.2f}")
