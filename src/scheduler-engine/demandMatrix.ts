import { eachDateInclusive, getWeekday, isShiftContainedInWindow } from './dateUtils.ts';
import type { SchedulerConfigV2, ShiftTemplateConfigV2, TimeWindow } from './configV2.ts';
import type { GeneratedShift, Weekday } from './types.ts';

export interface DemandSlot {
  slotId: string;
  date: string;
  weekday: Weekday;
  template: ShiftTemplateConfigV2;
  priority: number;
  isHardMinimum: boolean;
  requiredRole?: string;
  optionalCandidateRoles?: string[];
  requiredSkillsOrRoles?: string[];
  participatingRoles?: string[];
  isLockedManualOverride?: boolean;
  assignedEmployeeId?: string;
  fixedEmployeeId?: string;
  sundayMode?: string;
}

export function buildDemandSlots(
  config: SchedulerConfigV2,
  startDate: string,
  endDate: string,
  manualOverrides: GeneratedShift[] = []
): DemandSlot[] {
  const slots: DemandSlot[] = [];
  const templateMap = new Map<string, ShiftTemplateConfigV2>(
    (config.shiftTemplates || []).map((t) => [t.id, t])
  );
  const operatingDayMap = new Map((config.operatingDays || []).map((d) => [d.weekday, d]));
  const coverageMap = new Map((config.coverageRequirements || []).map((c) => [c.weekday, c]));

  let slotCounter = 0;

  for (const date of eachDateInclusive(startDate, endDate)) {
    const weekday = getWeekday(date);
    const opDay = operatingDayMap.get(weekday);
    const specialDay = config.specialDaysByDate?.[date];

    // Check holiday full closure
    if (specialDay && specialDay.isHoliday && config.sundayAndHolidays?.closedOnPublicHolidays) {
      continue; // Closed on holiday
    }

    // Determine applicable operating windows
    let applicableWindows: TimeWindow[] = [];
    if (specialDay && specialDay.isSpecialOperatingHours && Array.isArray(specialDay.operatingWindows) && specialDay.operatingWindows.length > 0) {
      applicableWindows = specialDay.operatingWindows;
    } else if (opDay && opDay.isOpen && Array.isArray(opDay.windows)) {
      applicableWindows = opDay.windows;
    }

    if (applicableWindows.length === 0) {
      continue; // Store closed
    }

    const fitsAnyWindow = (tpl: ShiftTemplateConfigV2): boolean => {
      return applicableWindows.some((w) =>
        isShiftContainedInWindow(
          tpl.startTime,
          tpl.endTime,
          w.openTime,
          w.closeTime,
          Boolean(tpl.crossMidnight),
          Boolean(w.crossMidnight),
        )
      );
    };

    // Check if Sunday / Holiday treated as Sunday
    const isTreatedAsSunday =
      weekday === 'SUNDAY' ||
      (specialDay && specialDay.isHoliday && config.sundayAndHolidays?.holidaysTreatedAsSundays);

    if (isTreatedAsSunday) {
      const sundayMode = config.sundayAndHolidays?.sundayMode || (config.sundayAndHolidays as any)?.sundayPolicy || 'CYCLIC_FAIR';
      if (sundayMode === 'CLOSED') {
        continue;
      }

      if (sundayMode === 'STANDARD_WEEKDAY_LIKE') {
        const sundayCoverage = coverageMap.get('SUNDAY');
        if (sundayCoverage && Array.isArray(sundayCoverage.slots)) {
          for (const slotReq of sundayCoverage.slots) {
            const tpl = templateMap.get(slotReq.shiftTemplateId);
            const minCount = Math.max(0, slotReq.minHeadcount ?? 1);
            const targetCount = Math.max(minCount, slotReq.targetHeadcount ?? minCount);

            if (!tpl || tpl.isActive === false || !fitsAnyWindow(tpl)) {
              // If template is missing or out-of-window, ensure hard minimum slots still generate gaps
              for (let i = 0; i < minCount; i++) {
                slotCounter++;
                slots.push({
                  slotId: `slot-${date}-${slotReq.shiftTemplateId}-${i + 1}-${slotCounter}`,
                  date,
                  weekday,
                  template: tpl || {
                    id: slotReq.shiftTemplateId,
                    label: `Ανενεργό Πρότυπο (${slotReq.shiftTemplateId})`,
                    shortCode: 'GAP',
                    shiftType: 'CUSTOM',
                    startTime: '08:00',
                    endTime: '16:00',
                    durationHours: 8.0,
                    unpaidBreakMinutes: 0,
                    crossMidnight: false,
                    color: '#EF4444',
                    isActive: false,
                  },
                  priority: 1,
                  isHardMinimum: true,
                  requiredRole: slotReq.requiredRole,
                  optionalCandidateRoles: slotReq.optionalCandidateRoles,
                });
              }
              continue;
            }

            for (let i = 0; i < targetCount; i++) {
              slotCounter++;
              slots.push({
                slotId: `slot-${date}-${tpl.id}-${i + 1}-${slotCounter}`,
                date,
                weekday,
                template: tpl,
                priority: slotReq.requiredRole ? 1 : 2,
                isHardMinimum: i < minCount,
                requiredRole: slotReq.requiredRole,
                optionalCandidateRoles: slotReq.optionalCandidateRoles,
                requiredSkillsOrRoles: tpl.requiredSkillsOrRoles,
              });
            }
          }
        }
        // Under STANDARD_WEEKDAY_LIKE, Sunday is governed strictly by configured coverage slots.
        // If slots are empty or omitted, zero shifts are demanded. Never fall through to 12h Sunday template.
        continue;
      }

      // Default / CYCLIC_FAIR / FIXED_ASSIGNMENT Sunday handling
      const sundayTemplateId = config.sundayAndHolidays?.sundayShiftTemplateId;
      const sundayTemplate =
        (sundayTemplateId ? templateMap.get(sundayTemplateId) : undefined) ||
        config.shiftTemplates?.find((t) => t.shiftType === 'SPECIAL' || t.id.includes('sunday')) ||
        config.shiftTemplates?.[0];

      const fixedEmpId =
        sundayMode === 'FIXED_ASSIGNMENT' && Array.isArray(config.sundayAndHolidays?.fixedSundayEmployeeIds) && config.sundayAndHolidays.fixedSundayEmployeeIds.length === 1
          ? config.sundayAndHolidays.fixedSundayEmployeeIds[0]
          : undefined;

      if (sundayTemplate && sundayTemplate.isActive !== false && fitsAnyWindow(sundayTemplate)) {
        slotCounter++;
        slots.push({
          slotId: `slot-${date}-${sundayTemplate.id}-${slotCounter}`,
          date,
          weekday,
          template: sundayTemplate,
          priority: 1,
          isHardMinimum: true,
          fixedEmployeeId: fixedEmpId,
          sundayMode,
          requiredSkillsOrRoles: sundayTemplate.requiredSkillsOrRoles,
          participatingRoles: config.sundayAndHolidays?.participatingRoleTypes,
        });
      } else {
        // Fallback placeholder to generate hard gap rather than dropping slot silently
        slotCounter++;
        slots.push({
          slotId: `slot-${date}-sunday-gap-${slotCounter}`,
          date,
          weekday,
          template: sundayTemplate || {
            id: 'sunday-gap',
            label: 'Κυριακάτικη Βάρδια',
            shortCode: 'ΚΥΡ',
            shiftType: 'SPECIAL',
            startTime: '08:00',
            endTime: '20:00',
            durationHours: 12.0,
            unpaidBreakMinutes: 0,
            crossMidnight: false,
            color: '#BE185D',
            isActive: false,
          },
          priority: 1,
          isHardMinimum: true,
          fixedEmployeeId: fixedEmpId,
          sundayMode,
        });
      }
      continue;
    }

    // Standard Weekday Coverage
    const coverage = coverageMap.get(weekday);
    if (coverage && Array.isArray(coverage.slots) && coverage.slots.length > 0) {
      for (const slotReq of coverage.slots) {
        const tpl = templateMap.get(slotReq.shiftTemplateId);
        const minCount = Math.max(0, slotReq.minHeadcount ?? 1);
        const targetCount = Math.max(minCount, slotReq.targetHeadcount ?? minCount);

        if (!tpl || tpl.isActive === false || !fitsAnyWindow(tpl)) {
          // If template is missing or out-of-window, ensure hard minimum slots still generate gaps
          for (let i = 0; i < minCount; i++) {
            slotCounter++;
            slots.push({
              slotId: `slot-${date}-${slotReq.shiftTemplateId}-${i + 1}-${slotCounter}`,
              date,
              weekday,
              template: tpl || {
                id: slotReq.shiftTemplateId,
                label: `Ανενεργό Πρότυπο (${slotReq.shiftTemplateId})`,
                shortCode: 'GAP',
                shiftType: 'CUSTOM',
                startTime: '08:00',
                endTime: '16:00',
                durationHours: 8.0,
                unpaidBreakMinutes: 0,
                crossMidnight: false,
                color: '#EF4444',
                isActive: false,
              },
              priority: 1,
              isHardMinimum: true,
              requiredRole: slotReq.requiredRole,
              optionalCandidateRoles: slotReq.optionalCandidateRoles,
            });
          }
          continue;
        }

        for (let i = 0; i < targetCount; i++) {
          slotCounter++;
          slots.push({
            slotId: `slot-${date}-${tpl.id}-${i + 1}-${slotCounter}`,
            date,
            weekday,
            template: tpl,
            priority: slotReq.requiredRole ? 1 : 2,
            isHardMinimum: i < minCount,
            requiredRole: slotReq.requiredRole,
            optionalCandidateRoles: slotReq.optionalCandidateRoles,
            requiredSkillsOrRoles: tpl.requiredSkillsOrRoles,
          });
        }
      }
    }
    // Explicit canonical contract: if coverage pattern is omitted or has zero slots,
    // this day represents an explicit zero-demand day (zero automatic shifts).
  }

  // Bind Manual Overrides to matching slots
  for (const manual of manualOverrides) {
    const matchingSlot = slots.find(
      (s) =>
        s.date === manual.date &&
        !s.isLockedManualOverride &&
        (s.template.startTime === manual.startTime || s.template.shiftType === manual.shiftType)
    );
    if (matchingSlot) {
      matchingSlot.isLockedManualOverride = true;
      matchingSlot.assignedEmployeeId = manual.employeeId;
    }
  }

  return slots;
}

