// For tests that need real Node networking (fetch to local servers) plus a DOMParser.
import 'fake-indexeddb/auto'
import { Window } from 'happy-dom'
const g = globalThis as Record<string, unknown>
if (!g.DOMParser) g.DOMParser = new Window().DOMParser
