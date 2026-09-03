import { expect, test } from 'playwright/test';
import { generateSmartMonthSchedule } from '../src/utils/autoSchedulerService.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5174';

test.setTimeout(60_000);

const seedEmployees = [
  {
    id: 'drossi',
    fullName: 'Δρόση Βασιλική',
    role: 'Προσωπικό',
    isActive: true,
    scheduleRole: 'custom',
    fixedDayOff: null,
    defaultShiftPreference: 'auto',
  },
  {
    id: 'loulakakis',
    fullName: 'Λουλακάκης Κώστας',
    role: 'Προσωπικό',
    isActive: true,
    scheduleRole: 'custom',
    fixedDayOff: null,
    defaultShiftPreference: 'auto',
  },
  {
    id: 'roka',
    fullName: 'Ρόκα Κωνσταντίνα',
    role: 'Προσωπικό',
    isActive: true,
    scheduleRole: 'custom',
    fixedDayOff: null,
    defaultShiftPreference: 'auto',
  },
  {
    id: 'spourlis',
    fullName: 'Σπουρλής Αντώνης',
    role: 'Προσωπικό',
    isActive: true,
    scheduleRole: 'custom',
    fixedDayOff: null,
    defaultShiftPreference: 'auto',
  },
];

const finalEmployees = [
  { ...seedEmployees[0], scheduleRole: 'intermediate', fixedDayOff: 5 },
  { ...seedEmployees[1], scheduleRole: 'core1', fixedDayOff: 4, weeklyFixedShiftSideRotation: true },
  { ...seedEmployees[2], scheduleRole: 'intermediate', fixedDayOff: 2 },
  { ...seedEmployees[3], scheduleRole: 'core2', fixedDayOff: 3, weeklyFixedShiftSideRotation: true },
];

const generatedMay = generateSmartMonthSchedule({
  month: 4,
  year: 2026,
  employees: finalEmployees,
  allShifts: [],
  existingMonthShifts: [],
  rules: {
    weeklyRotationEnabled: true,
    avoidConsecutiveSundays: true,
    allowManualOverride: true,
    startWithCoreAMorning: true,
  },
  roleConfig: {
    coreAId: 'loulakakis',
    coreBId: 'spourlis',
    intermediateId: 'roka',
  },
});

const generatedJune = generateSmartMonthSchedule({
  month: 5,
  year: 2026,
  employees: finalEmployees,
  allShifts: [],
  existingMonthShifts: [],
  rules: {
    weeklyRotationEnabled: true,
    avoidConsecutiveSundays: true,
    allowManualOverride: true,
    startWithCoreAMorning: true,
  },
  roleConfig: {
    coreAId: 'loulakakis',
    coreBId: 'spourlis',
    intermediateId: 'roka',
  },
});

function byDate(date) {
  return `[data-testid="day-box"][data-date="${date}"]`;
}

