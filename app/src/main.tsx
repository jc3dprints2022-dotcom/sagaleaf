import { createRoot } from 'react-dom/client'
import './ui/styles.css'
import { App } from './ui/App'
import { boot } from './app/state'
import { initAccount } from './app/account'
import { registerServiceWorker, initInstallHint } from './app/pwa'

registerServiceWorker()
initInstallHint()

boot().then(() => { createRoot(document.getElementById('root')!).render(<App />); initAccount() }).catch(e => {
  document.getElementById('root')!.innerHTML = `<div style="padding:40px;font:16px system-ui;max-width:560px"><h1 style="font-size:22px">SAGA Reader couldn’t open its library</h1><p>Your browser blocked local storage (private browsing can do this). Your books are not affected. Details: ${String(e?.message ?? e)}</p></div>`
})
