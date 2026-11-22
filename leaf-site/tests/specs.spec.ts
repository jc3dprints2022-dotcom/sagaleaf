import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SPECS } from '../src/data/specs'

test('every spec shown on the site is listed in docs/SPECS.md with its source and status', () => {
  const md = readFileSync(join(__dirname, '..', 'docs', 'SPECS.md'), 'utf8')
  for (const s of SPECS) {
    const row = md.split('\n').find(l => l.includes(`\`${s.id}\``))
    expect(row, `SPECS.md row for ${s.id}`).toBeTruthy()
    expect(row).toContain(s.value)
    expect(row).toContain(s.status)
    expect(row).toContain(s.src)
  }
})

test('product page renders every spec with its status', async ({ page }) => {
  await page.goto('/leaf/shop/saga-leaf/')
  for (const s of SPECS) await expect(page.locator(`[data-spec="${s.id}"]`)).toContainText(s.status)
})
