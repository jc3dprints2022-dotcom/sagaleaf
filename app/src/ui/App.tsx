import { useEffect, useState, lazy, Suspense } from 'react'
import { useRoute, store, useLive, href } from '../app/state'
import { Icon, Wordmark } from './icons'
import { SyncStatusLine, Toasts, InstallHintBar } from './components'
import { importDropped } from '../app/importers'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { BookDetails } from './screens/BookDetails'
import { Notes } from './screens/Notes'
import { Search } from './screens/Search'
import { Collections, CollectionDetail } from './screens/Collections'
import { Devices, DeviceDetail } from './screens/Devices'
import { Settings } from './screens/Settings'
import { Catalog, CatalogItemView } from './screens/Catalog'
import { ImportScreen } from './screens/Import'
const Reader = lazy(() => import('./reader/Reader'))
import { FEATURES } from '../app/features'
const Author = FEATURES.authorPortal ? lazy(() => import('./screens/Author')) : null
const Publisher = FEATURES.authorPortal ? lazy(() => import('./screens/Publisher')) : null

const NAV = [
  { name: 'home', label: 'Home', icon: Icon.home, path: '' },
  { name: 'library', label: 'Library', icon: Icon.library, path: 'library' },
  { name: 'notes', label: 'Highlights & notes', short: 'Notes', icon: Icon.notes, path: 'notes' },
  { name: 'search', label: 'Search', icon: Icon.search, path: 'search' },
  { name: 'collections', label: 'Collections', icon: Icon.collections, path: 'collections' },
  { name: 'devices', label: 'Devices', icon: Icon.devices, path: 'devices' },
]

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

  useEffect(() => { if (route.name !== 'read') window.scrollTo(0, 0) }, [route.name, route.params.id])

  if (route.name === 'read') return <Suspense fallback={null}><Reader id={route.params.id} /><Toasts /></Suspense>

  const screen = (() => {
    switch (route.name) {
      case 'home': return <Home />
      case 'library': return <Library />
      case 'book': return <BookDetails id={route.params.id} />
      case 'notes': return <Notes />
      case 'search': return <Search />
      case 'collections': return <Collections />
      case 'collection': return <CollectionDetail id={route.params.id} />
      case 'devices': return <Devices />
      case 'device': return <DeviceDetail id={route.params.id} />
      case 'settings': return <Settings />
      case 'import': return <ImportScreen />
      case 'catalog': return <Catalog />
      case 'catalog-item': return <CatalogItemView id={route.params.id} />
      case 'author': case 'author-sub': if (Author) return <Author id={route.params.id} />; break
      case 'publisher': if (Publisher) return <Publisher />; break
    }
    return <div className="empty"><h2>Page not found</h2><p>That address doesn’t lead anywhere in SAGA Reader.</p><a className="btn" href="#/">Go home</a></div>
  })()
  const active = (n: string) => route.name === n || (n === 'library' && (route.name === 'book' || route.name === 'import')) || (n === 'collections' && route.name === 'collection') || (n === 'devices' && route.name === 'device') || (n === 'catalog' && route.name === 'catalog-item') || (n === 'author' && route.name === 'author-sub')

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <a href="#/" className="wordmark" aria-label="SAGA Reader home"><Wordmark /><b>SAGA Reader</b></a>
        <nav className="nav">
          {NAV.map(n => (
            <a key={n.name} href={href(n.path)} aria-current={active(n.name) ? 'page' : undefined}><n.icon />{n.label}{n.name === 'library' && count ? <span className="count">{count}</span> : null}</a>
          ))}
          <div className="nav-sep" />
          <a href={href('catalog')} aria-current={active('catalog') ? 'page' : undefined}><Icon.discover />Discover</a>
          {FEATURES.authorPortal && <>
            <a href={href('author')} aria-current={active('author') ? 'page' : undefined}><Icon.pen />SAGA Author</a>
            <a href={href('publisher')} aria-current={active('publisher') ? 'page' : undefined}><Icon.stamp />SAGA Publisher</a>
          </>}
          <a href={href('settings')} aria-current={active('settings') ? 'page' : undefined}><Icon.settings />Settings</a>
        </nav>
        <div className="rail-foot"><SyncStatusLine /></div>
      </aside>
      <main className="main" id="main">{route.name === 'home' && <InstallHintBar />}{screen}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.filter(n => n.name !== 'collections').map(n => <a key={n.name} href={href(n.path)} aria-current={active(n.name) ? 'page' : undefined}><n.icon />{n.short ?? n.label}</a>)}
      </nav>
      {dragging && <div className="drop-overlay"><div>Drop books to add them</div></div>}
      <Toasts />
    </div>
  )
}
