'use client'
import { sanitize, type Selection } from '@/data/catalog'

const KEY = 'saga-leaf:selection:v1'

export function loadSelection(): Selection {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return sanitize(null) }
}
export function saveSelection(sel: Selection) {
  try { localStorage.setItem(KEY, JSON.stringify(sel)) } catch { /* private mode: selection just isn't remembered */ }
}
