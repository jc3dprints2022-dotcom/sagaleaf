import type { Metadata } from 'next'
import Link from 'next/link'
import Configurator from '@/components/shop/Configurator'

export const metadata: Metadata = {
  title: 'Build your SAGA Leaf (concept configurator)',
  description: 'Preview SAGA Leaf in 3D and choose a concept rear skin finish. Options, finishes and pricing are not final; no payment is taken.',
  alternates: { canonical: '/leaf/shop/' },
  openGraph: { url: '/leaf/shop/' },
}

export default function Shop() {
  return (
    <div className="page">
      <p className="banner mb-8" role="note"><strong>Concept configurator.</strong> Options, finishes and pricing are not final.</p>
      <p className="eyebrow">Shop</p>
      <h1>Build your SAGA Leaf</h1>
      <p className="lede">Turn it over, look closely, choose a rear skin. When you’re done, join the preorder list and we’ll write when there is something real to order.</p>
      <div className="mt-10"><Configurator /></div>
      <p className="mt-10 text-sm text-dim">Want the details first? <Link className="underline" href="/shop/saga-leaf/">Every spec, with its source</Link>.</p>
    </div>
  )
}
