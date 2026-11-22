import Link from 'next/link'
import { LAYERS } from '@/data/geometry'
import { CALLOUTS, spec } from '@/data/specs'
import { asset, READER_APP } from '@/lib/paths'
import { StatusTag } from '@/components/StatusTag'
import StoryController from './StoryController'

/**
 * The homepage story. All copy is real HTML (crawlable, readable without WebGL). By default it
 * lays out as stacked sections with static renders: that is the reduced-motion and no-WebGL path.
 * When motion and WebGL are available, an inline script marks <html class="cinematic"> before
 * first paint and StoryController turns the same markup into one pinned, scrubbed camera shot.
 */
const HARDWARE = [
  { key: 'display', body: 'Monochrome and reflective, with no glow of its own. Board 1 is unlit; a front light is planned and under evaluation.', specs: ['display-size', 'display-res', 'display-frontlight'] },
  { key: 'buttons', body: 'BACK and PREV on the left edge, SELECT and NEXT on the right, near the top where your thumbs rest.', specs: ['elec-buttons', 'display-touch'] },
  { key: 'ports', body: 'USB-C on the bottom edge for charging and data. Your books live on a microSD card you supply.', specs: ['elec-usb', 'elec-sd'] },
  { key: 'ring', body: 'A steel and magnet ring inside the rear lets it snap to the back of a phone or a magnetic mount.', specs: ['attach-ring'] },
  { key: 'thin', body: '64.19 × 102.02 × 8.47 mm with the rear skin, about 62 g. Estimated from the CAD model; nothing has been weighed yet.', specs: ['size-skin', 'size-mass'] },
] as const

