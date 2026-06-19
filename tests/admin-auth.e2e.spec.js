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