async function seedSchedulerStore(page) {
  const payload = {
    employees: seedEmployees,
    generatedSchedulesByMonth: {
      '2026-05': generatedMay,
      '2026-06': generatedJune,
    },
  };
  const applySeed = () =>
    page.evaluate(({ employees, generatedSchedulesByMonth }) => {
      const store = window.__gasStationSchedulerStore;
      if (!store) throw new Error('Scheduler store dev hook was not exposed');
      store.getState().cleanupData?.();

      store.setState({
        employees,
        shifts: [],
        shiftTemplates: [],
        weekHistory: [],
        weekTemplates: [],
        announcements: [],
        isAdmin: true,
        adminUser: { uid: 'playwright-admin', email: 'playwright@example.test' },
        isLoading: false,
        isAuthLoading: false,
        isSaving: false,
        errorMessage: '',
        warningMessage: '',
        _unsubscribeEmployees: null,
        _unsubscribeShifts: null,
        _unsubscribeTemplates: null,
        _unsubscribeAnnouncements: null,
        _unsubscribeSchedulerSettings: null,
        _unsubscribeAuth: null,
        generatorRules: {
          weeklyRotationEnabled: true,
          avoidConsecutiveSundays: true,
          allowManualOverride: true,
          startWithCoreAMorning: true,
        },
        saveEmployeeSchedulingRules: async (draft) => {
          const parsedFixedDayOff =
            draft.fixedDayOff === '' || draft.fixedDayOff === null || typeof draft.fixedDayOff === 'undefined'
              ? null
              : Number(draft.fixedDayOff);
          const nextRules = {
            scheduleRole: draft.scheduleRole || 'custom',
            fixedDayOff: Number.isInteger(parsedFixedDayOff) ? parsedFixedDayOff : null,
            participatesInRotation: Boolean(draft.participatesInRotation),
            participatesInSundayRotation: draft.participatesInSundayRotation !== false,
            defaultShiftPreference: draft.defaultShiftPreference || 'auto',
            weeklyFixedShiftSideRotation: draft.weeklyFixedShiftSideRotation === true,
          };

          store.setState((state) => ({
            employees: state.employees.map((employee) =>
              employee.id === draft.employeeId ? { ...employee, ...nextRules } : employee
            ),
            warningMessage: 'Οι κανόνες εργαζομένου ενημερώθηκαν.',
          }));
          return true;
        },
        saveGeneratorRules: async (rulesDraft) => {
          store.setState((state) => ({
            generatorRules: { ...state.generatorRules, ...rulesDraft },
            warningMessage: 'Οι ρυθμίσεις generator αποθηκεύτηκαν.',
          }));
          return true;
        },
        generateMagicMonth: async ({ month, year } = {}) => {
          const selectedMonth = Number.isInteger(month) ? month : store.getState().selectedMonth;
          const selectedYear = Number.isInteger(year) ? year : store.getState().selectedYear;
          const yearMonth = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
          const generated = generatedSchedulesByMonth[yearMonth] || generatedSchedulesByMonth['2026-05'];
          store.setState({
            shifts: generated.shifts,
            warningMessage: (generated.warnings || []).join(' | '),
          });
          return true;
        },
      });
    }, payload);

  await applySeed();
  await page.waitForTimeout(250);
  await applySeed();
}

test('employee scheduling roles are the source of truth for monthly generation', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedSchedulerStore(page);
  await page.getByTestId('scheduler-tab-legacy_employees').click();

  await expect(page.getByTestId('employee-rules-drossi')).toBeVisible();

  await page.getByTestId('employee-role-drossi').selectOption('intermediate');
  await page.getByTestId('employee-fixed-day-drossi').selectOption('5');
  await page.getByTestId('employee-rules-save-drossi').click();

  await page.getByTestId('employee-role-loulakakis').selectOption('core1');
  await page.getByTestId('employee-fixed-day-loulakakis').selectOption('4');
  await page.getByTestId('employee-rules-save-loulakakis').click();

  await page.getByTestId('employee-role-roka').selectOption('intermediate');
  await page.getByTestId('employee-fixed-day-roka').selectOption('2');
  await page.getByTestId('employee-rules-save-roka').click();

  await page.getByTestId('employee-role-spourlis').selectOption('core2');
  await page.getByTestId('employee-fixed-day-spourlis').selectOption('3');
  await page.getByTestId('employee-rules-save-spourlis').click();

  await expect(page.getByTestId('employee-role-loulakakis')).toHaveValue('core1');
  await expect(page.getByTestId('employee-role-spourlis')).toHaveValue('core2');
  await expect(page.getByTestId('employee-role-drossi')).toHaveValue('intermediate');
  await expect(page.getByTestId('employee-role-roka')).toHaveValue('intermediate');

  await page.getByTestId('schedule-mode-select').selectOption('month');
  await page.getByTestId('monthly-month-select').selectOption('4');
  await page.getByTestId('monthly-year-select').selectOption('2026');

  await expect(page.getByTestId('monthly-role-core1')).toContainText('Λουλακάκης Κώστας');
  await expect(page.getByTestId('monthly-role-core2')).toContainText('Σπουρλής Αντώνης');
  await expect(page.getByTestId('monthly-role-intermediates')).toContainText('Δρόση Βασιλική');
  await expect(page.getByTestId('monthly-role-intermediates')).toContainText('Ρόκα Κωνσταντίνα');
  await expect(page.getByTestId('monthly-role-summary')).not.toContainText('Δεν έχει οριστεί');

  await page.getByTestId('generate-monthly-schedule').click();

  await expect(page.locator('body')).not.toContainText('Δεν υπήρχε διαθέσιμος Intermediate / Coverage');
  await expect(page.locator(`${byDate('2026-05-12')} [data-employee-id="loulakakis"]`)).not.toHaveAttribute(
    'data-shift-type',
    'intermediate',
  );
  await expect(page.locator(`${byDate('2026-05-14')} [data-employee-id="loulakakis"]`)).toHaveCount(0);
  await expect(page.locator(`${byDate('2026-05-21')} [data-employee-id="loulakakis"]`)).toHaveCount(0);

  const may18CoreTypes = await page
    .locator(
      `${byDate('2026-05-18')} [data-employee-id="loulakakis"], ${byDate('2026-05-18')} [data-employee-id="spourlis"]`,
    )
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-shift-type')));

  expect(may18CoreTypes).toHaveLength(2);
  expect(new Set(may18CoreTypes).size).toBe(2);
  expect(may18CoreTypes).toEqual(expect.arrayContaining(['morning', 'evening']));
});

