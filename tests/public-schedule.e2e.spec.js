import { expect, test } from 'playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

const publishedWeek = {
  id: '2026-06-08',
  weekStart: '2026-06-08',
  weekEnd: '2026-06-14',
  shiftCount: 2,
  shifts: [
    {
      id: 'published-1',
      employeeId: 'public-drossi',
      employeeName: 'Δρόση Βασιλική',
      date: '2026-06-08',
      startTime: '06:00',
      endTime: '14:00',
      type: 'work',
      label: '',
      shiftType: 'morning',
    },
    {
      id: 'published-2',
      employeeId: 'public-roka',
      employeeName: 'Ρόκα Κωνσταντίνα',
      date: '2026-06-09',
      startTime: '14:00',
      endTime: '22:00',
      type: 'work',
      label: '',
      shiftType: 'evening',
    },
  ],
};

async function seedPublicSchedule(page) {
  await page.evaluate((publishedSchedule) => {
    const store = window.__gasStationSchedulerStore;
    if (!store) throw new Error('Scheduler store dev hook was not exposed');
    store.getState().cleanupData?.();
    store.setState({
      employees: [],
      shifts: [],
      publishedSchedulesByWeek: {
        [publishedSchedule.weekStart]: publishedSchedule,
      },
      publishedSchedule,
      isAdmin: false,
      adminUser: null,
      isLoading: false,
      isAuthLoading: false,
      isSaving: false,
      errorMessage: '',
      warningMessage: '',
      weekStart: publishedSchedule.weekStart,
      _unsubscribeEmployees: null,
      _unsubscribeShifts: null,
      _unsubscribeTemplates: null,
      _unsubscribeAnnouncements: null,
      _unsubscribeSchedulerSettings: null,
      _unsubscribePublishedSchedule: null,
      _unsubscribeAuth: null,
    });
  }, publishedWeek);
}

test('read-only mode renders a sanitized published schedule without admin data', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedPublicSchedule(page);

  await expect(page.getByText('Read-only Mode', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-08"]')).toContainText('Δρόση Βασιλική');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-08"]')).toContainText('06:00 - 14:00');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-09"]')).toContainText('Ρόκα Κωνσταντίνα');
  await expect(page.getByText('internal replacement note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
});

test('month clear confirmation dialog is portaled to the document body', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await page.evaluate(() => {
    const store = window.__gasStationSchedulerStore;
    store.getState().cleanupData?.();
    store.setState({
      employees: [],
      shifts: [],
      isAdmin: true,
      adminUser: { uid: 'playwright-admin', email: 'playwright@example.test' },
      isLoading: false,
      isAuthLoading: false,
      isSaving: false,
      errorMessage: '',
      warningMessage: '',
      clearMonthShifts: async () => true,
    });
  });

  await page.getByRole('button', { name: 'Καθαρισμός Μήνα' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Καθαρισμός μήνα');
  await expect(dialog).toContainText('Ναι, καθαρισμός');

  const matchingDialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]')).map((node) => ({
      parentIsBody: node.parentElement === document.body,
      text: node.textContent || '',
    })),
  );
  expect(matchingDialogs.some((item) => item.parentIsBody && item.text.includes('Καθαρισμός μήνα'))).toBe(true);
});
