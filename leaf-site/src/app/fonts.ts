import localFont from 'next/font/local'

// Same families as the SAGA Reader app (copied from @fontsource-variable, OFL-1.1).
export const literata = localFont({
  src: [
    { path: '../fonts/literata-latin-wght-normal.woff2', style: 'normal', weight: '200 900' },
    { path: '../fonts/literata-latin-wght-italic.woff2', style: 'italic', weight: '200 900' },
  ],
  variable: '--font-literata',
  display: 'swap',
})
export const fraunces = localFont({
  src: [{ path: '../fonts/fraunces-latin-wght-normal.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-fraunces',
  display: 'swap',
})
export const hanken = localFont({
  src: [{ path: '../fonts/hanken-grotesk-latin-wght-normal.woff2', style: 'normal', weight: '100 900' }],
  variable: '--font-hanken',
  display: 'swap',
})
