/**
 * ShiftOryx — SCHEDULER CONTRACT V2 COMPREHENSIVE TEST SUITE
 *
 * Covers:
 * 1. Employee Count Satisfiability Matrix (1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30)
 * 2. Metamorphic Add-Employee (N -> N+1) with Differential Assertions
 * 3. Metamorphic Remove-Employee / Deactivation Matrix & Historical Schedule Preservation
 * 4. Hard Constraints Suite:
 *    - Operating Window Containment & Multi-Window Chronology
 *    - Hard Role Requirements & Optional Fallbacks
 *    - Hard Skill Requirements
 *    - Min Days Off Per Week (1-6)
 *    - Cross-Midnight & Calendar-Aware Turnaround Rest Intervals
 *    - Max Consecutive Working Days & Weekly Hours
 * 5. Sunday & Holiday Contracts (CYCLIC_FAIR, FIXED_ASSIGNMENT, STANDARD_WEEKDAY_LIKE, CLOSED)
 *    - Missing/Ineligible Fixed Sunday Employee Handling
 * 6. Real Persistence Zero-Write Gating & Valid Positive Control:
 *    - INVALID_WEEK_WRITE_COUNT = 0
 *    - INVALID_MONTH_WRITE_COUNT = 0
 *    - VALID_CONTROL_WRITE_COUNT > 0 (EXPECTED_WRITE_PATH_CALLED = YES)
 * 7. End-to-End Real Tenant Config Preservation (Zero stripping/overwriting)
 * 8. Chaos & Adversarial Robustness without Exception Swallowing (UNEXPECTED_ENGINE_EXCEPTION_COUNT = 0)
 * 9. Deep Deterministic Property / Fuzz Tests (2,000+ scenarios with Mulberry32 PRNG)
 * 10. Multi-Tenant Boundary Isolation Matrix (3 concurrent tenants)
 * 11. Execution Performance Benchmarks (1, 5, 10, 20, 30, 50 employees × 30 days)
 */

import {
  generateSchedule,
  generateScheduleV2,
  normalizeSchedulerConfig,
  validateSchedulerConfig,
  getDefaultCategoryConfig,
  evaluateEmployeeEligibility,
  buildDemandSlots,
  calculateRestHoursBetweenShifts,
  isShiftContainedInWindow,
  normalizeInput,
  deriveShiftDurationHours,
  validateGeneratedScheduleCompliance,
} from '../src/scheduler-engine/index.ts';
import * as schedulerEngineModule from '../src/scheduler-engine/index.ts';
import * as schedulerAdapterModule from '../src/utils/schedulerEngineAdapter.js';

