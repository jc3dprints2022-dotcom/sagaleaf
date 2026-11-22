import raw from './catalog.dev.json'

/**
 * Catalogue schema. Today only the development fixture exists (every item concept, unpriced).
 * The same shape carries real prices (minor units + currency), SKUs and stock later.
 */
export interface Price { amount: number; currency: string } // amount in minor units, e.g. cents
export type ItemStatus = 'preorder-interest' | 'preorder' | 'in-stock' | 'sold-out'
export interface CatalogItem {
  id: string
  label: string
  description: string
  swatch?: string
  concept: boolean
  price: Price | null
  sku: string | null
  stock: number | null
  status: ItemStatus
  available: boolean
  source: string
}
export interface CatalogGroup { id: 'model' | 'skin' | 'accessory'; label: string; required: boolean; items: CatalogItem[] }
export interface Catalog { version: number; currency: string | null; groups: CatalogGroup[] }

export const CATALOG = raw as unknown as Catalog

export type Selection = Record<CatalogGroup['id'], string>
export const DEFAULT_SELECTION: Selection = { model: 'leaf-unlit', skin: 'skin-copper', accessory: 'accessory-none' }

export const findItem = (group: CatalogGroup['id'], id: string) =>
  CATALOG.groups.find(g => g.id === group)?.items.find(i => i.id === id)

export function formatPrice(p: Price | null): string {
  if (!p) return 'Price not set yet'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.amount / 100)
}

/** Validates a stored selection against the catalogue; falls back to defaults for anything unknown or unavailable. */
export function sanitize(sel: Partial<Selection> | null | undefined): Selection {
  const out = { ...DEFAULT_SELECTION }
  for (const g of CATALOG.groups) {
    const v = sel?.[g.id]
    const item = v ? g.items.find(i => i.id === v) : undefined
    if (item && item.available) out[g.id] = item.id
  }
  return out
}

export function describe(sel: Selection) {
  return CATALOG.groups.map(g => {
    const item = g.items.find(i => i.id === sel[g.id])!
    return { group: g.id, groupLabel: g.label, id: item.id, label: item.label }
  })
}
