import { expect, test } from 'playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

const publishedWeek = {
  id: '2026-06-08',
  weekStart: '2026-06-08',
  weekEnd: '2026-06-14',
  shiftCount: 2,
  shifts: [
    {
      id: 'published-1',
      employeeId: '',
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
      employeeId: '',
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

const publishedMonth = {
  id: '2026-06',
  yearMonth: '2026-06',
  monthStart: '2026-06-01',
  monthEnd: '2026-06-30',
  shiftCount: publishedWeek.shifts.length,
  shifts: publishedWeek.shifts,
};

const publicEmployees = [
  {
    id: 'public-drossi',
    fullName: 'Δρόση Βασιλική',
    role: 'Προσωπικό',
    color: '#1D4ED8',
    isActive: true,
  },
  {
    id: 'public-roka',
    fullName: 'Ρόκα Κωνσταντίνα',
    role: 'Προσωπικό',
    color: '#1D4ED8',
    isActive: true,
  },
];

const publicAnnouncements = [
  {
    id: 'announcement-public',
    title: 'Ενημέρωση προγράμματος',
    body: 'Το πρόγραμμα της εβδομάδας είναι διαθέσιμο.',
    createdAt: '2026-06-08T08:00:00.000Z',
  },
];

const boundaryWeek = {
  id: '2026-06-29',
  weekStart: '2026-06-29',
  weekEnd: '2026-07-05',
  shiftCount: 2,
  shifts: [
    {
      id: 'boundary-june-30',
      employeeId: '',
      employeeName: 'Δρόση Βασιλική',
      date: '2026-06-30',
      startTime: '06:00',
      endTime: '14:00',
      type: 'work',
      label: '',
      shiftType: 'morning',
    },
    {
      id: 'boundary-july-01',
      employeeId: '',
      employeeName: 'Ρόκα Κωνσταντίνα',
      date: '2026-07-01',
      startTime: '10:00',
      endTime: '18:00',
      type: 'work',
      label: '',
      shiftType: 'intermediate',
    },
  ],
};

const juneMonthWithBoundaryWeek = {
  id: '2026-06',
  yearMonth: '2026-06',
  monthStart: '2026-06-01',
  monthEnd: '2026-06-30',
  shiftCount: 1,
  shifts: [boundaryWeek.shifts[0]],
};

async function seedPublicSchedule(page) {
  await page.evaluate(({ publishedSchedule, publishedMonth, publicEmployees, publicAnnouncements }) => {
    const store = window.__gasStationSchedulerStore;
    if (!store) throw new Error('Scheduler store dev hook was not exposed');
    const unsubscribe = () => {};
    store.getState().cleanupData?.();
    store.setState({
      employees: [],
      shifts: [],
      publishedSchedulesByWeek: {
        [publishedSchedule.weekStart]: publishedSchedule,
      },
      publishedSchedule,
      publishedMonthsByMonth: {
        [publishedMonth.yearMonth]: publishedMonth,
      },
      publishedMonth,
      publicEmployees,
      publicAnnouncements,
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
      _unsubscribePublishedMonth: null,
      _unsubscribePublicEmployees: null,
      _unsubscribePublicAnnouncements: null,
      _unsubscribeAuth: null,
      startPublishedScheduleSubscription: () => unsubscribe,
      startPublishedScheduleSubscriptions: () => ({}),
      startPublishedMonthSubscription: () => unsubscribe,
      startPublicEmployeesSubscription: () => unsubscribe,
      startPublicAnnouncementsSubscription: () => unsubscribe,
    });
  }, { publishedSchedule: publishedWeek, publishedMonth, publicEmployees, publicAnnouncements });
}

test('read-only mode renders a sanitized published schedule without admin data', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedPublicSchedule(page);

  await expect(page.getByText('Read-only Mode', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-08"]')).toContainText('Δρόση Βασιλική');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-08"]')).toContainText('06:00 - 14:00');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-06-09"]')).toContainText('Ρόκα Κωνσταντίνα');
  await expect(page.getByText('Ενημέρωση προγράμματος')).toBeVisible();
  await expect(page.getByText('Το πρόγραμμα της εβδομάδας είναι διαθέσιμο.')).toBeVisible();
  await expect(page.getByText('Σύνολο εβδομάδας: 16 ώρες')).toBeVisible();
  await expect(page.getByText('8 ώρες')).toHaveCount(2);
  await expect(page.getByText('internal replacement note')).toHaveCount(0);
  await expect(page.getByText('playwright@example.test')).toHaveCount(0);
  await expect(page.getByText('authorEmail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Αποθήκευση' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Οριστικοποίηση/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Εξαγωγή' })).toHaveCount(0);
  await expect(page.getByText('Ιστορικό Προγραμμάτων')).toHaveCount(0);
  await expect(page.getByText('Νέος υπάλληλος')).toHaveCount(0);
});

test('month view fills cross-month week days when a public week snapshot exists', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await page.evaluate(({ boundaryWeek, publishedMonth, publicEmployees }) => {
    const store = window.__gasStationSchedulerStore;
    const unsubscribe = () => {};
    store.getState().cleanupData?.();
    store.setState({
      employees: [],
      shifts: [],
      publishedSchedulesByWeek: {
        [boundaryWeek.weekStart]: boundaryWeek,
      },
      publishedSchedule: boundaryWeek,
      publishedMonthsByMonth: {
        [publishedMonth.yearMonth]: publishedMonth,
      },
      publishedMonth,
      publicEmployees,
      publicAnnouncements: [],
      isAdmin: false,
      adminUser: null,
      isLoading: false,
      isAuthLoading: false,
      isSaving: false,
      errorMessage: '',
      warningMessage: '',
      weekStart: boundaryWeek.weekStart,
      _unsubscribeEmployees: null,
      _unsubscribeShifts: null,
      _unsubscribeTemplates: null,
      _unsubscribeAnnouncements: null,
      _unsubscribeSchedulerSettings: null,
      _unsubscribePublishedSchedule: null,
      _unsubscribePublishedMonth: null,
      _unsubscribePublicEmployees: null,
      _unsubscribePublicAnnouncements: null,
      _unsubscribeAuth: null,
      startPublishedScheduleSubscription: () => unsubscribe,
      startPublishedScheduleSubscriptions: () => ({}),
      startPublishedMonthSubscription: () => unsubscribe,
      startPublicEmployeesSubscription: () => unsubscribe,
      startPublicAnnouncementsSubscription: () => unsubscribe,
    });
  }, { boundaryWeek, publishedMonth: juneMonthWithBoundaryWeek, publicEmployees });

  await page.getByLabel('Τύπος Προγράμματος').selectOption('month');

  await expect(page.getByRole('heading', { name: 'Εβδομάδα 29/06/2026 - 05/07/2026' })).toBeVisible();
  await expect(page.locator('[data-testid="day-box"][data-date="2026-07-01"]')).toContainText('Ρόκα Κωνσταντίνα');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-07-01"]')).toContainText('10:00 - 18:00');
  await expect(page.locator('[data-testid="day-box"][data-date="2026-07-01"]')).not.toContainText('No shifts');
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

  await expect(page.getByText('Admin Mode', { exact: true })).toBeVisible();
  const clearMonthButton = page.getByRole('button', { name: 'Καθαρισμός Μήνα' });
  await expect(clearMonthButton).toBeEnabled();
  await clearMonthButton.click();
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