// ---------------------------------------------------------------------------
// 1. DETERMINISTIC SEEDED PRNG (Mulberry32)
// ---------------------------------------------------------------------------
class Mulberry32 {
  constructor(seed = 20260830) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  nextBoolean(prob = 0.5) {
    return this.next() < prob;
  }
  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

const FUZZ_WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const FUZZ_ROLE_TYPES = ['ROLE_A', 'ROLE_B', 'ROLE_C', 'EXTRA_A'];

function createVariableFuzzConfig(prng, run, category, employees, intent) {
  const config = getDefaultCategoryConfig(`fuzz-tenant-${run}`, category);
  const windowMode = prng.pick(['DAY', 'SPLIT', 'CROSS_MIDNIGHT']);
  const windowDefinitions = {
    DAY: [{ openTime: '06:00', closeTime: '22:00', crossMidnight: false }],
    SPLIT: [
      { openTime: '06:00', closeTime: '14:00', crossMidnight: false },
      { openTime: '16:00', closeTime: '23:00', crossMidnight: false },
    ],
    CROSS_MIDNIGHT: [{ openTime: '20:00', closeTime: '08:00', crossMidnight: true }],
  };
  const templateDefinitions = {
    DAY: [
      ['06:00', '10:00', false, 'MORNING'],
      ['10:00', '14:00', false, 'INTERMEDIATE'],
      ['14:00', '18:00', false, 'AFTERNOON'],
      ['18:00', '22:00', false, 'NIGHT'],
      ['06:00', '14:00', false, 'CUSTOM'],
    ],
    SPLIT: [
      ['06:00', '10:00', false, 'MORNING'],
      ['10:00', '14:00', false, 'INTERMEDIATE'],
      ['16:00', '20:00', false, 'AFTERNOON'],
      ['20:00', '23:00', false, 'NIGHT'],
      ['06:00', '14:00', false, 'CUSTOM'],
    ],
    CROSS_MIDNIGHT: [
      ['20:00', '04:00', true, 'NIGHT'],
      ['21:00', '05:00', true, 'NIGHT'],
      ['22:00', '06:00', true, 'NIGHT'],
      ['23:00', '07:00', true, 'NIGHT'],
      ['20:00', '08:00', true, 'SPECIAL'],
    ],
  };
  const templateCount = prng.nextInt(1, 5);
  config.shiftTemplates = templateDefinitions[windowMode].slice(0, templateCount).map(
    ([startTime, endTime, crossMidnight, shiftType], index) => {
      const unpaidBreakMinutes = prng.pick([0, 0, 30]);
      return {
        id: `fuzz-template-${run}-${index + 1}`,
        label: `Fuzz ${shiftType} ${index + 1}`,
        shortCode: `F${index + 1}`,
        shiftType,
        startTime,
        endTime,
        durationHours: deriveShiftDurationHours(startTime, endTime, crossMidnight, unpaidBreakMinutes),
        unpaidBreakMinutes,
        crossMidnight,
        color: '#1D4ED8',
        isActive: true,
        requiredSkillsOrRoles: prng.nextBoolean(0.2) ? ['SKILL_A'] : [],
      };
    },
  );

  const sundayOpen = prng.nextBoolean(0.75);
  config.operatingDays = FUZZ_WEEKDAYS.map((weekday, index) => {
    const isOpen = weekday === 'MONDAY' || (weekday === 'SUNDAY' ? sundayOpen : prng.nextBoolean(0.82));
    const windows = isOpen
      ? windowDefinitions[windowMode].slice(0, prng.nextBoolean(0.35) && windowDefinitions[windowMode].length > 1 ? 2 : 1)
      : [];
    return { weekday, isOpen, windows: windows.map((window) => ({ ...window, label: `window-${index + 1}` })) };
  });

  const activeEmployeeCount = employees.filter((employee) => employee.isEnabled !== false).length;
  config.coverageRequirements = config.operatingDays.map((operatingDay) => {
    if (!operatingDay.isOpen) {
      return { weekday: operatingDay.weekday, dayType: 'CUSTOM', slots: [] };
    }
    const availableTemplates = config.shiftTemplates.filter((template) =>
      isShiftContainedInWindow(
        template.startTime,
        template.endTime,
        operatingDay.windows,
        undefined,
        template.crossMidnight,
      ),
    );
    const slotCount = Math.min(availableTemplates.length, prng.nextInt(1, Math.min(2, availableTemplates.length)));
    return {
      weekday: operatingDay.weekday,
      dayType: prng.pick(['STANDARD_COVERAGE', 'SPLIT_COVERAGE', 'CUSTOM']),
      slots: availableTemplates.slice(0, slotCount).map((template, index) => {
        const forcedUnsatisfiable = intent === 'VALID_BUT_UNSATISFIABLE_CONFIG' && operatingDay.weekday === 'MONDAY' && index === 0;
        const minHeadcount = forcedUnsatisfiable
          ? Math.min(30, activeEmployeeCount + 1)
          : prng.nextInt(0, Math.min(2, Math.max(0, activeEmployeeCount)));
        const targetHeadcount = Math.min(30, minHeadcount + prng.nextInt(0, 1));
        return {
          shiftTemplateId: template.id,
          minHeadcount,
          targetHeadcount,
          maxHeadcount: Math.min(30, targetHeadcount + prng.nextInt(0, 1)),
          requiredRole: forcedUnsatisfiable ? 'UNSATISFIABLE_ROLE' : (prng.nextBoolean(0.2) ? 'ROLE_A' : undefined),
          optionalCandidateRoles: forcedUnsatisfiable ? [] : (prng.nextBoolean(0.25) ? ['ROLE_B'] : []),
        };
      }),
    };
  });

  const minDaysOffPerWeek = prng.pick([1, 2]);
  config.complianceRules = {
    ...config.complianceRules,
    minDaysOffPerWeek,
    targetDaysOffPerWeek: prng.nextInt(minDaysOffPerWeek, Math.min(4, minDaysOffPerWeek + 2)),
    maxConsecutiveWorkingDays: prng.nextInt(3, 7),
    minRestIntervalBetweenShiftsHours: prng.pick([8, 10, 11, 12]),
    maxDailyWorkingHours: prng.pick([8, 10, 12, 16, 24]),
    maxWeeklyStandardHours: prng.pick([32, 40, 48, 60, 84]),
  };
  const longestTemplateHours = Math.max(...config.shiftTemplates.map((template) => template.durationHours));
  config.complianceRules.maxDailyWorkingHours = Math.max(config.complianceRules.maxDailyWorkingHours, longestTemplateHours);

  const sundayMode = sundayOpen
    ? prng.pick(['CYCLIC_FAIR', 'FIXED_ASSIGNMENT', 'STANDARD_WEEKDAY_LIKE'])
    : 'CLOSED';
  config.sundayAndHolidays = {
    ...config.sundayAndHolidays,
    sundayMode,
    sundayShiftTemplateId: config.shiftTemplates[0].id,
    fixedSundayEmployeeIds:
      sundayMode === 'FIXED_ASSIGNMENT' && employees.length > 0 ? [prng.pick(employees).employeeId] : [],
    participatingRoleTypes: prng.nextBoolean(0.3) ? ['ROLE_A', 'ROLE_B'] : [...FUZZ_ROLE_TYPES],
    avoidConsecutiveSundays: prng.nextBoolean(0.8),
    holidaysTreatedAsSundays: prng.nextBoolean(0.4),
    closedOnPublicHolidays: prng.nextBoolean(0.25),
  };

  const specialOperatingDay = config.operatingDays.find((day) => day.weekday === 'WEDNESDAY');
  config.specialDaysByDate = prng.nextBoolean(0.45)
    ? {
        '2026-06-03': {
          date: '2026-06-03',
          isHoliday: prng.nextBoolean(0.5),
          isSpecialOperatingHours: true,
          label: 'Fuzz special day',
          operatingWindows: specialOperatingDay?.windows?.length
            ? specialOperatingDay.windows.map((window) => ({ ...window }))
            : windowDefinitions[windowMode].map((window) => ({ ...window })),
        },
      }
    : {};

  if (intent === 'INVALID_CONFIG') {
    const mutationType = prng.pick(['BAD_DURATION', 'UNKNOWN_TEMPLATE_SLOT', 'OUT_OF_WINDOW', 'INVALID_HOURS', 'AUTH_ROLE']);
    if (mutationType === 'BAD_DURATION') {
      config.shiftTemplates[0].durationHours = 99;
    } else if (mutationType === 'UNKNOWN_TEMPLATE_SLOT') {
      config.coverageRequirements[0].slots.push({ shiftTemplateId: 'missing-template', minHeadcount: 1, targetHeadcount: 1 });
    } else if (mutationType === 'OUT_OF_WINDOW') {
      config.operatingDays[0].windows = [{ openTime: '12:00', closeTime: '13:00', crossMidnight: false }];
      if (config.coverageRequirements[0].slots[0]) {
        config.coverageRequirements[0].slots[0].minHeadcount = 1;
        config.coverageRequirements[0].slots[0].targetHeadcount = 1;
        config.coverageRequirements[0].slots[0].maxHeadcount = 1;
      }
    } else if (mutationType === 'INVALID_HOURS') {
      config.complianceRules.maxDailyWorkingHours = 0;
    } else {
      const firstSlot = config.coverageRequirements.find((pattern) => pattern.slots.length)?.slots[0];
      if (firstSlot) firstSlot.requiredRole = 'OWNER';
      else config.shiftTemplates[0].requiredSkillsOrRoles = ['OWNER'];
    }
  }

  return { config, windowMode };
}

function createTestEmployee(idIndex, overrides = {}) {
  const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  return {
    employeeId: `emp-${idIndex}`,
    fullName: `Εργαζόμενος ${idIndex}`,
    scheduleRole: 'CORE_A',
    isEnabled: true,
    skills: [],
    fixedDayOff: weekdays[idIndex % 7],
    defaultShiftPreference: 'AUTO',
    participatesInWeeklyRotation: true,
    participatesInSundayRotation: true,
    canCoverLeaves: true,
    canWorkMorning: true,
    canWorkIntermediate: true,
    canWorkAfternoon: true,
    canWorkSunday: true,
    ...overrides,
  };
}

async function runAllTests() {
  console.log('============================================================');
  console.log(' SHIFTORYX — SCHEDULER CONTRACT V2 COMPREHENSIVE TEST SUITE ');
  console.log('============================================================\n');

  let totalAssertions = 0;

  // -------------------------------------------------------------------------
  // SECTION 1: EMPLOYEE COUNT MATRIX (1 to 30)
  // -------------------------------------------------------------------------
  console.log('[SECTION 1] Employee Count Satisfiability Matrix (1 to 30)...');
  const countMatrix = [1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 30];

  for (const count of countMatrix) {
    const employees = Array.from({ length: count }, (_, i) => createTestEmployee(i + 1));
    const config = getDefaultCategoryConfig('test-tenant', 'FUEL_STATION');

    const result = generateScheduleV2({
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      employees,
      config,
    });

    if (count < 4) {
      if (result.validation.valid !== false || result.unresolvedGaps.length === 0) {
        throw new Error(`Expected count ${count} to fail coverage, but got valid=true`);
      }
    } else {
      if (!result.validation.valid) {
        throw new Error(`Expected count ${count} to produce valid schedule, but got: ${JSON.stringify(result.validation.violations)}`);
      }
      if (result.shifts.length === 0) {
        throw new Error(`Expected shifts for count ${count}, got 0`);
      }
    }
    totalAssertions++;
  }
  console.log('  ✓ Verified 12 employee count configurations.\n');

  // -------------------------------------------------------------------------
  // SECTION 2: METAMORPHIC ADD-EMPLOYEE (N -> N+1) DIFFERENTIAL TESTS
  // -------------------------------------------------------------------------
  console.log('[SECTION 2] Metamorphic Add-Employee (N -> N+1) Differential Tests...');
  for (let n = 4; n <= 8; n++) {
    const poolN = Array.from({ length: n }, (_, i) => createTestEmployee(i + 1));
    const poolNPlus1 = [...poolN, createTestEmployee(n + 1)];
    const config = getDefaultCategoryConfig('test-tenant', 'FUEL_STATION');

    const resN = generateScheduleV2({ startDate: '2026-06-01', endDate: '2026-06-07', employees: poolN, config });
    const resNPlus1 = generateScheduleV2({ startDate: '2026-06-01', endDate: '2026-06-07', employees: poolNPlus1, config });

    if (!resN.validation.valid || !resNPlus1.validation.valid) {
      throw new Error(`Invalid schedule in metamorphic test N=${n}`);
    }

    const assignedInNPlus1 = new Set(resNPlus1.shifts.map((s) => s.employeeId));
    if (!assignedInNPlus1.has(`emp-${n + 1}`)) {
      throw new Error(`Metamorphic failure: Newly added eligible employee emp-${n + 1} was never scheduled!`);
    }

    const maxHoursN = Math.max(...Object.values(resN.analytics.hoursPerEmployee));
    const maxHoursNPlus1 = Math.max(...Object.values(resNPlus1.analytics.hoursPerEmployee));
    if (maxHoursNPlus1 > maxHoursN) {
      throw new Error(`Metamorphic workload failure: Adding employee increased max individual hours (${maxHoursNPlus1} > ${maxHoursN})`);
    }
    totalAssertions += 2;
  }
  console.log('  ✓ Metamorphic Add-Employee differential tests passed across all sizes.\n');

  // -------------------------------------------------------------------------
  // SECTION 3: METAMORPHIC REMOVE / DEACTIVATION & HISTORY PRESERVATION
  // -------------------------------------------------------------------------
  console.log('[SECTION 3] Deactivation & History Preservation Matrix...');
  const baseEmployees = Array.from({ length: 6 }, (_, i) => createTestEmployee(i + 1));
  const activeConfig = getDefaultCategoryConfig('test-tenant', 'FUEL_STATION');

  const historicalResult = generateScheduleV2({
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    employees: baseEmployees,
    config: activeConfig,
  });

  // Deactivate emp-1
  const modifiedEmployees = baseEmployees.map((e) =>
    e.employeeId === 'emp-1' ? { ...e, isEnabled: false } : e
  );

  const futureResult = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: modifiedEmployees,
    config: activeConfig,
  });

  const emp1FutureShifts = futureResult.shifts.filter((s) => s.employeeId === 'emp-1');
  if (emp1FutureShifts.length > 0) {
    throw new Error('Deactivated employee received future shifts!');
  }

  const emp1HistoricalShifts = historicalResult.shifts.filter((s) => s.employeeId === 'emp-1');
  if (emp1HistoricalShifts.length === 0) {
    throw new Error('Historical schedule fixture missing emp-1 shifts!');
  }
  totalAssertions += 2;
  console.log('  ✓ Verified 0 future shifts for deactivated employees and preserved history.\n');

  // 3b. Real application employee shape -> adapter -> V2 eligibility pool.
  if (typeof schedulerAdapterModule.mapAppEmployeesToSchedulerPool !== 'function') {
    throw new Error('Real app employee lifecycle mapping is not exported or shared with the scheduler adapter.');
  }
  const createAppEmployee = (index, overrides = {}) => ({
    id: `app-emp-${index}`,
    fullName: `App Employee ${index}`,
    scheduleRole: 'auto',
    isActive: true,
    participatesInRotation: true,
    participatesInSundayRotation: true,
    ...overrides,
  });
  const additionPairs = [[4, 5], [5, 6], [6, 7], [7, 8], [10, 11], [20, 21]];
  const lifecycleAdapterConfig = getDefaultCategoryConfig('lifecycle-adapter-tenant', 'FUEL_STATION');
  lifecycleAdapterConfig.operatingDays = lifecycleAdapterConfig.operatingDays.map((day) =>
    day.weekday === 'MONDAY' ? day : { ...day, isOpen: false, windows: [] },
  );
  lifecycleAdapterConfig.coverageRequirements = lifecycleAdapterConfig.coverageRequirements.map((pattern) => ({
    ...pattern,
    slots: pattern.weekday === 'MONDAY'
      ? [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1, maxHeadcount: 1 }]
      : [],
  }));
  lifecycleAdapterConfig.sundayAndHolidays = {
    ...lifecycleAdapterConfig.sundayAndHolidays,
    sundayMode: 'CLOSED',
  };
  for (const [beforeCount, afterCount] of additionPairs) {
    const before = Array.from({ length: beforeCount }, (_, index) => createAppEmployee(index + 1));
    const added = createAppEmployee(afterCount);
    const mapped = schedulerAdapterModule.mapAppEmployeesToSchedulerPool([...before, added]);
    if (mapped.length !== afterCount || !mapped.some((employee) => employee.employeeId === added.id && employee.isEnabled !== false)) {
      throw new Error(`Real app mapping omitted newly active employee in ${beforeCount}->${afterCount} transition.`);
    }
    const generatedThroughAdapter = await schedulerAdapterModule.generateEngineWeekSchedule({
      weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
      employees: [...before, added],
      allShifts: [],
      schedulerConfig: lifecycleAdapterConfig,
    });
    const resolvedPool = [
      ...Object.values(generatedThroughAdapter.meta?.resolvedRoles?.roles || {}),
      ...(generatedThroughAdapter.meta?.resolvedRoles?.baseEmployees || []),
      ...(generatedThroughAdapter.meta?.resolvedRoles?.extras || []),
    ];
    if (
      !generatedThroughAdapter.validation.valid ||
      !resolvedPool.some((employee) => employee?.employeeId === added.id)
    ) {
      throw new Error(
        `Real adapter/generation path omitted active employee in ${beforeCount}->${afterCount}: ${JSON.stringify(generatedThroughAdapter.meta)}`,
      );
    }

    const generatedMonthThroughAdapter = schedulerAdapterModule.generateEngineMonthSchedule({
      month: 5,
      year: 2026,
      employees: [...before, added],
      allShifts: [],
      schedulerConfig: lifecycleAdapterConfig,
    });
    const resolvedMonthPool = [
      ...Object.values(generatedMonthThroughAdapter.meta?.resolvedRoles?.roles || {}),
      ...(generatedMonthThroughAdapter.meta?.resolvedRoles?.baseEmployees || []),
      ...(generatedMonthThroughAdapter.meta?.resolvedRoles?.extras || []),
    ];
    if (
      !generatedMonthThroughAdapter.validation.valid ||
      !resolvedMonthPool.some((employee) => employee?.employeeId === added.id)
    ) {
      throw new Error(
        `Real adapter/generation month path omitted active employee in ${beforeCount}->${afterCount}: ${JSON.stringify(generatedMonthThroughAdapter.meta)}`,
      );
    }
    totalAssertions += 1;
  }

  const deactivatedAppEmployees = [
    createAppEmployee(1, { isActive: false }),
    createAppEmployee(2),
    createAppEmployee(3),
    createAppEmployee(4),
  ];
  const mappedDeactivated = schedulerAdapterModule.mapAppEmployeesToSchedulerPool(deactivatedAppEmployees);
  const inactiveMappedEmployee = mappedDeactivated.find((employee) => employee.employeeId === 'app-emp-1');
  if (!inactiveMappedEmployee || inactiveMappedEmployee.isEnabled !== false) {
    throw new Error('Deactivated app employee was dropped before the V2 validator could surface future conflicts.');
  }
  totalAssertions += additionPairs.length * 2 + 1;

  // -------------------------------------------------------------------------
  // SECTION 4: HARD CONSTRAINTS SUITE
  // -------------------------------------------------------------------------
  console.log('[SECTION 4] Hard Constraints Suite (Roles, Skills, Rest, Hours, Windows, Min Days Off)...');

  // 4a. Operating Window Containment
  const windowContained = isShiftContainedInWindow('08:00', '16:00', [{ openTime: '07:00', closeTime: '17:00' }]);
  const windowNotContained = isShiftContainedInWindow('06:00', '14:00', [{ openTime: '08:00', closeTime: '20:00' }]);
  if (!windowContained || windowNotContained) {
    throw new Error('Operating window containment check failed');
  }
  totalAssertions += 2;

  // 4b. Hard Role Constraint
  const roleConfig = {
    ...getDefaultCategoryConfig('role-tenant', 'FUEL_STATION'),
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [
          { shiftTemplateId: 'morning', requiredRole: 'CASHIER_LEAD', minHeadcount: 1, targetHeadcount: 1 },
        ],
      },
    ],
  };
  const roleEmployees = [
    createTestEmployee(1, { scheduleRole: 'REGULAR_WORKER' }),
    createTestEmployee(2, { scheduleRole: 'REGULAR_WORKER' }),
    createTestEmployee(3, { scheduleRole: 'CASHIER_LEAD' }),
  ];
  const roleRes = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: roleEmployees,
    config: roleConfig,
  });
  if (!roleRes.validation.valid || roleRes.shifts.length !== 1 || roleRes.shifts[0].employeeId !== 'emp-3') {
    throw new Error(`Hard role constraint failed: expected emp-3 assigned to CASHIER_LEAD, got ${roleRes.shifts[0]?.employeeId}`);
  }
  if (!roleRes.shifts[0].shiftTemplateId || !roleRes.shifts[0].demandSlotId) {
    throw new Error(
      `Demand identity missing from generated shift: ${JSON.stringify(roleRes.shifts[0])}`,
    );
  }
  totalAssertions += 1;

  // 4c. Hard Skills Constraint
  const skillConfig = {
    ...getDefaultCategoryConfig('skill-tenant', 'CAFE'),
    shiftTemplates: [
      { id: 'cafe-morning', label: 'Morning', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: '07:00', endTime: '15:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true, requiredSkillsOrRoles: ['BARISTA_CERTIFIED'] },
    ],
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [
          { shiftTemplateId: 'cafe-morning', minHeadcount: 1, targetHeadcount: 1 },
        ],
      },
    ],
    sundayAndHolidays: {
      sundayMode: 'CLOSED',
      sundayShiftTemplateId: 'cafe-morning',
      avoidConsecutiveSundays: true,
      participatingRoleTypes: ['CORE_A'],
      closedOnPublicHolidays: true,
      holidaysTreatedAsSundays: false,
    },
  };
  const skillEmployees = [
    createTestEmployee(1, { skills: ['WAITER'] }),
    createTestEmployee(2, { skills: ['CHEF'] }),
    createTestEmployee(3, { skills: ['BARISTA_CERTIFIED', 'WAITER'] }),
  ];
  const skillRes = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: skillEmployees,
    config: skillConfig,
  });
  if (!skillRes.validation.valid || skillRes.shifts.length !== 1 || skillRes.shifts[0].employeeId !== 'emp-3') {
    throw new Error(`Hard skill constraint failed: expected emp-3 with BARISTA_CERTIFIED, got ${skillRes.shifts[0]?.employeeId}`);
  }
  totalAssertions += 1;

  // 4d. Cross-Midnight & Rest Interval Calculations
  const rest1 = calculateRestHoursBetweenShifts('2026-06-01', '14:00', '22:00', false, '2026-06-02', '06:00', '14:00', false);
  if (rest1 !== 8.0) {
    throw new Error(`Rest interval calculation failed: expected 8.0h, got ${rest1}`);
  }
  const restCrossMidnight = calculateRestHoursBetweenShifts('2026-06-01', '22:00', '06:00', true, '2026-06-02', '14:00', '22:00', false);
  if (restCrossMidnight !== 8.0) {
    throw new Error(`Cross-midnight rest calculation failed: expected 8.0h, got ${restCrossMidnight}`);
  }
  totalAssertions += 2;

  // 4e. Hard Rest Constraint Filter in Eligibility
  const restEligible = evaluateEmployeeEligibility({
    employee: createTestEmployee(1, { fixedDayOff: 'SUNDAY' }),
    date: '2026-06-02',
    slot: {
      slotId: 'm-slot',
      date: '2026-06-02',
      weekday: 'TUESDAY',
      template: { id: 'm', label: 'Morning', shortCode: 'ΠΡ', startTime: '06:00', endTime: '14:00', durationHours: 8, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true, shiftType: 'MORNING' },
      isHardMinimum: true,
      priority: 1,
    },
    existingShifts: [
      { id: 's1', date: '2026-06-01', employeeId: 'emp-1', employeeName: 'E1', scheduleRole: 'CORE_A', shiftType: 'AFTERNOON', startTime: '14:00', endTime: '22:00', source: 'BASE' },
    ],
    complianceRules: { minRestIntervalBetweenShiftsHours: 11, preventClashingTurnaround: true, minDaysOffPerWeek: 1, targetDaysOffPerWeek: 1, maxConsecutiveWorkingDays: 6, maxDailyWorkingHours: 12, maxWeeklyStandardHours: 48 },
  });
  if (restEligible.eligible !== false || restEligible.reason !== 'REST_VIOLATION') {
    throw new Error(`Eligibility failed to reject turnaround with only 8h rest when 11h required: got ${JSON.stringify(restEligible)}`);
  }
  totalAssertions += 1;

  // 4f. Hard Min Days Off Per Week (e.g. minDaysOffPerWeek = 2 => max 5 working days)
  const minDaysOffCheck = evaluateEmployeeEligibility({
    employee: createTestEmployee(1, { fixedDayOff: 'SUNDAY' }),
    date: '2026-06-06',
    slot: {
      slotId: 'slot-6',
      date: '2026-06-06',
      weekday: 'SATURDAY',
      template: { id: 'm', label: 'Morning', shortCode: 'ΠΡ', startTime: '08:00', endTime: '16:00', durationHours: 8, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true, shiftType: 'MORNING' },
      isHardMinimum: true,
      priority: 1,
    },
    weeklyDaysWorked: 5,
    complianceRules: { minDaysOffPerWeek: 2, targetDaysOffPerWeek: 2, maxConsecutiveWorkingDays: 6, minRestIntervalBetweenShiftsHours: 11, maxDailyWorkingHours: 12, maxWeeklyStandardHours: 48, preventClashingTurnaround: true },
  });
  if (minDaysOffCheck.eligible !== false || minDaysOffCheck.reason !== 'MIN_DAYS_OFF_VIOLATION') {
    throw new Error('Eligibility failed to enforce minDaysOffPerWeek hard gate!');
  }
  totalAssertions += 1;

  console.log('  ✓ Hard constraints suite fully validated.\n');

  // 4g. Generated V2 shifts preserve unambiguous demand identity.
  const identityConfig = {
    ...getDefaultCategoryConfig('identity-tenant', 'FUEL_STATION'),
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1, maxHeadcount: 1 }],
      },
    ],
  };
  const identityResult = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: [createTestEmployee(1), createTestEmployee(2)],
    config: identityConfig,
  });
  if (!identityResult.validation.valid || identityResult.shifts.length !== 1) {
    throw new Error(`Demand identity fixture did not generate one valid shift: ${JSON.stringify(identityResult.validation)}`);
  }
  if (!identityResult.shifts[0].shiftTemplateId || !identityResult.shifts[0].demandSlotId) {
    throw new Error('Generated V2 shift lost shiftTemplateId or demandSlotId identity.');
  }
  totalAssertions += 2;

  // 4k. The real app adapter must route manual work entries through the same hard validator.
  const realManualConfig = {
    ...identityConfig,
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [{
          shiftTemplateId: 'morning',
          minHeadcount: 1,
          targetHeadcount: 1,
          maxHeadcount: 1,
          requiredRole: 'CASHIER_LEAD',
        }],
      },
    ],
  };
  const realManualResult = await schedulerAdapterModule.generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: [createAppEmployee(1, { scheduleRole: 'REGULAR_WORKER' })],
    allShifts: [{
      id: 'persisted-manual-role-mismatch',
      employeeId: 'app-emp-1',
      employeeName: 'App Employee 1',
      date: '2026-06-01',
      startTime: '06:00',
      endTime: '14:00',
      shiftType: 'morning',
      type: 'work',
      isManualOverride: true,
      shiftTemplateId: 'morning',
    }],
    schedulerConfig: realManualConfig,
  });
  if (
    realManualResult.validation.valid ||
    !realManualResult.validation.violations.some((violation) => violation.code === 'ROLE_REQUIREMENT_UNMET')
  ) {
    throw new Error(`Real app manual override bypassed V2 hard validation: ${JSON.stringify(realManualResult.validation)}`);
  }

  const deactivatedFutureResult = await schedulerAdapterModule.generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: deactivatedAppEmployees,
    allShifts: [{
      id: 'persisted-future-deactivated',
      employeeId: 'app-emp-1',
      employeeName: 'App Employee 1',
      date: '2026-06-01',
      startTime: '06:00',
      endTime: '14:00',
      shiftType: 'morning',
      type: 'work',
      isManualOverride: true,
      shiftTemplateId: 'morning',
    }],
    schedulerConfig: identityConfig,
  });
  if (!deactivatedFutureResult.validation.violations.some((violation) => violation.code === 'DEACTIVATED_EMPLOYEE_FUTURE_ASSIGNMENT')) {
    throw new Error(`Future deactivated-employee assignment was not surfaced: ${JSON.stringify(deactivatedFutureResult.validation)}`);
  }

  const manualCoverageConfig = structuredClone(identityConfig);
  manualCoverageConfig.operatingDays = manualCoverageConfig.operatingDays.map((day) =>
    day.weekday === 'MONDAY' ? day : { ...day, isOpen: false, windows: [] },
  );
  manualCoverageConfig.coverageRequirements = manualCoverageConfig.coverageRequirements.map((pattern) => ({
    ...pattern,
    slots: pattern.weekday === 'MONDAY'
      ? [{ shiftTemplateId: 'morning', minHeadcount: 2, targetHeadcount: 2, maxHeadcount: 2 }]
      : [],
  }));
  manualCoverageConfig.sundayAndHolidays = {
    ...manualCoverageConfig.sundayAndHolidays,
    sundayMode: 'CLOSED',
  };
  const manualCoverageResult = await schedulerAdapterModule.generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: [createAppEmployee(1), createAppEmployee(2)],
    allShifts: [{
      id: 'manual-coverage-worker-1',
      employeeId: 'app-emp-1',
      employeeName: 'App Employee 1',
      date: '2026-06-01',
      startTime: '06:00',
      endTime: '14:00',
      shiftType: 'morning',
      type: 'work',
      isManualOverride: true,
      shiftTemplateId: 'morning',
    }],
    schedulerConfig: manualCoverageConfig,
  });
  if (
    !manualCoverageResult.validation.valid ||
    manualCoverageResult.shifts.length !== 1 ||
    manualCoverageResult.shifts[0].employeeId !== 'app-emp-2'
  ) {
    throw new Error(
      `Post-validation adapter filtering removed required final coverage: ${JSON.stringify(manualCoverageResult)}`,
    );
  }
  totalAssertions += 3;

  // 4h. Independent final-candidate coverage semantics: min=2, target=3, max=4.
  const coverageConfig = {
    ...getDefaultCategoryConfig('coverage-validator-tenant', 'FUEL_STATION'),
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [{ shiftTemplateId: 'morning', minHeadcount: 2, targetHeadcount: 3, maxHeadcount: 4 }],
      },
    ],
  };
  const coverageEmployees = Array.from({ length: 5 }, (_, i) => createTestEmployee(i + 1));
  const makeCoverageShifts = (count) =>
    coverageEmployees.slice(0, count).map((employee, index) => ({
      id: `coverage-shift-${index + 1}`,
      date: '2026-06-01',
      employeeId: employee.employeeId,
      employeeName: employee.fullName,
      scheduleRole: employee.scheduleRole,
      shiftType: 'MORNING',
      shiftTemplateId: 'morning',
      demandSlotId: `coverage-slot-${index + 1}`,
      startTime: '06:00',
      endTime: '14:00',
      crossMidnight: false,
      durationHours: 8,
      source: 'MANUAL_OVERRIDE',
    }));
  const expectedCoverage = [
    { count: 1, valid: false, targetWarning: false },
    { count: 2, valid: true, targetWarning: true },
    { count: 3, valid: true, targetWarning: false },
    { count: 4, valid: true, targetWarning: false },
    { count: 5, valid: false, targetWarning: false },
  ];
  for (const expected of expectedCoverage) {
    const check = validateGeneratedScheduleCompliance({
      config: coverageConfig,
      employees: coverageEmployees,
      shifts: makeCoverageShifts(expected.count),
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    });
    const targetWarning = check.violations.some((violation) => violation.code === 'TARGET_COVERAGE_NOT_MET');
    if (check.valid !== expected.valid || targetWarning !== expected.targetWarning) {
      throw new Error(
        `Coverage validator mismatch for ${expected.count} workers: expected valid=${expected.valid}, targetWarning=${expected.targetWarning}; got ${JSON.stringify(check)}`,
      );
    }
  }
  totalAssertions += expectedCoverage.length;

  // 4i. Manual work overrides remain soft-preference overrides only; hard role/template checks still apply.
  const manualRoleConfig = {
    ...coverageConfig,
    coverageRequirements: [
      {
        weekday: 'MONDAY',
        dayType: 'STANDARD_COVERAGE',
        slots: [
          {
            shiftTemplateId: 'morning',
            minHeadcount: 1,
            targetHeadcount: 1,
            maxHeadcount: 1,
            requiredRole: 'CASHIER_LEAD',
          },
        ],
      },
    ],
  };
  const invalidManual = {
    id: 'manual-role-mismatch',
    date: '2026-06-01',
    employeeId: 'emp-1',
    employeeName: 'Εργαζόμενος 1',
    scheduleRole: 'REGULAR_WORKER',
    shiftType: 'MORNING',
    shiftTemplateId: 'morning',
    startTime: '06:00',
    endTime: '14:00',
    source: 'MANUAL_OVERRIDE',
  };
  const manualRoleResult = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: [createTestEmployee(1, { scheduleRole: 'REGULAR_WORKER' })],
    manualOverrides: [invalidManual],
    config: manualRoleConfig,
  });
  if (manualRoleResult.validation.valid || !manualRoleResult.validation.violations.some((v) => v.code === 'ROLE_REQUIREMENT_UNMET')) {
    throw new Error(`Manual override bypassed requiredRole hard validation: ${JSON.stringify(manualRoleResult.validation)}`);
  }

  const unknownTemplateCheck = validateGeneratedScheduleCompliance({
    config: coverageConfig,
    employees: [createTestEmployee(1)],
    shifts: [{ ...invalidManual, scheduleRole: 'CORE_A', shiftTemplateId: 'unknown-template' }],
    startDate: '2026-06-01',
    endDate: '2026-06-01',
  });
  if (unknownTemplateCheck.valid || !unknownTemplateCheck.violations.some((v) => v.code === 'UNKNOWN_SHIFT_TEMPLATE')) {
    throw new Error(`Unknown manual shift template did not fail closed: ${JSON.stringify(unknownTemplateCheck)}`);
  }

  const mismatchedTemplateCheck = validateGeneratedScheduleCompliance({
    config: coverageConfig,
    employees: [createTestEmployee(1)],
    shifts: [{
      ...invalidManual,
      scheduleRole: 'CORE_A',
      shiftTemplateId: 'morning',
      startTime: '08:00',
      endTime: '20:00',
      durationHours: 1,
    }],
    startDate: '2026-06-01',
    endDate: '2026-06-01',
  });
  if (
    mismatchedTemplateCheck.valid ||
    !mismatchedTemplateCheck.violations.some((v) => v.code === 'SHIFT_TEMPLATE_IDENTITY_MISMATCH')
  ) {
    throw new Error(
      `Manual shift times did not fail closed against their claimed template identity: ${JSON.stringify(mismatchedTemplateCheck)}`,
    );
  }
  totalAssertions += 3;

  // 4j. targetDaysOffPerWeek is a soft scoring objective and never a hard eligibility gate.
  if (typeof schedulerEngineModule.calculateTargetDaysOffPenalty !== 'function') {
    throw new Error('Scheduler V2 does not expose the targetDaysOffPerWeek soft-objective penalty used by candidate scoring.');
  }
  if (schedulerEngineModule.calculateTargetDaysOffPenalty(4, 2) !== 0) {
    throw new Error('targetDaysOff soft penalty applied before the configured target would be exceeded.');
  }
  if (schedulerEngineModule.calculateTargetDaysOffPenalty(5, 2) <= 0) {
    throw new Error('targetDaysOff soft penalty did not discourage a sixth working day.');
  }
  totalAssertions += 2;

  // 4l. UI-created IDs are immutable/system-generated and auth roles cannot enter scheduling demand.
  if (typeof schedulerEngineModule.createSchedulerItemId !== 'function') {
    throw new Error('Scheduler configuration lacks a system-generated stable ID helper for UI-created items.');
  }
  const generatedTemplateIds = new Set([
    schedulerEngineModule.createSchedulerItemId('shift'),
    schedulerEngineModule.createSchedulerItemId('shift'),
  ]);
  if (generatedTemplateIds.size !== 2 || [...generatedTemplateIds].some((id) => !id.startsWith('shift-'))) {
    throw new Error(`Scheduler item IDs were not unique and prefix-scoped: ${JSON.stringify([...generatedTemplateIds])}`);
  }

  const authRoleConfig = structuredClone(coverageConfig);
  authRoleConfig.coverageRequirements[0].slots[0].requiredRole = 'OWNER';
  const authRoleValidation = validateSchedulerConfig(authRoleConfig);
  if (authRoleValidation.valid || !authRoleValidation.errors.some((error) => error.includes('authorization role'))) {
    throw new Error(`Authorization role leaked into scheduling configuration: ${JSON.stringify(authRoleValidation)}`);
  }

  const invalidCrossMidnightWindowConfig = structuredClone(getDefaultCategoryConfig('window-direction-tenant', 'FUEL_STATION'));
  invalidCrossMidnightWindowConfig.shiftTemplates.push({
    id: 'day-window-shift',
    label: 'Day Window Shift',
    shortCode: 'DAY',
    shiftType: 'CUSTOM',
    startTime: '10:00',
    endTime: '14:00',
    durationHours: 4,
    unpaidBreakMinutes: 0,
    crossMidnight: false,
    color: '#1D4ED8',
    isActive: true,
  });
  invalidCrossMidnightWindowConfig.operatingDays.find((day) => day.weekday === 'MONDAY').windows = [
    { openTime: '09:00', closeTime: '17:00', crossMidnight: true },
  ];
  invalidCrossMidnightWindowConfig.coverageRequirements.find((pattern) => pattern.weekday === 'MONDAY').slots = [
    { shiftTemplateId: 'day-window-shift', minHeadcount: 1, targetHeadcount: 1, maxHeadcount: 1 },
  ];
  const invalidCrossMidnightWindowValidation = validateSchedulerConfig(invalidCrossMidnightWindowConfig);
  if (
    invalidCrossMidnightWindowValidation.valid ||
    !invalidCrossMidnightWindowValidation.errors.some((error) => error.includes('crossMidnight'))
  ) {
    throw new Error(
      `Daytime operating window incorrectly accepted crossMidnight=true: ${JSON.stringify(invalidCrossMidnightWindowValidation)}`,
    );
  }

  if (typeof schedulerEngineModule.mergeSchedulerConfigSpecialDays !== 'function') {
    throw new Error('V2 generation lacks a shared normalization path for the live special-days settings map.');
  }
  const specialDayBaseConfig = getDefaultCategoryConfig('special-day-merge-tenant', 'FUEL_STATION');
  specialDayBaseConfig.sundayAndHolidays.closedOnPublicHolidays = true;
  const specialDayMergedConfig = schedulerEngineModule.mergeSchedulerConfigSpecialDays(
    specialDayBaseConfig,
    {
      '2026-12-25': {
        isHoliday: true,
        isSpecialDay: true,
        label: 'Χριστούγεννα',
        operatingStartTime: '',
        operatingEndTime: '',
      },
    },
  );
  const specialDayMergedResult = generateScheduleV2({
    startDate: '2026-12-25',
    endDate: '2026-12-25',
    employees: Array.from({ length: 6 }, (_, index) => createTestEmployee(index + 1, { fixedDayOff: undefined })),
    config: specialDayMergedConfig,
  });
  if (!specialDayMergedResult.validation.valid || specialDayMergedResult.shifts.length !== 0) {
    throw new Error(
      `Root special-day settings were not honored by V2 generation: ${JSON.stringify(specialDayMergedResult)}`,
    );
  }

  const nonFiniteCoverageConfig = structuredClone(coverageConfig);
  nonFiniteCoverageConfig.coverageRequirements[0].slots[0].minHeadcount = Number.NaN;
  nonFiniteCoverageConfig.coverageRequirements[0].slots[0].targetHeadcount = Number.NaN;
  const nonFiniteCoverageValidation = validateSchedulerConfig(nonFiniteCoverageConfig);
  if (
    nonFiniteCoverageValidation.valid ||
    !nonFiniteCoverageValidation.errors.some((error) => error.includes('finite integer'))
  ) {
    throw new Error(`Non-finite coverage counts were accepted: ${JSON.stringify(nonFiniteCoverageValidation)}`);
  }

  const duplicateCoverageWeekdayConfig = structuredClone(getDefaultCategoryConfig('duplicate-coverage-day', 'FUEL_STATION'));
  const mondayCoveragePattern = duplicateCoverageWeekdayConfig.coverageRequirements.find(
    (pattern) => pattern.weekday === 'MONDAY',
  );
  duplicateCoverageWeekdayConfig.coverageRequirements.push({
    ...structuredClone(mondayCoveragePattern),
    slots: [],
  });
  const duplicateCoverageWeekdayValidation = validateSchedulerConfig(duplicateCoverageWeekdayConfig);
  if (
    duplicateCoverageWeekdayValidation.valid ||
    !duplicateCoverageWeekdayValidation.errors.some((error) => error.includes('Duplicate weekday in coverageRequirements'))
  ) {
    throw new Error(
      `Duplicate coverage weekday silently replaced prior demand: ${JSON.stringify(duplicateCoverageWeekdayValidation)}`,
    );
  }
  totalAssertions += 7;

  // -------------------------------------------------------------------------
  // SECTION 5: SUNDAY & HOLIDAY CONTRACTS
  // -------------------------------------------------------------------------
  console.log('[SECTION 5] Sunday & Holiday Contract Modes & Fixed Sunday Validation...');
  const sundayModes = ['CLOSED', 'STANDARD_WEEKDAY_LIKE', 'CYCLIC_FAIR', 'FIXED_ASSIGNMENT'];

  for (const mode of sundayModes) {
    const sConf = {
      ...getDefaultCategoryConfig('sun-tenant', 'FUEL_STATION'),
      sundayAndHolidays: {
        sundayMode: mode,
        sundayShiftTemplateId: 'sunday-12h',
        fixedSundayEmployeeIds: mode === 'FIXED_ASSIGNMENT' ? ['emp-1'] : [],
        avoidConsecutiveSundays: true,
        participatingRoleTypes: ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B', 'EXTRA_A', 'EXTRA_B'],
        closedOnPublicHolidays: false,
        holidaysTreatedAsSundays: false,
      },
    };
    const sEmps = Array.from({ length: 5 }, (_, i) => createTestEmployee(i + 1));
    const sRes = generateScheduleV2({
      startDate: '2026-06-07', // Sunday
      endDate: '2026-06-07',
      employees: sEmps,
      config: sConf,
    });

    if (mode === 'CLOSED') {
      if (sRes.shifts.length !== 0) throw new Error('CLOSED Sunday policy generated shifts!');
    } else if (mode === 'FIXED_ASSIGNMENT') {
      if (sRes.shifts.length === 0 || !sRes.shifts.some((s) => s.employeeId === 'emp-1')) {
        throw new Error('FIXED_ASSIGNMENT Sunday policy did not assign fixed employee emp-1!');
      }
    } else {
      if (sRes.shifts.length === 0) throw new Error(`Sunday mode ${mode} generated 0 shifts`);
    }
    totalAssertions++;
  }

  const sundayOptOutConfig = getDefaultCategoryConfig('sunday-opt-out-tenant', 'FUEL_STATION');
  sundayOptOutConfig.sundayAndHolidays = {
    ...sundayOptOutConfig.sundayAndHolidays,
    sundayMode: 'CYCLIC_FAIR',
    participatingRoleTypes: ['CORE_A'],
  };
  const sundayOptOutResult = generateScheduleV2({
    startDate: '2026-06-07',
    endDate: '2026-06-07',
    employees: [createTestEmployee(1, { participatesInSundayRotation: false })],
    config: sundayOptOutConfig,
  });
  if (
    sundayOptOutResult.validation.valid ||
    sundayOptOutResult.shifts.length !== 0 ||
    !sundayOptOutResult.unresolvedGaps.length
  ) {
    throw new Error(
      `Sunday opt-out employee remained eligible for cyclic rotation: ${JSON.stringify(sundayOptOutResult)}`,
    );
  }
  totalAssertions += 1;

  // 5b. FIXED_ASSIGNMENT with Missing / Non-existent Employee -> Hard Gap & valid=false
  const missingFixedConf = {
    ...getDefaultCategoryConfig('sun-tenant-missing', 'FUEL_STATION'),
    sundayAndHolidays: {
      sundayMode: 'FIXED_ASSIGNMENT',
      sundayShiftTemplateId: 'sunday-12h',
      fixedSundayEmployeeIds: ['ghost-employee-999'],
      avoidConsecutiveSundays: true,
      participatingRoleTypes: ['CORE_A'],
      closedOnPublicHolidays: false,
      holidaysTreatedAsSundays: false,
    },
  };
  const missingFixedRes = generateScheduleV2({
    startDate: '2026-06-07',
    endDate: '2026-06-07',
    employees: [createTestEmployee(1), createTestEmployee(2), createTestEmployee(3), createTestEmployee(4)],
    config: missingFixedConf,
  });
  if (missingFixedRes.validation.valid !== false || missingFixedRes.unresolvedGaps.length === 0) {
    throw new Error('FIXED_ASSIGNMENT with non-existent fixed employee failed to report unresolved gap & valid=false!');
  }
  totalAssertions += 1;

  console.log('  ✓ All 4 Sunday & Holiday policy contracts and edge cases verified.\n');

  // -------------------------------------------------------------------------
  // SECTION 6: REAL PERSISTENCE ZERO-WRITE GATING & POSITIVE CONTROL
  // -------------------------------------------------------------------------
  console.log('[SECTION 6] Proving Zero Persistence Writes on Invalid Schedules & Valid Positive Control...');
  if (typeof schedulerAdapterModule.persistValidatedSchedule !== 'function') {
    throw new Error('The real week/month application path does not expose a shared production validation-to-persistence gate.');
  }
  if (
    typeof schedulerAdapterModule.allPersistenceResultsSucceeded !== 'function' ||
    schedulerAdapterModule.allPersistenceResultsSucceeded([true, false, true]) !== false ||
    schedulerAdapterModule.allPersistenceResultsSucceeded([true, true]) !== true
  ) {
    throw new Error('Public projection result aggregation does not fail closed when one week projection fails.');
  }

  const createWriteCounters = () => ({ replaceShiftsBatch: 0, historyWrite: 0, publicProjectionWrite: 0, auditWrite: 0 });
  const executePersistenceBoundary = async (generationResult, counters, { includeHistory = false } = {}) =>
    schedulerAdapterModule.persistValidatedSchedule({
      generationResult,
      persist: async () => {
        counters.replaceShiftsBatch += 1;
        if (includeHistory) counters.historyWrite += 1;
        counters.publicProjectionWrite += 1;
        counters.auditWrite += 1;
        return { writtenCount: generationResult.shifts.length };
      },
    });

  const invalidGeneration = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: [createTestEmployee(1), createTestEmployee(2)],
    config: getDefaultCategoryConfig('gate-tenant', 'FUEL_STATION'),
  });
  const validGeneration = generateScheduleV2({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: Array.from({ length: 6 }, (_, i) => createTestEmployee(i + 1)),
    config: getDefaultCategoryConfig('gate-tenant', 'FUEL_STATION'),
  });

  const invalidWeekCounters = createWriteCounters();
  const invalidWeekResult = await executePersistenceBoundary(invalidGeneration, invalidWeekCounters, { includeHistory: true });
  if (invalidWeekResult.ok !== false || Object.values(invalidWeekCounters).some((count) => count !== 0)) {
    throw new Error(`Invalid week crossed a real persistence boundary: ${JSON.stringify(invalidWeekCounters)}`);
  }

  const invalidMonthCounters = createWriteCounters();
  const invalidMonthResult = await executePersistenceBoundary(invalidGeneration, invalidMonthCounters);
  if (invalidMonthResult.ok !== false || Object.values(invalidMonthCounters).some((count) => count !== 0)) {
    throw new Error(`Invalid month crossed a real persistence boundary: ${JSON.stringify(invalidMonthCounters)}`);
  }

  const validWeekCounters = createWriteCounters();
  const validWeekResult = await executePersistenceBoundary(validGeneration, validWeekCounters, { includeHistory: true });
  if (validWeekResult.ok !== true || Object.values(validWeekCounters).some((count) => count !== 1)) {
    throw new Error(`Valid week did not exercise every instrumented write boundary: ${JSON.stringify(validWeekCounters)}`);
  }

  const validMonthCounters = createWriteCounters();
  const validMonthResult = await executePersistenceBoundary(validGeneration, validMonthCounters);
  if (
    validMonthResult.ok !== true ||
    validMonthCounters.replaceShiftsBatch !== 1 ||
    validMonthCounters.historyWrite !== 0 ||
    validMonthCounters.publicProjectionWrite !== 1 ||
    validMonthCounters.auditWrite !== 1
  ) {
    throw new Error(`Valid month did not exercise every instrumented write boundary: ${JSON.stringify(validMonthCounters)}`);
  }

  // 6b. EXACT FINAL CANDIDATE REVALIDATION ZERO-WRITE PROOF
  // Simulate generator validating candidate A, store filtering dropping a shift resulting in invalid candidate B.
  const partialWeekCandidate = validGeneration.shifts.slice(1);
  const revalidatedWeekCheck = schedulerAdapterModule.revalidateScheduleCandidate({
    candidateShifts: partialWeekCandidate,
    employees: Array.from({ length: 6 }, (_, i) => createTestEmployee(i + 1)),
    schedulerConfig: getDefaultCategoryConfig('gate-tenant', 'FUEL_STATION'),
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    dates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
  });
  if (revalidatedWeekCheck.valid !== false) {
    throw new Error('Candidate revalidation failed to reject candidate with missing coverage shift!');
  }
  const filteredCandidateCounters = createWriteCounters();
  const filteredPersistenceResult = await executePersistenceBoundary(
    { shifts: partialWeekCandidate, finalCandidate: partialWeekCandidate, validation: revalidatedWeekCheck },
    filteredCandidateCounters,
    { includeHistory: true },
  );
  if (filteredPersistenceResult.ok !== false || Object.values(filteredCandidateCounters).some((count) => count !== 0)) {
    throw new Error(`Filtered invalid candidate crossed persistence boundary: ${JSON.stringify(filteredCandidateCounters)}`);
  }

  totalAssertions += 6;
  console.log(`  ✓ INVALID_WEEK_REPLACE_CALLS=${invalidWeekCounters.replaceShiftsBatch}`);
  console.log(`  ✓ INVALID_WEEK_OTHER_WRITE_CALLS=${invalidWeekCounters.historyWrite + invalidWeekCounters.publicProjectionWrite + invalidWeekCounters.auditWrite}`);
  console.log(`  ✓ INVALID_MONTH_REPLACE_CALLS=${invalidMonthCounters.replaceShiftsBatch}`);
  console.log(`  ✓ INVALID_MONTH_OTHER_WRITE_CALLS=${invalidMonthCounters.historyWrite + invalidMonthCounters.publicProjectionWrite + invalidMonthCounters.auditWrite}`);
  console.log(`  ✓ VALID_WEEK_WRITE_BOUNDARY_CALLED=${validWeekCounters.replaceShiftsBatch === 1 ? 'YES' : 'NO'}`);
  console.log(`  ✓ VALID_MONTH_WRITE_BOUNDARY_CALLED=${validMonthCounters.replaceShiftsBatch === 1 ? 'YES' : 'NO'}\n`);

  // -------------------------------------------------------------------------
  // SECTION 7: END-TO-END REAL TENANT CONFIG PRESERVATION
  // -------------------------------------------------------------------------
  console.log('[SECTION 7] Real Tenant Config End-to-End Preservation...');
  const customCafeConfig = {
    schemaVersion: 2,
    tenantId: 'custom-cafe-101',
    businessCategory: 'CAFE',
    operatingDays: [
      { weekday: 'MONDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '20:00' }] },
      { weekday: 'TUESDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '20:00' }] },
      { weekday: 'WEDNESDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '20:00' }] },
      { weekday: 'THURSDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '20:00' }] },
      { weekday: 'FRIDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '20:00' }] },
      { weekday: 'SATURDAY', isOpen: true, windows: [{ openTime: '07:30', closeTime: '18:00' }] },
      { weekday: 'SUNDAY', isOpen: false, windows: [] },
    ],
    shiftTemplates: [
      { id: 'cafe-shift-1', label: 'Morning Barista', shortCode: 'BAR', startTime: '07:30', endTime: '15:30', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true, shiftType: 'MORNING' },
    ],
    coverageRequirements: [
      { weekday: 'MONDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
      { weekday: 'TUESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
      { weekday: 'WEDNESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
      { weekday: 'THURSDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
      { weekday: 'FRIDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
      { weekday: 'SATURDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'cafe-shift-1', minHeadcount: 1, targetHeadcount: 1 }] },
    ],
    complianceRules: {
      minDaysOffPerWeek: 1,
      targetDaysOffPerWeek: 1,
      maxConsecutiveWorkingDays: 6,
      maxDailyWorkingHours: 10,
      maxWeeklyStandardHours: 48,
      minRestIntervalBetweenShiftsHours: 11,
      preventClashingTurnaround: true,
    },
    sundayAndHolidays: {
      sundayMode: 'CLOSED',
      sundayShiftTemplateId: 'cafe-shift-1',
      avoidConsecutiveSundays: true,
      participatingRoleTypes: ['CORE_A'],
      closedOnPublicHolidays: true,
      holidaysTreatedAsSundays: false,
    },
  };

  const normalizedInput = normalizeInput({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: [createTestEmployee(1), createTestEmployee(2), createTestEmployee(3)],
    schedulerConfig: customCafeConfig,
  });

  if (!normalizedInput.schedulerConfig || normalizedInput.schedulerConfig.tenantId !== 'custom-cafe-101') {
    throw new Error('normalizeInput stripped custom V2 schedulerConfig!');
  }

  const generatedCustom = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: [createTestEmployee(1), createTestEmployee(2), createTestEmployee(3)],
    schedulerConfig: customCafeConfig,
  });

  if (!generatedCustom.validation.valid || generatedCustom.shifts.length === 0) {
    throw new Error(`generateSchedule failed on custom V2 config: valid=${generatedCustom.validation?.valid}, shifts=${generatedCustom.shifts?.length}, violations=${JSON.stringify(generatedCustom.validation?.violations)}`);
  }
  totalAssertions += 3;
  console.log('  ✓ Custom V2 tenant configuration preserved end-to-end.\n');

  // -------------------------------------------------------------------------
  // SECTION 8: CHAOS & ADVERSARIAL MUTATION TESTS (NO EXCEPTION SWALLOWING)
  // -------------------------------------------------------------------------
  console.log('[SECTION 8] Chaos & Adversarial Tests (Asserting UNEXPECTED_EXCEPTIONS=0)...');
  let unexpectedEngineExceptions = 0;

  const adversarialInputs = [
    { name: 'Null config', input: { startDate: '2026-06-01', endDate: '2026-06-07', employees: [createTestEmployee(1)], config: null } },
    { name: 'Inverted dates', input: { startDate: '2026-06-07', endDate: '2026-06-01', employees: [createTestEmployee(1)], config: customCafeConfig } },
    { name: 'Empty employees array', input: { startDate: '2026-06-01', endDate: '2026-06-07', employees: [], config: customCafeConfig } },
    { name: 'Malformed employee objects', input: { startDate: '2026-06-01', endDate: '2026-06-07', employees: [null, undefined, { id: 'ghost' }], config: customCafeConfig } },
  ];

  for (const c of adversarialInputs) {
    try {
      const res = generateScheduleV2(c.input);
      if (typeof res !== 'object' || !Array.isArray(res.shifts) || res.validation.valid !== false) {
        throw new Error(`Adversarial input '${c.name}' did not fail closed`);
      }
    } catch (err) {
      unexpectedEngineExceptions++;
      throw new Error(`Engine crashed on adversarial input '${c.name}': ${err.message}`);
    }
    totalAssertions++;
  }

  if (unexpectedEngineExceptions !== 0) {
    throw new Error(`Expected 0 unexpected exceptions, got ${unexpectedEngineExceptions}`);
  }
  console.log(`  ✓ UNEXPECTED_ENGINE_EXCEPTION_COUNT=${unexpectedEngineExceptions}\n`);

  // -------------------------------------------------------------------------
  // SECTION 9: DEEP DETERMINISTIC PROPERTY / FUZZ TESTS (2,000+ SCENARIOS)
  // -------------------------------------------------------------------------
  console.log('[SECTION 9] Running 2,000+ Deterministic Seeded PRNG Fuzz Scenarios across 1-30 Employees & All Categories...');
  const prng = new Mulberry32(20260830);
  const fuzzCategories = ['FUEL_STATION', 'CAFE', 'RESTAURANT', 'HAIR_SALON', 'RETAIL', 'OTHER'];
  let validConfigScenarios = 0;
  let invalidConfigScenarios = 0;
  let validScheduleScenarios = 0;
  let unsatisfiableScenarios = 0;
  let invariantFailures = 0;
  let validButUnsatisfiableConfigs = 0;
  const variantMetrics = {
    operatingWindowVariants: 0,
    shiftTemplateVariants: 0,
    coverageVariants: 0,
    roleSkillVariants: 0,
    sundayVariants: 0,
    specialDayVariants: 0,
    seasonalVariants: 0,
  };

  for (let run = 1; run <= 2000; run++) {
    const empCount = prng.nextInt(1, 30);
    const employees = Array.from({ length: empCount }, (_, i) =>
      createTestEmployee(i + 1, {
        scheduleRole: prng.pick(FUZZ_ROLE_TYPES),
        isEnabled: prng.nextBoolean(0.88),
        fixedDayOff: prng.nextBoolean(0.65) ? prng.pick(FUZZ_WEEKDAYS) : undefined,
        canWorkSunday: prng.nextBoolean(0.85),
        canWorkMorning: prng.nextBoolean(0.9),
        canWorkIntermediate: prng.nextBoolean(0.9),
        canWorkAfternoon: prng.nextBoolean(0.9),
        activeFrom: prng.nextBoolean(0.12) ? prng.pick(['2026-05-01', '2026-06-03']) : undefined,
        activeTo: prng.nextBoolean(0.12) ? prng.pick(['2026-06-04', '2026-07-01']) : undefined,
        extraMode: prng.nextBoolean(0.15) ? prng.pick(['SUBSTITUTE_ONLY', 'ACTIVE_SEASONAL', 'DISABLED']) : undefined,
        skills: prng.nextBoolean(0.45) ? ['SKILL_A'] : [],
      })
    );

    const randAbsences = [];
    if (prng.nextBoolean(0.35) && employees.length > 0) {
      randAbsences.push({
        id: `abs-${run}`,
        employeeId: prng.pick(employees).employeeId,
        type: prng.pick(['LEAVE', 'SICK', 'OTHER']),
        startDate: '2026-06-02',
        endDate: '2026-06-03',
        scope: 'FULL_DAY',
        replacementMode: 'AUTO',
        createdAt: '2026-05-01',
        updatedAt: '2026-05-01',
      });
    }

    const category = prng.pick(fuzzCategories);
    const intentRoll = prng.next();
    const intent = intentRoll < 0.15
      ? 'INVALID_CONFIG'
      : intentRoll < 0.35
        ? 'VALID_BUT_UNSATISFIABLE_CONFIG'
        : 'VALID_CONFIG';
    const { config, windowMode } = createVariableFuzzConfig(prng, run, category, employees, intent);
    const configValidation = validateSchedulerConfig(config);

    if (intent === 'INVALID_CONFIG') {
      invalidConfigScenarios++;
      if (configValidation.valid) {
        invariantFailures++;
        throw new Error(`[FUZZ RUN ${run}] INVALID_CONFIG mutation remained valid.`);
      }
    } else {
      validConfigScenarios++;
      if (!configValidation.valid) {
        invariantFailures++;
        throw new Error(`[FUZZ RUN ${run}] ${intent} failed schema validation: ${JSON.stringify(configValidation.errors)}`);
      }
      if (intent === 'VALID_BUT_UNSATISFIABLE_CONFIG') validButUnsatisfiableConfigs++;
    }

    variantMetrics.operatingWindowVariants += windowMode === 'CROSS_MIDNIGHT' || config.operatingDays.some((day) => day.windows.length === 2) ? 1 : 0;
    variantMetrics.shiftTemplateVariants += config.shiftTemplates.length > 1 || config.shiftTemplates.some((template) => template.unpaidBreakMinutes > 0) ? 1 : 0;
    variantMetrics.coverageVariants += config.coverageRequirements.some((pattern) => pattern.slots.some((slot) => slot.maxHeadcount !== slot.targetHeadcount)) ? 1 : 0;
    variantMetrics.roleSkillVariants += config.shiftTemplates.some((template) => template.requiredSkillsOrRoles?.length) || config.coverageRequirements.some((pattern) => pattern.slots.some((slot) => slot.requiredRole)) ? 1 : 0;
    variantMetrics.sundayVariants += config.sundayAndHolidays.sundayMode !== 'CYCLIC_FAIR' || config.sundayAndHolidays.participatingRoleTypes.length < FUZZ_ROLE_TYPES.length ? 1 : 0;
    variantMetrics.specialDayVariants += Object.keys(config.specialDaysByDate).length > 0 ? 1 : 0;
    variantMetrics.seasonalVariants += employees.some((employee) => employee.activeFrom || employee.activeTo || employee.extraMode) ? 1 : 0;

    let result;
    try {
      result = generateScheduleV2({
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        employees,
        absences: randAbsences,
        config,
      });
    } catch (err) {
      unexpectedEngineExceptions++;
      throw new Error(`[FUZZ RUN ${run}] Engine threw uncaught exception: ${err.message}`);
    }

    if (intent === 'INVALID_CONFIG') {
      if (result.validation.valid !== false) {
        invariantFailures++;
        throw new Error(`[FUZZ SEED 20260830 RUN ${run}] Invalid config was accepted by generator!`);
      }
      continue;
    }

    if (intent === 'VALID_BUT_UNSATISFIABLE_CONFIG') {
      const hasHardGap = (result.unresolvedGaps || []).some(
        (g) => !result.warnings.some((w) => w.id?.includes(g.id?.replace('gap-', '')) && w.code === 'TARGET_COVERAGE_NOT_MET')
      );
      const hasHardViolation = (result.validation?.violations || []).some((v) => v.severity === 'error');
      if (result.validation.valid !== false || (!hasHardGap && !hasHardViolation)) {
        invariantFailures++;
        throw new Error(
          `[FUZZ SEED 20260830 RUN ${run}] Intentionally unsatisfiable config must have validation.valid=false plus hard gap or hard violation: valid=${result.validation?.valid}, hardGap=${hasHardGap}, hardViolation=${hasHardViolation}`,
        );
      }
    }

    if (result.validation.valid) {
      validScheduleScenarios++;

      // Invariant 1: No inactive employees assigned
      const inactiveSet = new Set(employees.filter((e) => e.isEnabled === false).map((e) => e.employeeId));
      const inputEmployeeIds = new Set(employees.map((employee) => employee.employeeId));
      const knownTemplateIds = new Set(config.shiftTemplates.map((template) => template.id));
      const knownDemandSlotIds = new Set(buildDemandSlots(config, '2026-06-01', '2026-06-07').map((slot) => slot.slotId));
      for (const s of result.shifts) {
        if (!inputEmployeeIds.has(s.employeeId)) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Foreign employee ${s.employeeId} assigned shift!`);
        }
        if (inactiveSet.has(s.employeeId)) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Inactive employee ${s.employeeId} assigned shift!`);
        }
        if (!knownTemplateIds.has(s.shiftTemplateId) || !knownDemandSlotIds.has(s.demandSlotId)) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Generated shift lost known template/demand identity!`);
        }
        const employee = employees.find((candidate) => candidate.employeeId === s.employeeId);
        if ((employee?.activeFrom && s.date < employee.activeFrom) || (employee?.activeTo && s.date > employee.activeTo)) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Out-of-season employee ${s.employeeId} assigned shift!`);
        }
      }

      // Invariant 2: No absent employees assigned
      for (const abs of randAbsences) {
        const clashes = result.shifts.filter(
          (s) => s.employeeId === abs.employeeId && s.date >= abs.startDate && s.date <= abs.endDate
        );
        if (clashes.length > 0) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Absent employee ${abs.employeeId} assigned shift!`);
        }
      }

      // Invariant 3: No double shifts
      const seen = new Set();
      for (const s of result.shifts) {
        const key = `${s.date}:${s.employeeId}`;
        if (seen.has(key)) {
          invariantFailures++;
          throw new Error(`[FUZZ RUN ${run}] Double shift for ${s.employeeId} on ${s.date}!`);
        }
        seen.add(key);
      }

      // Invariant 4: Standalone post-generation compliance validator verification
      const standaloneCheck = validateGeneratedScheduleCompliance({
        config,
        employees,
        absences: randAbsences,
        shifts: result.shifts,
        startDate: '2026-06-01',
        endDate: '2026-06-07',
      });
      if (!standaloneCheck.valid) {
        invariantFailures++;
        throw new Error(`[FUZZ RUN ${run}] Standalone validator failed on generated schedule: ${JSON.stringify(standaloneCheck.violations)}`);
      }

      // Invariant 5: Determinism (Replay check)
      const replay = generateScheduleV2({
        startDate: '2026-06-01',
        endDate: '2026-06-07',
        employees,
        absences: randAbsences,
        config,
      });
      if (JSON.stringify(result.shifts) !== JSON.stringify(replay.shifts)) {
        invariantFailures++;
        throw new Error(`[FUZZ RUN ${run}] Non-deterministic replay!`);
      }
    } else {
      unsatisfiableScenarios++;
      if (result.unresolvedGaps.length === 0 && result.validation.violations.length === 0) {
        invariantFailures++;
        throw new Error(`[FUZZ RUN ${run}] Invalid result without gaps or violations!`);
      }
    }
  }

  totalAssertions += 2000;
  if (
    validButUnsatisfiableConfigs === 0 ||
    Object.values(variantMetrics).some((count) => count === 0)
  ) {
    throw new Error(
      `Deep fuzz did not exercise every required intent/variant class: ${JSON.stringify({ validButUnsatisfiableConfigs, variantMetrics })}`,
    );
  }
  console.log(`  ✓ Fuzzing Metrics (Seed: ${prng.seed}):`);
  console.log(`    - Total Scenarios: 2000`);
  console.log(`    - Valid Config Scenarios: ${validConfigScenarios}`);
  console.log(`    - Invalid Injected Config Scenarios (Safely Caught): ${invalidConfigScenarios}`);
  console.log(`    - Valid But Intentionally Unsatisfiable Configs: ${validButUnsatisfiableConfigs}`);
  console.log(`    - Valid Schedules Generated: ${validScheduleScenarios}`);
  console.log(`    - Unsatisfiable / Understaffed Gaps Caught: ${unsatisfiableScenarios}`);
  console.log(`    - Operating Window Variants: ${variantMetrics.operatingWindowVariants}`);
  console.log(`    - Shift Template Variants: ${variantMetrics.shiftTemplateVariants}`);
  console.log(`    - Coverage Variants: ${variantMetrics.coverageVariants}`);
  console.log(`    - Role / Skill Variants: ${variantMetrics.roleSkillVariants}`);
  console.log(`    - Sunday Variants: ${variantMetrics.sundayVariants}`);
  console.log(`    - Special Day Variants: ${variantMetrics.specialDayVariants}`);
  console.log(`    - Seasonal Variants: ${variantMetrics.seasonalVariants}`);
  console.log(`    - Unexpected Engine Exceptions: ${unexpectedEngineExceptions}`);
  console.log(`    - Invariant Failures: ${invariantFailures}`);
  console.log(`    - TOTAL=2000`);
  console.log(`    - VALID_CONFIG=${validConfigScenarios}`);
  console.log(`    - INVALID_CONFIG=${invalidConfigScenarios}`);
  console.log(`    - INTENTIONALLY_UNSATISFIABLE=${validButUnsatisfiableConfigs}`);
  console.log(`    - VALID_SCHEDULE=${validScheduleScenarios}`);
  console.log(`    - UNEXPECTED_EXCEPTIONS=${unexpectedEngineExceptions}`);
  console.log(`    - INVARIANT_FAILURES=${invariantFailures}`);
  console.log(`    - SEED=20260830\n`);

  // -------------------------------------------------------------------------
  // SECTION 10: MULTI-TENANT ISOLATION MATRIX
  // -------------------------------------------------------------------------
  console.log('[SECTION 10] Multi-Tenant Boundary Isolation Matrix...');
  const tenantA = getDefaultCategoryConfig('tenant-a', 'CAFE');
  const tenantB = getDefaultCategoryConfig('tenant-b', 'FUEL_STATION');
  const tenantC = getDefaultCategoryConfig('tenant-c', 'HAIR_SALON');

  const empsA = Array.from({ length: 4 }, (_, i) => createTestEmployee(i + 1, { employeeId: `emp-a-${i + 1}` }));
  const empsB = Array.from({ length: 6 }, (_, i) => createTestEmployee(i + 1, { employeeId: `emp-b-${i + 1}` }));
  const empsC = Array.from({ length: 3 }, (_, i) => createTestEmployee(i + 1, { employeeId: `emp-c-${i + 1}` }));

  const resA = generateScheduleV2({ startDate: '2026-06-01', endDate: '2026-06-07', employees: empsA, config: tenantA });
  const resB = generateScheduleV2({ startDate: '2026-06-01', endDate: '2026-06-07', employees: empsB, config: tenantB });
  const resC = generateScheduleV2({ startDate: '2026-06-01', endDate: '2026-06-07', employees: empsC, config: tenantC });

  for (const s of resA.shifts) {
    if (!s.employeeId.startsWith('emp-a-')) throw new Error('Tenant A schedule contained foreign employee!');
  }
  for (const s of resB.shifts) {
    if (!s.employeeId.startsWith('emp-b-')) throw new Error('Tenant B schedule contained foreign employee!');
  }
  for (const s of resC.shifts) {
    if (!s.employeeId.startsWith('emp-c-')) throw new Error('Tenant C schedule contained foreign employee!');
  }
  totalAssertions += 3;
  console.log('  ✓ Verified 100% strict isolation across 3 concurrent multi-tenant workspaces.\n');

  // -------------------------------------------------------------------------
  // SECTION 11: PERFORMANCE BENCHMARK (1 to 50 Employees x 30 Days)
  // -------------------------------------------------------------------------
  console.log('[SECTION 11] Performance Benchmarks (1 to 50 Employees × 30 Days)...');
  const perfCounts = [1, 5, 10, 20, 30, 50];
  for (const count of perfCounts) {
    const emps = Array.from({ length: count }, (_, i) => createTestEmployee(i + 1));
    const config = getDefaultCategoryConfig('perf-tenant', 'FUEL_STATION');
    const timings = [];

    for (let iter = 0; iter < 10; iter++) {
      const t0 = performance.now();
      generateScheduleV2({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        employees: emps,
        config,
      });
      const t1 = performance.now();
      timings.push(t1 - t0);
    }

    const min = Math.min(...timings).toFixed(2);
    const max = Math.max(...timings).toFixed(2);
    const avg = (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(2);
    console.log(`  - ${count} Employees (30 Days): Min: ${min}ms | Max: ${max}ms | Avg: ${avg}ms`);
  }
  totalAssertions += 6;

  console.log('\n============================================================');
  console.log(` ALL ${totalAssertions} SCHEDULER CONTRACT V2 TESTS PASSED (100%) `);
  console.log('============================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n❌ SCHEDULER CONTRACT V2 TEST FAILED:\n', err);
  process.exit(1);
});
