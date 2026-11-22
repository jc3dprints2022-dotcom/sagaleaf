'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { describe, DEFAULT_SELECTION, type Selection } from '@/data/catalog'
import { loadSelection } from '@/commerce/selection'
import { submitCheckout } from '@/commerce/checkout'

type Phase = 'idle' | 'loading' | 'done' | 'error'

export default function CartForm() {
  const [sel, setSel] = useState<Selection>(DEFAULT_SELECTION)
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  useEffect(() => setSel(loadSelection()), [])
  const lines = describe(sel)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPhase('loading'); setError('')
    const r = await submitCheckout({ email, selection: sel, company })
    if (r.ok) setPhase('done')
    else { setPhase('error'); setError(r.error) }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="your-config" className="panel p-6">
        <h2 id="your-config" className="!mt-0">Your configuration</h2>
        <dl className="mt-4 divide-y divide-ivory/10" data-testid="summary">
          {lines.map(l => (
            <div key={l.group} className="flex justify-between gap-4 py-3">
              <dt className="text-dim">{l.groupLabel}</dt>
              <dd className="text-right">{l.label}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 py-3"><dt className="text-dim">Price</dt><dd>Price not set yet</dd></div>
        </dl>
        <p className="mt-4 text-sm"><Link className="underline" href="/shop/">Change configuration</Link></p>
      </section>

      <section aria-labelledby="join" className="panel p-6">
        <h2 id="join" className="!mt-0">Join the preorder list</h2>
        <p className="mt-2 text-dim">This is a list, not an order. <strong className="text-ivory">No payment is taken and nothing is reserved.</strong> We’ll email you when there is something real to order, with a price and a date.</p>
        {phase === 'done' ? (
          <p role="status" className="banner mt-6" data-testid="success">Thank you. You’re on the list with this configuration. Nothing has been charged or reserved.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
            <label className="grid gap-1.5">
              <span className="text-sm">Email</span>
              <input className="input" type="email" name="email" autoComplete="email" required value={email}
                onChange={e => setEmail(e.target.value)} aria-invalid={phase === 'error'} aria-describedby={error ? 'cart-error' : undefined} />
            </label>
            <label className="absolute -left-[9999px]" aria-hidden="true">Company
              <input tabIndex={-1} autoComplete="off" name="company" value={company} onChange={e => setCompany(e.target.value)} />
            </label>
            <button className="btn btn--primary" type="submit" disabled={phase === 'loading'} data-testid="join">
              {phase === 'loading' ? 'Joining…' : 'Join the preorder list'}
            </button>
            {phase === 'error' && <p id="cart-error" role="alert" className="text-sm text-[#f0a493]">{error}</p>}
          </form>
        )}
      </section>
    </div>
  )
}
