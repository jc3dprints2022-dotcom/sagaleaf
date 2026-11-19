// Line icons drawn for SAGA: 1.6px strokes, rounded joins, 24px grid.
import type { SVGProps } from 'react'
const I = (d: string, extra?: React.ReactNode) => (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d={d} />{extra}</svg>
)
export const Icon = {
  home: I('M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z'),
  library: I('M5 4h3v16H5zM10 4h3v16h-3zM15.2 5.2l2.9-.8 3.4 15.5-2.9.7z'),
  notes: I('M6 4h9l4 4v12H6zM15 4v4h4M9 12h7M9 15.5h5'),
  search: I('M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16.5 16.5 20 20'),
  collections: I('M4 7h7l2 2h7v10H4zM4 7V5h6'),
  devices: I('M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM10 18h4'),
  settings: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2.2.3-1.3-1.3L16.8 4.8 14 4 13 6h-2l-1-2-2.8.8.3 2.2L6.2 8.3 4 8 3 11l2 1v0l-2 1 1 3 2.2-.3 1.3 1.3-.3 2.2L10 20l1-2h2l1 2 2.8-.8-.3-2.2 1.3-1.3 2.2.3 1-3z'),
  discover: I('M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM15.5 8.5l-2 5-5 2 2-5z'),
  pen: I('M4 20l4-1 11-11-3-3L5 16zM14 7l3 3'),
  stamp: I('M9 4h6l-1 7h3l1 4H6l1-4h3zM5 19h14'),
  plus: I('M12 5v14M5 12h14'),
  back: I('M15 5l-7 7 7 7'),
  close: I('M6 6l12 12M18 6 6 18'),
  toc: I('M4 6h16M4 12h10M4 18h13'),
  bookmark: I('M7 4h10v16l-5-4-5 4z'),
  type: I('M5 7V5h14v2M12 5v14M9 19h6'),
  highlight: I('M5 19h6M14 4l6 6-8 8H6v-6z'),
  note: I('M5 5h14v10H9l-4 4z'),
  copy: I('M9 9h11v11H9zM5 15V4h11'),
  trash: I('M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'),
  sync: I('M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4'),
  cloud: I('M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z'),
  download: I('M12 4v11M7 10l5 5 5-5M5 20h14'),
  upload: I('M12 20V9M7 14l5-5 5 5M5 4h14'),
  check: I('M5 12.5 10 17l9-10'),
  more: I('M5 12h.01M12 12h.01M19 12h.01', null),
  leaf: I('M6 20c0-9 6-15 15-16-1 9-7 15-15 16zM6 20l7-7'),
  sun: I('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
  moon: I('M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'),
  grid: I('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'),
  rows: I('M4 6h16M4 12h16M4 18h16'),
  battery: I('M3 8h15v8H3zM21 11v2', null),
  link: I('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'),
  restore: I('M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5'),
  play: I('M8 5l11 7-11 7z'),
  pause: I('M8 5h3v14H8zM14 5h3v14h-3z'),
  wifi: I('M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01'),
}
export function Wordmark() {
  return (<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--ink)" /><path d="M9 23c0-8 5-13 14-14-1 8-6 13-14 14z" fill="var(--accent)" /><path d="M9 23l7.5-7.5" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" /></svg>)
}
