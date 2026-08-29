import { eachDateInclusive, getWeekday } from './dateUtils.ts';
import type { SchedulerConfigV2, ShiftTemplateConfigV2 } from './configV2.ts';
import type { GeneratedShift, Weekday } from './types.ts';

export interface DemandSlot {
  slotId: string;
  date: string;
  weekday: Weekday;
  template: ShiftTemplateConfigV2;
  priority: number;
  requiredRole?: string;
  optionalCandidateRoles?: string[];
  isLockedManualOverride?: boolean;
  assignedEmployeeId?: string;
}

export function buildDemandSlots(
  config: SchedulerConfigV2,
  startDate: string,
  endDate: string,
  manualOverrides: GeneratedShift[] = []
): DemandSlot[] {
  const slots: DemandSlot[] = [];
  const templateMap = new Map<string, ShiftTemplateConfigV2>(
    config.shiftTemplates.map((t) => [t.id, t])
  );
  const operatingDayMap = new Map(config.operatingDays.map((d) => [d.weekday, d]));
  const coverageMap = new Map(config.coverageRequirements.map((c) => [c.weekday, c]));

  let slotCounter = 0;

  for (const date of eachDateInclusive(startDate, endDate)) {
    const weekday = getWeekday(date);
    const opDay = operatingDayMap.get(weekday);
    if (!opDay || !opDay.isOpen) {
      continue; // Store closed
    }

    const specialDay = config.specialDaysByDate[date];
    if (specialDay && specialDay.isHoliday && config.sundayAndHolidays.closedOnPublicHolidays) {
      continue; // Closed on holiday
    }

    // Check if Sunday / Holiday treated as Sunday
    if (weekday === 'SUNDAY' || (specialDay && specialDay.isHoliday && config.sundayAndHolidays.holidaysTreatedAsSundays)) {
      if (config.sundayAndHolidays.sundayMode === 'CLOSED') {
        continue;
      }
      const sundayTemplate = templateMap.get(config.sundayAndHolidays.sundayShiftTemplateId) || config.shiftTemplates[0];
      if (sundayTemplate) {
        slotCounter++;
        slots.push({
          slotId: `slot-${date}-${sundayTemplate.id}-${slotCounter}`,
          date,
          weekday,
          template: sundayTemplate,
          priority: 1,
        });
      }
      continue;
    }

    // Standard Weekday Coverage
    const coverage = coverageMap.get(weekday);
    if (coverage && coverage.slots.length > 0) {
      for (const slotReq of coverage.slots) {
        const tpl = templateMap.get(slotReq.shiftTemplateId);
        if (!tpl || !tpl.isActive) continue;

        const count = Math.max(1, slotReq.minHeadcount || slotReq.targetHeadcount || 1);
        for (let i = 0; i < count; i++) {
          slotCounter++;
          slots.push({
            slotId: `slot-${date}-${tpl.id}-${i + 1}-${slotCounter}`,
            date,
            weekday,
            template: tpl,
            priority: slotReq.requiredRole ? 1 : 2,
            requiredRole: slotReq.requiredRole,
            optionalCandidateRoles: slotReq.optionalCandidateRoles,
          });
        }
      }
    } else {
      // Fallback: 1 of each active shift template
      for (const tpl of config.shiftTemplates.filter((t) => t.isActive && t.shiftType !== 'SPECIAL')) {
        slotCounter++;
        slots.push({
          slotId: `slot-${date}-${tpl.id}-${slotCounter}`,
          date,
          weekday,
          template: tpl,
          priority: 2,
        });
      }
    }
  }

  // Bind Manual Overrides to matching slots or add manual slots
  for (const manual of manualOverrides) {
    const matchingSlot = slots.find(
      (s) => s.date === manual.date && !s.isLockedManualOverride && (s.template.startTime === manual.startTime || s.template.shiftType === manual.shiftType)
    );
    if (matchingSlot) {
      matchingSlot.isLockedManualOverride = true;
      matchingSlot.assignedEmployeeId = manual.employeeId;
    }
  }

  return slots;
}
