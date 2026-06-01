import { EXTRA_ROLES, getShiftDefinition } from './constants';
import { isEmployeeAvailable } from './availability';
import type {
  EmployeeAbsence,
  EmployeeScheduleConfig,
  GeneratedShift,
  ScheduleGap,
  ScheduleWarning,
} from './types';

function createWarning(code: string, message: string, gap: ScheduleGap): ScheduleWarning {
  return {
    id: `${code}-${gap.id}`,
    severity: code === 'UNRESOLVED_GAP' ? 'error' : 'warning',
    code,
    message,
    date: gap.date,
    employeeId: gap.originalEmployeeId,
  };
}

function hasShiftOnDate(shifts: GeneratedShift[], date: string, employeeId: string): boolean {
  return shifts.some((shift) => shift.date === date && shift.employeeId === employeeId);
}

function wouldCreateCoreConflict(shifts: GeneratedShift[], gap: ScheduleGap, candidate: EmployeeScheduleConfig): boolean {
  if (candidate.scheduleRole !== 'CORE_A' && candidate.scheduleRole !== 'CORE_B') return false;
  return shifts.some(
    (shift) =>
      shift.date === gap.date &&
      shift.shiftType === gap.shiftType &&
      ((candidate.scheduleRole === 'CORE_A' && shift.scheduleRole === 'CORE_B') ||
        (candidate.scheduleRole === 'CORE_B' && shift.scheduleRole === 'CORE_A')),
  );
}

function canFillGap(params: {
  candidate: EmployeeScheduleConfig;
  gap: ScheduleGap;
  shifts: GeneratedShift[];
  absences: EmployeeAbsence[];
}): boolean {
  const { candidate, gap, shifts, absences } = params;
  if (candidate.employeeId === gap.originalEmployeeId) return false;
  if (hasShiftOnDate(shifts, gap.date, candidate.employeeId)) return false;
  if (candidate.scheduleRole.startsWith('EXTRA')) {
    if (candidate.extraMode === 'DISABLED') return false;
    if (candidate.extraMode === 'SUBSTITUTE_ONLY' && candidate.canCoverLeaves === false) return false;
  }
  if (!isEmployeeAvailable({ employeeId: candidate.employeeId, date: gap.date, shiftType: gap.shiftType, absences, employeeConfig: candidate })) {
    return false;
  }
  if (wouldCreateCoreConflict(shifts, gap, candidate)) return false;
  return true;
}

function candidatePriority(employee: EmployeeScheduleConfig): number {
  if (EXTRA_ROLES.includes(employee.scheduleRole)) return 0;
  if (employee.scheduleRole === 'FLEX_A' || employee.scheduleRole === 'FLEX_B') return 1;
  return 2;
}

function buildReplacementShift(gap: ScheduleGap, employee: EmployeeScheduleConfig): GeneratedShift {
  const definition = getShiftDefinition(gap.shiftType, employee);
  return {
    id: `replacement-${gap.date}-${gap.shiftType}-${employee.employeeId}`,
    date: gap.date,
    employeeId: employee.employeeId,
    employeeName: employee.fullName,
    scheduleRole: employee.scheduleRole,
    shiftType: gap.shiftType,
    startTime: definition.startTime,
    endTime: definition.endTime,
    source: 'ABSENCE_REPLACEMENT',
    replacedEmployeeId: gap.originalEmployeeId,
    absenceId: gap.absenceId,
  };
}

export function fillScheduleGaps(params: {
  shifts: GeneratedShift[];
  gaps: ScheduleGap[];
  employees: EmployeeScheduleConfig[];
  absences: EmployeeAbsence[];
}): { shifts: GeneratedShift[]; unresolvedGaps: ScheduleGap[]; warnings: ScheduleWarning[] } {
  const shifts = [...params.shifts];
  const unresolvedGaps: ScheduleGap[] = [];
  const warnings: ScheduleWarning[] = [];
  const absencesById = new Map(params.absences.map((absence) => [absence.id, absence]));

  for (const gap of params.gaps) {
    const absence = gap.absenceId ? absencesById.get(gap.absenceId) : undefined;
    if (absence?.replacementMode === 'NO_REPLACEMENT') {
      unresolvedGaps.push({ ...gap, reason: 'MANUAL_NO_REPLACEMENT' });
      warnings.push(createWarning('UNRESOLVED_GAP', `Η βάρδια ${gap.shiftType} στις ${gap.date} έμεινε χωρίς αντικατάσταση.`, gap));
      continue;
    }

    const manualCandidate = absence?.replacementMode === 'MANUAL' && absence.manualReplacementEmployeeId
      ? params.employees.find((employee) => employee.employeeId === absence.manualReplacementEmployeeId)
      : undefined;
    const candidates = manualCandidate
      ? [manualCandidate]
      : [...params.employees].sort(
          (a, b) => candidatePriority(a) - candidatePriority(b) || a.scheduleRole.localeCompare(b.scheduleRole) || a.employeeId.localeCompare(b.employeeId),
        );
    const replacement = candidates.find((candidate) => canFillGap({ candidate, gap, shifts, absences: params.absences }));

    if (!replacement) {
      unresolvedGaps.push(gap);
      warnings.push(createWarning('UNRESOLVED_GAP', `Δεν βρέθηκε διαθέσιμος αντικαταστάτης για ${gap.shiftType} στις ${gap.date}.`, gap));
      continue;
    }

    shifts.push(buildReplacementShift(gap, replacement));
  }

  return { shifts, unresolvedGaps, warnings };
}
