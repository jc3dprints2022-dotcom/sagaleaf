import type { Metadata } from 'next'
import Still from './Still'

// Internal: renders fixed camera states for scripts/renders.mjs. Not linked, not indexed.
export const metadata: Metadata = { title: 'Render', robots: { index: false, follow: false } }
export default function Page() { return <Still /> }
