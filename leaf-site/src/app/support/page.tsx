import type { Metadata } from 'next'
import { READER_APP } from '@/lib/paths'

export const metadata: Metadata = {
  title: 'Support and FAQ',
  description: 'Answers about SAGA Leaf: when it ships, whether it has a touchscreen, and how it will work with the SAGA Reader app.',
  alternates: { canonical: '/leaf/support/' },
  openGraph: { url: '/leaf/support/' },
}

const FAQ = [
  { q: 'When does it ship?', a: 'We’ll share a date when there is one. No device has been built yet, and we won’t give a date until it is ready.' },
  { q: 'Is it touchscreen?', a: 'No: e-paper with four buttons. BACK and PREV on the left edge, SELECT and NEXT on the right.' },
  { q: 'Will it work with the SAGA Reader app?', a: 'Sync is planned. The app already has a Devices screen built against a simulated Leaf, but sync has not run on Leaf hardware.' },
  { q: 'How much will it cost?', a: 'There is no price yet. The preorder list takes no payment and reserves nothing.' },
  { q: 'Does it have a front light?', a: 'Board 1 is unlit. A front-lit variant is planned and under evaluation.' },
  { q: 'How do I get books onto it?', a: 'It is designed for EPUB books stored on a microSD card you supply, and for wireless upload over Wi-Fi. This is in development.' },
]

export default function Support() {
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  return (
    <div className="page max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <p className="eyebrow">Support</p>
      <h1>Questions, answered plainly</h1>
      <div className="mt-10 grid gap-3">
        {FAQ.map(f => (
          <details key={f.q} className="panel group p-5">
            <summary className="cursor-pointer list-none text-lg font-medium">{f.q}</summary>
            <p className="mt-3 text-dim leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
      <h2>Need the app?</h2>
      <p className="text-dim">SAGA Reader is live in your browser today. <a className="underline text-ivory" href={READER_APP}>Open SAGA Reader</a>.</p>
    </div>
  )
}