test('saving generator rules also persists pending employee role drafts before monthly generation', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedSchedulerStore(page);
  await page.getByTestId('scheduler-tab-legacy_employees').click();

  await page.getByTestId('employee-role-drossi').selectOption('intermediate');
  await page.getByTestId('employee-fixed-day-drossi').selectOption('5');
  await page.getByTestId('employee-role-loulakakis').selectOption('core1');
  await page.getByTestId('employee-fixed-day-loulakakis').selectOption('4');
  await page.getByTestId('employee-role-roka').selectOption('intermediate');
  await page.getByTestId('employee-fixed-day-roka').selectOption('2');
  await page.getByTestId('employee-role-spourlis').selectOption('core2');
  await page.getByTestId('employee-fixed-day-spourlis').selectOption('3');

  await expect(page.getByTestId('employee-role-loulakakis')).toHaveValue('core1');
  await expect(page.getByTestId('employee-role-drossi')).toHaveValue('intermediate');
  await expect(page.getByTestId('employee-role-roka')).toHaveValue('intermediate');

  await page.getByRole('button', { name: 'Αποθήκευση κανόνων generator' }).click();
  await page.waitForFunction(() => {
    const employees = window.__gasStationSchedulerStore?.getState?.().employees || [];
    const byId = new Map(employees.map((employee) => [employee.id, employee]));
    return byId.get('loulakakis')?.scheduleRole === 'core1' &&
      byId.get('spourlis')?.scheduleRole === 'core2' &&
      byId.get('drossi')?.scheduleRole === 'intermediate' &&
      byId.get('roka')?.scheduleRole === 'intermediate';
  });
  await page.getByTestId('schedule-mode-select').selectOption('month');
  await page.getByTestId('monthly-month-select').selectOption('5');
  await page.getByTestId('monthly-year-select').selectOption('2026');

  await expect(page.getByTestId('monthly-role-core1')).toContainText('Λουλακάκης Κώστας');
  await expect(page.getByTestId('monthly-role-core2')).toContainText('Σπουρλής Αντώνης');
  await expect(page.getByTestId('monthly-role-intermediates')).toContainText('Δρόση Βασιλική');
  await expect(page.getByTestId('monthly-role-intermediates')).toContainText('Ρόκα Κωνσταντίνα');
  await expect(page.getByTestId('monthly-role-summary')).not.toContainText('Δεν έχει οριστεί');

  await page.getByTestId('generate-monthly-schedule').click();
  await expect(page.locator(`${byDate('2026-06-01')} [data-employee-id="spourlis"]`)).not.toHaveAttribute(
    'data-shift-type',
    'intermediate',
  );
  await expect(page.locator(`${byDate('2026-06-03')} [data-employee-id="spourlis"]`)).toHaveCount(0);
});

