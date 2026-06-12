import { expect, test } from 'playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

test('production admin login does not prefill demo admin email', async ({ page }) => {
  await page.goto(BASE_URL);

  await page.getByRole('button', { name: /Είσοδος Διαχειριστή/ }).click();

  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible();
  await expect(emailInput).toHaveValue('');
  await expect(page.getByText('Admin Mode')).toBeVisible();
  await expect(page.getByText('custom claim admin=true')).toBeVisible();
  await expect(page.getByText('admin@example.com')).toHaveCount(0);
});
