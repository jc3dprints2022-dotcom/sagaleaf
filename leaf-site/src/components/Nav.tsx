import Link from 'next/link'
import { READER_APP } from '@/lib/paths'

export function Nav() {
  return (
    <header className="site-nav">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav aria-label="SAGA Leaf" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="nav-brand">SAGA <span className="text-amber">Leaf</span></Link>
        <ul className="flex items-center gap-0 sm:gap-2 text-[13px] sm:text-sm">
          <li className="hidden sm:block"><Link className="nav-link" href="/#story">Explore</Link></li>
          <li><Link className="nav-link" href="/shop/">Shop</Link></li>
          <li><a className="nav-link" href={READER_APP}>Reader app</a></li>
          <li><Link className="nav-link" href="/support/">Support</Link></li>
        </ul>
      </nav>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <p className="font-display text-xl text-ivory">SAGA Leaf</p>
          <p className="mt-2 text-dim">A small e-paper reader being designed by Proxima LLC in Arizona. It isn’t ready, and we won’t give a date until it is.</p>
        </div>
        <ul className="space-y-2">
          <li><Link className="foot-link" href="/shop/saga-leaf/">What we know so far</Link></li>
          <li><Link className="foot-link" href="/shop/">Concept configurator</Link></li>
          <li><Link className="foot-link" href="/support/">Support and FAQ</Link></li>
        </ul>
        <ul className="space-y-2">
          <li><a className="foot-link" href={READER_APP}>SAGA Reader app</a></li>
          <li><a className="foot-link" href="/">SAGA home</a></li>
          <li><a className="foot-link" href="/privacy.html">Privacy</a></li>
        </ul>
      </div>
      <p className="mx-auto max-w-6xl px-4 sm:px-6 pb-10 text-xs text-dim">The 3D views are rendered from the rev 4 CAD model: a prototype design, not a finished product. Sizes and weight are CAD estimates, not measurements. © Proxima LLC.</p>
    </footer>
  )
}
