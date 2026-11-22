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
