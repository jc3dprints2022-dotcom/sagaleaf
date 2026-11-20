// Pieces shared by Discover and Home: a card's cover and tile, skeletons, and a Kindle-style carousel.
import { useEffect, useState } from 'react'
import { tintOf } from '../core/util'
import { SOURCE_LABEL, type DiscoverCard } from '../app/card'
import { catalogHref } from '../app/discover'

export function useMobile(max = 720) {
  const q = `(max-width: ${max - 1}px)`
  const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches)
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on) }, [q])
  return m
}

/** Fixed 2:3 box (see .cover), so images arriving late never move the page. Falls back to a typographic cover. */
export function DCover({ card, width, priority }: { card: Pick<DiscoverCard, 'title' | 'author' | 'cover' | 'id'>; width?: number | string; priority?: boolean }) {
  const [broken, setBroken] = useState(false)
  if (card.cover && !broken) return <div className="cover" style={{ width }}><img src={card.cover} alt="" width={200} height={300} loading={priority ? 'eager' : 'lazy'} decoding="async" {...(priority ? { fetchPriority: 'high' as const } : {})} onError={() => setBroken(true)} /></div>
  const h = tintOf(card.title + card.author)
  return <div className="cover gen" style={{ width, '--gen-bg': `hsl(${h} 28% 34%)`, '--gen-ink': `hsl(${h} 30% 94%)` } as React.CSSProperties}><span className="t">{card.title}</span><span className="rule" /><span className="a">{card.author}</span></div>
}

export function CardTile({ card, priority }: { card: DiscoverCard; priority?: boolean }) {
  return (
    <a className="book-tile" href={catalogHref(card.id)} data-card={card.id}>
      <DCover card={card} priority={priority} />
      <div className="meta"><h3>{card.title}</h3><p>{card.author}</p>{(card.source === 'wikisource' || card.scanned) && card.author !== SOURCE_LABEL[card.source] ? <p className="src">{SOURCE_LABEL[card.source]}</p> : null}</div>
    </a>
  )
}

export function Skeletons({ n = 6 }: { n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <div key={i} className="book-tile skel" aria-hidden="true"><div className="cover" /><div className="meta"><h3>&nbsp;</h3><p>&nbsp;</p></div></div>)}</>
}

/** Warms the browser cache for the first covers so the row paints with its pictures. */
export function prefetchCovers(cards: DiscoverCard[], n = 8) {
  // after the cards have painted, so the pictures never compete with the first frame
  setTimeout(() => { for (const c of cards.slice(0, n)) if (c.cover) { const i = new Image(); i.decoding = 'async'; i.src = c.cover } }, 400)
}

export function Carousel({ id, title, cards, loading, seeAll, empty, priority }: { id: string; title: string; cards: DiscoverCard[] | null; loading: boolean; seeAll?: string; empty?: string; priority?: boolean }) {
  return (
    <section className="d-row" aria-labelledby={`row-${id}`} data-row={id}>
      <h2 className="section-title" id={`row-${id}`}>{title}{seeAll && <a href={seeAll} className="see-all">See all</a>}</h2>
      {cards && !cards.length && !loading ? <p className="muted small">{empty ?? 'Nothing here right now.'}</p> : (
        <div className="carousel" role="list" aria-label={title}>
          {cards?.map((c, i) => <div key={c.id} role="listitem"><CardTile card={c} priority={priority && i < 6} /></div>)}
          {loading && !cards?.length && <Skeletons n={7} />}
        </div>
      )}
    </section>
  )
}
