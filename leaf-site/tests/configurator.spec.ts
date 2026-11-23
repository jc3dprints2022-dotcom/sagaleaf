import { test, expect } from '@playwright/test'

test('configurator: choose Slate, go to the cart, join the list (Formspree mocked)', async ({ page }) => {
  const formspree: { body: any }[] = []
  const external: string[] = []
  // Block every request that leaves localhost; record Formspree posts and answer them ourselves.
  await page.route(url => !/^http:\/\/localhost:4610\//.test(url.toString()), async route => {
    const url = route.request().url()
    if (url.startsWith('https://formspree.io/f/xgakypyr')) {
      formspree.push({ body: route.request().postDataJSON() })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    external.push(url)
    return route.abort()
  })

  await page.goto('/leaf/shop/')
  await expect(page.getByText('Concept configurator.')).toBeVisible()
  await expect(page.getByTestId('price')).toHaveText('Price not set yet')
  await expect(page.getByLabel(/Front-lit \(planned\)/)).toBeDisabled()
  await page.getByLabel(/Slate/).check()
  await expect(page.getByLabel(/Slate/)).toBeChecked()
  await page.getByTestId('to-cart').click()

  await expect(page).toHaveURL(/\/leaf\/cart\/$/)
  const summary = page.getByTestId('summary')
  await expect(summary).toContainText('Slate')
  await expect(summary).toContainText('SAGA Leaf (unlit)')
  await expect(page.getByText('No payment is taken and nothing is reserved.')).toBeVisible()

  // validation error first, no request
  await page.getByTestId('join').click()
  await expect(page.locator('#cart-error')).toContainText('valid email')
  expect(formspree).toHaveLength(0)

  await page.getByLabel('Email').fill('reader@example.com')
  await page.getByTestId('join').click()
  await expect(page.getByTestId('success')).toBeVisible()

  expect(formspree).toHaveLength(1)
  const body = formspree[0].body
  expect(body).toMatchObject({
    email: 'reader@example.com',
    type: 'leaf-preorder-interest',
    _subject: 'SAGA Leaf preorder interest',
    configuration: {
      model: { id: 'leaf-unlit', label: 'SAGA Leaf (unlit)' },
      skin: { id: 'skin-slate', label: 'Slate' },
      accessory: { id: 'accessory-none', label: 'No accessories announced yet' },
    },
  })
  expect(body).toHaveProperty('_gotcha', '')
  expect(external, 'no real external request may leave the test').toEqual([])
})

test('cart: server error shows a retryable error state', async ({ page }) => {
  await page.route(url => !/^http:\/\/localhost:4610\//.test(url.toString()), route =>
    route.request().url().startsWith('https://formspree.io/') ? route.fulfill({ status: 500, body: 'nope' }) : route.abort())
  await page.goto('/leaf/cart/')
  await page.getByLabel('Email').fill('reader@example.com')
  await page.getByTestId('join').click()
  await expect(page.locator('#cart-error')).toContainText('HTTP 500')
  await expect(page.getByTestId('join')).toBeEnabled()
})

test('configurator controls: roles, labels and keyboard path', async ({ page }) => {
  await page.route(url => !/^http:\/\/localhost:4610\//.test(url.toString()), r => r.abort())
  await page.goto('/leaf/shop/')
  // each option group is a labelled group of native radios
  for (const name of ['Model', 'Rear skin finish', 'Accessory']) await expect(page.getByRole('group', { name })).toBeVisible()
  const finish = page.getByRole('group', { name: 'Rear skin finish' })
  await expect(finish.getByRole('radio')).toHaveCount(2)
  await expect(finish.getByRole('radio', { name: /Copper/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Front-lit \(planned\)/ })).toBeDisabled()
  await expect(page.getByRole('group', { name: 'Preview' })).toBeVisible()
  // keyboard: arrow keys move the choice, and the change is announced
  await finish.getByRole('radio', { name: /Copper/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(finish.getByRole('radio', { name: /Slate/ })).toBeChecked()
  await expect(finish.getByRole('radio', { name: /Slate/ })).toBeFocused()
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
  await expect(page.locator('[aria-live=polite]')).toContainText('Slate rear skin')
  // the 3D preview, once live, is a labelled image and the reset control is a real button
  await page.mouse.move(20, 20); await page.mouse.move(60, 60)
  await page.waitForSelector('[data-testid=preview][data-ready]', { timeout: 60_000 })
  await expect(page.getByRole('img', { name: /3D preview of SAGA Leaf, rendered from the rev 4 CAD model/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible()
  await page.getByTestId('to-cart').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/leaf\/cart\/$/)
  await expect(page.getByTestId('summary')).toContainText('Slate')
})
