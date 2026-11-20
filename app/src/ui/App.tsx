import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useRoute, store, useLive, href } from '../app/state'
import { Icon, Wordmark } from './icons'
import { SyncStatusLine, Toasts, InstallHintBar } from './components'
import { importDropped } from '../app/importers'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { BookDetails } from './screens/BookDetails'
import { CollectionDetail } from './screens/Collections'
import { DeviceDetail } from './screens/Devices'
import { Settings } from './screens/Settings'
import { Catalog, CatalogItemView } from './screens/Catalog'
import { ImportModal } from './screens/ImportModal'
const Reader = lazy(() => import('./reader/Reader'))
import { FEATURES } from '../app/features'
import { PRODUCT } from '../app/product'
const Author = FEATURES.authorPortal ? lazy(() => import('./screens/Author')) : null
const Publisher = FEATURES.authorPortal ? lazy(() => import('./screens/Publisher')) : null

// Exactly four places, in the rail and the tab bar. Everything else lives inside one of them:
// Search, Notes and Collections are Library segments; Devices and Import are Settings and the Add pop-up.
const NAV = [
  { name: 'home', label: 'Home', icon: Icon.home, path: '' },
  { name: 'library', label: 'Library', icon: Icon.library, path: 'library' },
  { name: 'catalog', label: 'Discover', icon: Icon.discover, path: 'catalog' },
  { name: 'settings', label: 'Settings', icon: Icon.settings, path: 'settings' },
]
// Old addresses still resolve: they render inside their new home.
const LIBRARY_ROUTES = new Set(['library', 'search', 'notes', 'collections', 'import'])
const SETTINGS_ROUTES = new Set(['settings', 'devices', 'device'])
const KEEP_SCROLL = new Set(['home', 'library', 'catalog'])

export function App() {
  const route = useRoute()
  const [dragging, setDragging] = useState(false)
  const appearance = useLive(() => store.getMeta<'system' | 'light' | 'dark'>('appearance', 'system'), [], ['meta'])
  const count = useLive(async () => (await store.db.books.toArray()).filter(b => !b.deleted).length, [], ['books'])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { const dark = appearance === 'dark' || (appearance !== 'light' && mq.matches); document.documentElement.dataset.appearance = dark ? 'dark' : 'light'; document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#161b1e' : '#eceee9') }
    apply(); mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply)
  }, [appearance])

  // drop files anywhere to import
  useEffect(() => {
    let depth = 0
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDragging(true); e.preventDefault() } }
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false) }
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const drop = (e: DragEvent) => { e.preventDefault(); depth = 0; setDragging(false); const f = [...(e.dataTransfer?.files ?? [])]; if (f.length) importDropped(f) }
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('dragover', over); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])

  // Scroll: remember where Home, Library and Discover were; anything else starts at the top.
  const scrolls = useRef(new Map<string, number>())
  const prev = useRef<string>(route.name)
  const lastTab = useRef('library')
  useEffect(() => {
    const key = (n: string) => (LIBRARY_ROUTES.has(n) ? 'library' : n)
    if (KEEP_SCROLL.has(key(prev.current)) && prev.current !== route.name) scrolls.current.set(key(prev.current), window.scrollY)
    if (route.name !== 'read') {
      const y = KEEP_SCROLL.has(key(route.name)) ? scrolls.current.get(key(route.name)) : undefined
      if (y != null && (prev.current === 'read' || prev.current === 'book' || prev.current === 'catalog-item')) requestAnimationFrame(() => window.scrollTo(0, y)); else window.scrollTo(0, 0)
    }
    if (route.name !== 'read') lastTab.current = route.name === 'home' ? 'home' : 'library'
    prev.current = route.name
  }, [route.name, route.params.id])

  // Library stays mounted (hidden) once opened, so closing a book returns to it at once, scroll and filters intact.
  const opened = useRef(false)
  const inLibrary = LIBRARY_ROUTES.has(route.name)
  if (inLibrary) opened.current = true
  const libraryOpened = opened.current
  const reading = route.name === 'read'

  const screen = (() => {
    if (inLibrary || reading) return null
    switch (route.name) {
      case 'home': return <Home />
      case 'book': return <BookDetails id={route.params.id} />
      case 'collection': return <CollectionDetail id={route.params.id} />
      case 'devices': return <Settings />
      case 'device': return <DeviceDetail id={route.params.id} />
      case 'settings': return <Settings />
      case 'catalog': return <Catalog />
      case 'catalog-item': return <CatalogItemView id={route.params.id} />
      case 'author': case 'author-sub': if (Author) return <Author id={route.params.id} />; break
      case 'publisher': if (Publisher) return <Publisher />; break
    }
    return <div className="empty"><h2>Page not found</h2><p>That address doesn’t lead anywhere in {PRODUCT.name}.</p><a className="btn" href="#/">Go home</a></div>
  })()
  const active = (n: string) => n === 'library' ? (inLibrary || route.name === 'book' || route.name === 'collection') : n === 'settings' ? SETTINGS_ROUTES.has(route.name) : n === 'catalog' ? (route.name === 'catalog' || route.name === 'catalog-item') : route.name === n
  return (
    <>
    {reading && <Suspense fallback={null}><Reader id={route.params.id} closeTo={lastTab.current === 'home' ? '#/' : '#/library'} /></Suspense>}
    <div className="shell" hidden={reading}>
      <aside className="rail" aria-label="Main">
        <a href="#/" className="wordmark" aria-label={`${PRODUCT.name} home`}><Wordmark /><b>{PRODUCT.name}</b></a>
        <nav className="nav">
          {NAV.map(n => (
            <a key={n.name} href={href(n.path)} aria-current={active(n.name) ? 'page' : undefined}><n.icon />{n.label}{n.name === 'library' && count ? <span className="count">{count}</span> : null}</a>
          ))}
          {FEATURES.authorPortal && <>
            <div className="nav-sep" />
            <a href={href('author')} aria-current={route.name === 'author' || route.name === 'author-sub' ? 'page' : undefined}><Icon.pen />SAGA Author</a>
            <a href={href('publisher')} aria-current={route.name === 'publisher' ? 'page' : undefined}><Icon.stamp />SAGA Publisher</a>
          </>}
        </nav>
        <div className="rail-foot"><SyncStatusLine /></div>
      </aside>
      <main className="main" id="main">{route.name === 'home' && <InstallHintBar />}{libraryOpened && <div hidden={!inLibrary}><Library /></div>}{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(n => <a key={n.name} href={href(n.path)} aria-current={active(n.name) ? 'page' : undefined}><n.icon />{n.label}</a>)}
      </nav>
      <ImportModal />
      {dragging && <div className="drop-overlay"><div>Drop books to add them</div></div>}
    </div>
    <Toasts />
    </>
  )
}
