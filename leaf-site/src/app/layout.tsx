import type { Metadata, Viewport } from 'next'
import { literata, fraunces, hanken } from './fonts'
import { Nav, Footer } from '@/components/Nav'
import { SITE_URL } from '@/lib/paths'
import { GOATCOUNTER_LOADER } from '@/lib/goatcounter'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'SAGA Leaf: a small e-paper reader, in design', template: '%s · SAGA Leaf' },
  description: 'SAGA Leaf is a small 3.97″ e-paper reader with four physical buttons, being designed by Proxima LLC. Not built yet; no date or price until it is ready.',
  applicationName: 'SAGA Leaf',
  authors: [{ name: 'Proxima LLC' }],
  openGraph: { type: 'website', siteName: 'SAGA Leaf', locale: 'en_US', images: [{ url: '/leaf/og.jpg', width: 1200, height: 630, alt: 'SAGA Leaf rendered from the rev 4 CAD model' }] },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/leaf/icon.svg' },
  robots: { index: true, follow: true },
}
export const viewport: Viewport = { themeColor: '#0e0e10', colorScheme: 'dark' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${literata.variable} ${fraunces.variable} ${hanken.variable}`} suppressHydrationWarning>
      <body>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <script dangerouslySetInnerHTML={{ __html: GOATCOUNTER_LOADER }} />
      </body>
    </html>
  )
}
