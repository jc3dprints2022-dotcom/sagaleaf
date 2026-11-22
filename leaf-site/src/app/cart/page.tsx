import type { Metadata } from 'next'
import CartForm from '@/components/shop/CartForm'

export const metadata: Metadata = {
  title: 'Preorder list',
  description: 'Join the SAGA Leaf preorder list with your chosen configuration. No payment is taken and nothing is reserved.',
  alternates: { canonical: '/leaf/cart/' },
  robots: { index: false, follow: true },
}
export default function Cart() {
  return (
    <div className="page">
      <p className="banner mb-8" role="note"><strong>Concept configurator.</strong> Options, finishes and pricing are not final.</p>
      <p className="eyebrow">Preorder interest</p>
      <h1>Your SAGA Leaf</h1>
      <div className="mt-10"><CartForm /></div>
    </div>
  )
}
