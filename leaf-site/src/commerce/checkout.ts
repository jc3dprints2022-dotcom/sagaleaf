/**
 * Checkout boundary. Today the only provider is a preorder-interest list: no payment is taken
 * and nothing is reserved. A real payment provider plugs in behind CHECKOUT_PROVIDER later.
 */
import { describe, type Selection } from '@/data/catalog'

export type CheckoutProvider = 'waitlist' | 'stripe'
export const CHECKOUT_PROVIDER: CheckoutProvider = 'waitlist'

export const WAITLIST_ENDPOINT = 'https://formspree.io/f/xgakypyr'

export interface InterestRequest {
  email: string
  selection: Selection
  /** Honeypot: real people never fill this in. */
  company?: string
}
export type CheckoutResult = { ok: true } | { ok: false; error: string }

export function buildInterestPayload(req: InterestRequest) {
  const lines = describe(req.selection)
  return {
    email: req.email.trim(),
    type: 'leaf-preorder-interest',
    _subject: 'SAGA Leaf preorder interest',
    _gotcha: req.company ?? '',
    configuration: Object.fromEntries(lines.map(l => [l.group, { id: l.id, label: l.label }])),
    note: 'Preorder interest only. No payment taken, nothing reserved.',
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitCheckout(req: InterestRequest, provider: CheckoutProvider = CHECKOUT_PROVIDER, fetchImpl: typeof fetch = fetch): Promise<CheckoutResult> {
  if (provider === 'stripe') throw new Error('Stripe checkout is not configured')
  if (!EMAIL_RE.test(req.email.trim())) return { ok: false, error: 'Please enter a valid email address.' }
  // Bots fill every field; pretend success and send nothing.
  if (req.company) return { ok: true }
  try {
    const res = await fetchImpl(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(buildInterestPayload(req)),
    })
    if (res.ok) return { ok: true }
    let msg = `The list didn't accept that (HTTP ${res.status}). Please try again.`
    try { const j = await res.json(); if (j?.errors?.[0]?.message) msg = j.errors[0].message } catch { /* not JSON */ }
    return { ok: false, error: msg }
  } catch {
    return { ok: false, error: 'Network problem. Check your connection and try again.' }
  }
}