test('OWNER Scheduler V2 configuration surfaces the complete supported contract responsively', async ({ page }, testInfo) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL);
  await page.waitForFunction(() => window.__gasStationSchedulerStore);
  await seedSchedulerStore(page);

  await page.getByTestId('scheduler-tab-v2_operating').click();
  const addMondayWindow = page.getByRole('button', { name: '+ Προσθήκη παραθύρου' }).first();
  await expect(addMondayWindow).toBeVisible();
  await expect(page.getByLabel('Δευτέρα παράθυρο 1 έναρξη')).toBeVisible();
  await addMondayWindow.click();
  await expect(page.getByLabel('Δευτέρα παράθυρο 2 έναρξη')).toHaveValue('09:00');
  await page.getByLabel('Δευτέρα παράθυρο 2 περνά τα μεσάνυχτα').check();
  await page.getByRole('button', { name: 'Αφαίρεση Δευτέρα παραθύρου 2' }).click();
  await expect(page.getByLabel('Δευτέρα παράθυρο 2 έναρξη')).toHaveCount(0);

  await page.getByTestId('scheduler-tab-v2_templates').click();
  await page.getByRole('button', { name: '+ Προσθήκη Προτύπου' }).click();
  await page.getByLabel('Τύπος βάρδιας').last().selectOption('NIGHT');
  await page.getByLabel('Έναρξη βάρδιας').last().fill('22:00');
  await page.getByLabel('Λήξη βάρδιας').last().fill('06:00');
  await page.getByLabel('Περνά τα μεσάνυχτα').last().check();
  await page.getByLabel('Μη αμειβόμενο διάλειμμα (λεπτά)').last().fill('30');
  await page.getByLabel('Απαιτούμενα skills/roles (με κόμμα)').last().fill('NIGHT_CERT');
  await expect(page.getByText(/Stable ID:/).last()).toBeVisible();
  await expect(page.getByLabel('Διάρκεια (Ώρες)').last()).toHaveValue('7.5');

  await page.getByTestId('scheduler-tab-v2_coverage').click();
  const addCoverageSlot = page.getByRole('button', { name: '+ Προσθήκη slot' }).first();
  await expect(addCoverageSlot).toBeVisible();
  await addCoverageSlot.click();
  await expect(page.getByRole('button', { name: 'Αφαίρεση slot' }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Αφαίρεση slot' }).last().click();
  await page.getByText('Max (HARD)').first().locator('..').getByRole('spinbutton').fill('4');
  await expect(page.getByText('Max (HARD)').first()).toBeVisible();
  await expect(page.getByText('Target (SOFT)').first()).toBeVisible();

  await page.getByTestId('scheduler-tab-v2_compliance').click();
  await page.getByLabel('Στόχος Ρεπό ανά Εβδομάδα (SOFT)').fill('2');
  await expect(page.getByLabel('Στόχος Ρεπό ανά Εβδομάδα (SOFT)')).toHaveValue('2');
  await expect(page.getByText('Στόχος Ρεπό ανά Εβδομάδα (SOFT)')).toBeVisible();
  await expect(page.getByText('Ελάχιστα Ρεπό ανά Εβδομάδα (HARD)')).toBeVisible();

  await page.getByTestId('scheduler-tab-v2_sunday').click();
  await expect(page.getByText('Πρότυπο βάρδιας Κυριακής/Αργίας')).toBeVisible();
  await expect(page.getByText('Συμμετέχοντες scheduling roles')).toBeVisible();
  await expect(page.getByText('Κλειστά στις δημόσιες αργίες')).toBeVisible();
  await page.getByLabel('Οι δημόσιες αργίες ακολουθούν την πολιτική Κυριακής').check();
  await page.getByLabel('Κλειστά στις δημόσιες αργίες').check();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const unexpectedRuntimeErrors = runtimeErrors.filter(
    (message) => !message.includes('Το Firebase δεν είναι ρυθμισμένο. Λείπουν env vars:'),
  );
  expect(unexpectedRuntimeErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('scheduler-v2-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByText('Συμμετέχοντες scheduling roles')).toBeVisible();
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(desktopOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('scheduler-v2-desktop.png'), fullPage: true });
});
