import { EXTRA_ROLES, REQUIRED_BASE_ROLES } from './constants.ts';
import type { EmployeeScheduleConfig, ResolvedScheduleRoles, ScheduleRole, ScheduleWarning } from './types.ts';

function warning(id: string, code: string, message: string): ScheduleWarning {
  return { id, severity: 'error', code, message };
}

export function resolveScheduleRoles(employees: EmployeeScheduleConfig[]): ResolvedScheduleRoles {
  const enabledEmployees = employees.filter(
    (employee) => employee.isEnabled !== false && employee.participatesInWeeklyRotation !== false,
  );
  const warnings: ScheduleWarning[] = [];
  const roles: Partial<Record<ScheduleRole, EmployeeScheduleConfig>> = {};

  for (const role of [...REQUIRED_BASE_ROLES, ...EXTRA_ROLES]) {
    const matches = enabledEmployees.filter((employee) => employee.scheduleRole === role);
    if (matches.length === 1) {
      roles[role] = matches[0];
    }
    if (REQUIRED_BASE_ROLES.includes(role) && matches.length !== 1) {
      warnings.push(
        warning(
          `role-${role}`,
          matches.length === 0 ? 'MISSING_REQUIRED_ROLE' : 'DUPLICATE_REQUIRED_ROLE',
          `Ο ρόλος ${role} πρέπει να έχει ακριβώς έναν ενεργό εργαζόμενο.`,
        ),
      );
    }
    if (EXTRA_ROLES.includes(role) && matches.length > 1) {
      warnings.push(warning(`role-${role}`, 'DUPLICATE_EXTRA_ROLE', `Ο προαιρετικός ρόλος ${role} έχει πάνω από έναν εργαζόμενο.`));
    }
  }

  return {
    roles,
    extras: EXTRA_ROLES.map((role) => roles[role]).filter(Boolean) as EmployeeScheduleConfig[],
    baseEmployees: REQUIRED_BASE_ROLES.map((role) => roles[role]).filter(Boolean) as EmployeeScheduleConfig[],
    warnings,
  };
}
