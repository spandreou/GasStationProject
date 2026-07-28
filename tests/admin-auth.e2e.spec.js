import { expect, test } from 'playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

test('production admin login does not prefill demo admin email or mention custom-claim authorization', async ({ page }) => {
  await page.goto(BASE_URL);

  await page.getByRole('button', { name: /Είσοδος Διαχειριστή/ }).click();

  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toHaveValue('');
  await expect(page.getByText('Tenant Admin Login')).toBeVisible();
  await expect(page.getByText('ενεργό tenant membership')).toBeVisible();
  await expect(page.getByText('custom claim admin=true')).toHaveCount(0);
  await expect(page.getByText('admin@example.com')).toHaveCount(0);
});

test('admin login stays centered in the viewport when the dashboard is taller than the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE_URL);
  await expect(page.getByRole('button', { name: /Είσοδος Διαχειριστή/ })).toBeVisible();

  await page.evaluate(() => {
    const dashboard = document.querySelector('.app-content-reveal');
    if (!dashboard) throw new Error('Dashboard reveal container was not found');
    dashboard.style.minHeight = '1600px';
    window.scrollTo(0, 0);
  });

  await page.getByRole('button', { name: /Είσοδος Διαχειριστή/ }).click();
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );

  const modalMetrics = await page.getByRole('heading', { name: 'Σύνδεση Διαχειριστή' }).evaluate((heading) => {
    const panel = heading.parentElement?.parentElement;
    if (!panel) throw new Error('Admin login panel was not found');
    const rect = panel.getBoundingClientRect();

    return {
      centerY: rect.top + rect.height / 2,
      viewportCenterY: window.innerHeight / 2,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(Math.abs(modalMetrics.centerY - modalMetrics.viewportCenterY)).toBeLessThanOrEqual(1);
  expect(modalMetrics.top).toBeGreaterThanOrEqual(16);
  expect(modalMetrics.bottom).toBeLessThanOrEqual(modalMetrics.viewportHeight - 16);
});
