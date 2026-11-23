import type { Metadata } from 'next'
import Link from 'next/link'
import { SPECS, type Spec } from '@/data/specs'
import { StatusTag } from '@/components/StatusTag'
import { asset, READER_APP } from '@/lib/paths'

export const metadata: Metadata = {
  title: 'SAGA Leaf: what we know so far',
  description: 'Every SAGA Leaf spec with its status (confirmed, datasheet, estimated, planned) and source. 3.97″ e-paper, four buttons, USB-C, microSD, MagSafe-pattern magnetic ring.',
  alternates: { canonical: '/leaf/shop/saga-leaf/' },
  openGraph: { url: '/leaf/shop/saga-leaf/' },
}

export default function Product() {
  const groups = Array.from(new Set(SPECS.map(s => s.group)))
  return (
    <div className="page">
      <p className="eyebrow">SAGA Leaf</p>
      <h1>What we know so far</h1>
      <p className="lede">SAGA Leaf is a small e-paper reader being designed by Proxima LLC in Arizona. Nothing here is final. Each line says how we know it.</p>
      <figure className="mt-8">
        <img src={asset('renders/leaf-assembled.webp')} alt="SAGA Leaf rendered from the rev 4 CAD model, three-quarter view, with a copper rear skin" width={1600} height={1000} className="w-full rounded-2xl" />
        <figcaption className="mt-2 text-xs uppercase tracking-[0.12em] text-dim">Rendered from rev 4 CAD · concept finish</figcaption>
      </figure>
      <aside className="panel mt-8 p-5 text-sm">
        <p className="font-medium">How to read the tags</p>
        <ul className="mt-2 grid gap-1 text-dim sm:grid-cols-2">
          <li><StatusTag status="Confirmed" /> measured or decided</li>
          <li><StatusTag status="Datasheet" /> from the part’s datasheet</li>
          <li><StatusTag status="Estimated" /> from the CAD model, not measured</li>
          <li><StatusTag status="Planned" /> intended, not built</li>
          <li><StatusTag status="In development" /> being written, not yet run on Leaf hardware</li>
        </ul>
      </aside>
      {groups.map(g => (
        <section key={g} aria-labelledby={`g-${g}`}>
          <h2 id={`g-${g}`}>{g}</h2>
          <table className="spec-table">
            <tbody>
              {SPECS.filter(s => s.group === g).map((s: Spec) => (
                <tr key={s.id} data-spec={s.id}>
                  <th scope="row">{s.label}</th>
                  <td>{s.value}<span className="src">Source: {s.src}</span></td>
                  <td className="w-36 text-right"><StatusTag status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <section aria-labelledby="g-app-today">
        <h2 id="g-app-today">The app, today</h2>
        <p className="max-w-2xl text-dim">SAGA Reader is live on the web. These are real screenshots of it, with public-domain books. Leaf ↔ app sync is planned and has not run on hardware.</p>
        <div className="app-shots mt-6">
          <figure>
            <img src={asset('app/real/tablet-reader-highlighted.webp')} alt="SAGA Reader on a tablet: a page of a public-domain novel with two highlighted passages" width={834} height={1194} loading="lazy" />
            <figcaption>Reader with highlights</figcaption>
          </figure>
          <figure>
            <img src={asset('app/real/tablet-library.webp')} alt="SAGA Reader on a tablet: the library, a grid of public-domain book covers" width={834} height={1194} loading="lazy" />
            <figcaption>Library</figcaption>
          </figure>
          <figure>
            <img src={asset('app/real/tablet-typography.webp')} alt="SAGA Reader on a tablet: the Text and layout panel with themes, typefaces, size, spacing and margins" width={834} height={1194} loading="lazy" />
            <figcaption>Text and layout</figcaption>
          </figure>
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-dim">SAGA Reader app (live) · real screenshots · <a className="underline" href={READER_APP}>open the app</a></p>
      </section>
      <p className="mt-12 flex flex-wrap gap-3">
        <Link className="btn btn--primary" href="/shop/">Build your SAGA Leaf</Link>
        <Link className="btn btn--ghost" href="/support/">Questions</Link>
      </p>
    </div>
  )
}
