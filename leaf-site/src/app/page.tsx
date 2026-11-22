import Link from 'next/link'
import type { Metadata } from 'next'
import Story from '@/components/home/Story'
import { SPECS } from '@/data/specs'
import { StatusTag } from '@/components/StatusTag'

export const metadata: Metadata = {
  title: { absolute: 'SAGA Leaf: a small e-paper reader, in design' },
  alternates: { canonical: '/leaf/' },
  openGraph: { url: '/leaf/', title: 'SAGA Leaf', description: 'A small e-paper reader with four physical buttons, being designed by Proxima LLC.' },
}

export default function Home() {
  const status = SPECS.filter(s => s.group === 'Status')
  return (
    <>
      <Story />
      <section id="after-story" className="page !pt-24" aria-labelledby="where">
        <p className="eyebrow">Where it stands</p>
        <h2 id="where" className="beat-title">Honest about what isn’t finished.</h2>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {status.map(s => (
            <div key={s.id} className="panel p-5" data-src={s.src}>
              <dt className="text-sm text-dim">{s.label}</dt>
              <dd className="mt-1 text-lg">{s.value}</dd>
              <dd className="mt-3"><StatusTag status={s.status} /></dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 flex flex-wrap gap-3">
          <Link className="btn btn--ghost" href="/shop/saga-leaf/">Every spec, with its source</Link>
          <Link className="btn btn--primary" href="/shop/">Build your SAGA Leaf</Link>
        </p>
      </section>
    </>
  )
}