export default function Story() {
  return (
    <>
      <script
        // Decide the layout before first paint so the page doesn't jump.
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var r=matchMedia('(prefers-reduced-motion: reduce)').matches;var c=document.createElement('canvas');var g=c.getContext('webgl2')||c.getContext('webgl');if(!r&&g&&!/[?&]static\\b/.test(location.search))document.documentElement.classList.add('cinematic')}catch(e){}})()`,
        }}
      />
      <section id="story" className="story" aria-label="SAGA Leaf, scene by scene">
        <div className="stage">
          <div className="stage-visual" aria-hidden="true">
            <img className="stage-poster" src={asset('renders/leaf-hero.webp')} alt="" width={1600} height={1000} fetchPriority="high" />
            <div id="stage-canvas" className="absolute inset-0" />
            <div className="stage-vignette" />
          </div>
          <p className="concept-badge" data-badge="render">Concept render</p>
          <p className="concept-badge concept-badge--screen" data-badge="screen">Concept screen: device UI in development</p>

          <div className="beats">
            <article className="beat beat--hero" data-beat="hero">
              <p className="eyebrow">Proxima · in design</p>
              <h1 className="font-display text-6xl sm:text-8xl font-light tracking-tight text-ivory">SAGA Leaf</h1>
              <p className="lede">A small e-paper reader, made for one thing: the page in front of you.</p>
              <p className="fine">Not built yet. It isn’t ready, and we won’t give a date until it is.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a className="btn btn--primary" href="#scene-assembly" data-explore>Explore</a>
                <Link className="btn btn--ghost" href="/shop/">Shop</Link>
              </div>
              <figure className="static-only">
                <img src={asset('renders/leaf-assembled.webp')} alt="Concept render of SAGA Leaf, three-quarter view, with a copper rear skin" width={1600} height={1000} loading="lazy" />
                <figcaption>Concept render</figcaption>
              </figure>
            </article>

            <article className="beat beat--side" id="scene-assembly" data-beat="assembly">
              <p className="eyebrow">I · Assembly</p>
              <h2 className="beat-title">Eight layers, one quiet page.</h2>
              <p className="lede">Each part sits where the rev 4 CAD model puts it, from the bezel at the front to the skin at the back.</p>
              <ol className="layers">
                {LAYERS.map((l, i) => (
                  <li key={l.id} data-layer={l.id}>
                    <span className="layer-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="layer-name">{l.label}</span>
                    <span className="layer-note">{l.note}</span>
                  </li>
                ))}
              </ol>
              <figure className="static-only">
                <img src={asset('renders/leaf-exploded.webp')} alt="Concept render of SAGA Leaf exploded into its eight layers" width={1600} height={1000} loading="lazy" />
                <figcaption>Concept render · layer positions estimated from rev 4 CAD</figcaption>
              </figure>
            </article>

            <article className="beat beat--side" data-beat="hardware">
              <p className="eyebrow">II · Hardware</p>
              <h2 className="beat-title">Built to be held, not tapped.</h2>
              <ul className="callouts">
                {HARDWARE.map(h => (
                  <li key={h.key} data-callout={h.key} data-src={CALLOUTS[h.key].src}>
                    <h3 className="callout-title">{CALLOUTS[h.key].text}</h3>
                    <p>{h.body}</p>
                    <p className="tags">{h.specs.map(id => <StatusTag key={id} status={spec(id).status} />)}</p>
                  </li>
                ))}
              </ul>
              <figure className="static-only">
                <img src={asset('renders/leaf-rear.webp')} alt="Concept render of the rear with the shell shown see-through, revealing the magnetic ring and battery" width={1600} height={1000} loading="lazy" />
                <figcaption>Concept render · rear shell shown see-through</figcaption>
              </figure>
              <figure className="static-only">
                <img src={asset('renders/leaf-side.webp')} alt="Concept render of SAGA Leaf in side profile, showing the left-edge buttons" width={1600} height={1000} loading="lazy" />
                <figcaption>Concept render · about 8.5 mm thin (CAD estimate)</figcaption>
              </figure>
            </article>

            <article className="beat beat--side beat--screen" data-beat="screen">
              <p className="eyebrow">III · The page</p>
              <h2 className="beat-title">Then the device disappears.</h2>
              <ol className="steps">
                <li data-step="page"><strong>Turn.</strong> A page turn is a brief flash, the way e-paper refreshes.</li>
                <li data-step="type"><strong>Set the type.</strong> Fonts, size and margins, with your own fonts from microSD.</li>
                <li data-step="highlight"><strong>Keep a thought.</strong> Highlights and notes, saved on the device.</li>
              </ol>
              <p className="fine">Concept screen: device UI in development. The firmware is based on the open-source CrossPoint e-reader firmware and has not yet run on Leaf hardware. Text: <em>Pride and Prejudice</em>, Jane Austen (public domain).</p>
              <figure className="static-only">
                <img src={asset('renders/leaf-screen.webp')} alt="Concept e-paper reading page from Pride and Prejudice with a highlighted sentence and a note" width={960} height={1600} loading="lazy" className="max-w-xs" />
                <figcaption>Concept screen: device UI in development</figcaption>
              </figure>
            </article>

            <article className="beat beat--side" data-beat="ecosystem">
              <p className="eyebrow">IV · The app</p>
              <h2 className="beat-title">The app is already here.</h2>
              <p className="lede">SAGA Reader runs today in your browser, and an Android test build exists: your library, Discover across public-domain shelves, and sync between your devices.</p>
              <p className="tags"><span className="tag tag--live">SAGA Reader app (live)</span> <span className="tag tag--planned">Leaf ↔ app sync: planned</span></p>
              <p className="fine">Leaf ↔ app sync works against a simulated Leaf today, not on hardware.</p>
              <p className="mt-5"><a className="btn btn--ghost" href={READER_APP}>Open SAGA Reader</a></p>
              <figure className="static-only">
                <div className="flex gap-3 overflow-x-auto">
                  {['library', 'discover', 'settings'].map(n => (
                    <img key={n} src={asset(`app/${n}.webp`)} alt={`SAGA Reader app, ${n} screen`} width={390} height={844} loading="lazy" className="w-40 rounded-xl" />
                  ))}
                </div>
                <figcaption>SAGA Reader app (live) · real screenshots</figcaption>
              </figure>
            </article>

            <article className="beat beat--side" data-beat="studio">
              <p className="eyebrow">V · Yours</p>
              <h2 className="beat-title">Make it yours, when it’s ready.</h2>
              <p className="lede">Choose a rear skin finish and join the preorder list. No payment is taken and nothing is reserved.</p>
              <p className="mt-6"><Link className="btn btn--primary" href="/shop/">Build your SAGA Leaf</Link></p>
              <figure className="static-only">
                <img src={asset('renders/leaf-studio.webp')} alt="Concept render of SAGA Leaf in warm studio light" width={1600} height={1000} loading="lazy" />
                <figcaption>Concept render</figcaption>
              </figure>
            </article>
          </div>
          <div className="scroll-hint" aria-hidden="true"><span /></div>
        </div>
      </section>
      <StoryController />
    </>
  )
}
