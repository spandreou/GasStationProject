import { expect, test } from 'playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';

const seedEmployees = [
  { id: 'drossi', fullName: 'Δρόση Βασιλική', role: 'Προσωπικό', isActive: true, scheduleRole: 'intermediate' },
  { id: 'loulakakis', fullName: 'Λουλακάκης Κώστας', role: 'Προσωπικό', isActive: true, scheduleRole: 'core1' },
  { id: 'roka', fullName: 'Ρόκα Κωνσταντίνα', role: 'Προσωπικό', isActive: true, scheduleRole: 'intermediate' },
  { id: 'spourlis', fullName: 'Σπουρλής Αντώνης', role: 'Προσωπικό', isActive: true, scheduleRole: 'core2' },
];

async function seedAbsenceStore(page) {
  const applySeed = () => page.evaluate((employees) => {
    const store = window.__gasStationSchedulerStore;
    if (!store) throw new Error('Scheduler store dev hook was not exposed');
    store.getState().cleanupData?.();
    store.setState({
      employees,
      shifts: [],
      shiftTemplates: [],
      absences: [],
      weekHistory: [],
      weekTemplates: [],
      announcements: [],
      isAdmin: true,
      adminUser: { uid: 'playwright-admin', email: 'playwright@example.test' },
      isLoading: false,
      isAuthLoading: false,
      isAbsencesLoading: false,
      isSaving: false,
      errorMessage: '',
      warningMessage: '',
      _unsubscribeEmployees: null,
      _unsubscribeShifts: null,
      _unsubscribeTemplates: null,
      _unsubscribeAbsences: null,
      _unsubscribeAnnouncements: null,
      _unsubscribeSchedulerSettings: null,
      _unsubscribeAuth: null,
      createAbsence: async (input) => {
        store.setState((state) => ({
          absences: [
            ...state.absences,
            {
              id: 'absence-e2e-1',
              status: 'ACTIVE',
              scope: 'FULL_DAY',
              createdAt: '2026-06-01T00:00:00Z',
              updatedAt: '2026-06-01T00:00:00Z',
              ...input,
            },
          ],
          warningMessage: 'Η άδεια καταχωρήθηκε επιτυχώς.',
        }));
        return true;
      },
      updateAbsence: async () => true,
      cancelAbsence: async (absenceId) => {
        store.setState((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === absenceId ? { ...absence, status: 'CANCELLED' } : absence,
          ),
        }));
        return true;
      },
      deleteAbsence: async (absenceId) => {
        store.setState((state) => ({
          absences: state.absences.filter((absence) => absence.id !== absenceId),
        }));
        return true;
      },
    });
  }, seedEmployees);

  await applySeed();
  await page.waitForTimeout(250);
  await applySeed();
}

test('admin can add an absence and public view sees absences read-only', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedAbsenceStore(page);

  await page.getByTestId('absences-nav').click();
  await expect(page.getByTestId('absences-panel')).toBeVisible();
  await page.getByTestId('add-absence-button').click({ force: true });

  await page.getByTestId('absence-employee-select').selectOption('drossi');
  await page.getByTestId('absence-type-select').selectOption('LEAVE');
  await page.locator('[data-testid="absence-calendar-day"][data-date="2026-06-10"]').click();
  await page.locator('[data-testid="absence-calendar-day"][data-date="2026-06-12"]').click();
  await expect(page.getByTestId('absence-total-days')).toContainText('3');
  await page.getByTestId('absence-replacement-mode').selectOption('AUTO');
  await page.getByTestId('save-absence-button').click();

  await expect(page.getByTestId('absence-card')).toContainText('Δρόση Βασιλική');
  await expect(page.getByTestId('absence-card')).toContainText('Άδεια');
  await expect(page.getByTestId('absence-card')).toContainText('3 ημέρες');

  await page.evaluate(() => {
    window.__gasStationSchedulerStore.setState({
      isAdmin: false,
      adminUser: null,
    });
  });

  await page.waitForFunction(() => window.__gasStationSchedulerStore.getState().isAdmin === false);
  await page.getByTestId('absences-nav').click();
  await expect(page.getByTestId('absence-readonly-view')).toBeVisible();
  await expect(page.getByTestId('add-absence-button')).toHaveCount(0);
  await expect(page.getByTestId('edit-absence-button')).toHaveCount(0);
});
