import { REQUIRED_BASE_ROLES } from './constants.ts';
import type { EmployeeScheduleConfig, ResolvedScheduleRoles, ScheduleWarning } from './types.ts';

function warning(id: string, code: string, message: string): ScheduleWarning {
  return { id, severity: 'error', code, message };
}

export function resolveScheduleRoles(employees: EmployeeScheduleConfig[]): ResolvedScheduleRoles {
  const enabledEmployees = employees.filter(
    (employee) => employee.isEnabled !== false && employee.participatesInWeeklyRotation !== false,
  );
  const warnings: ScheduleWarning[] = [];
  const roles: Record<string, EmployeeScheduleConfig> = {};
  const baseEmployees: EmployeeScheduleConfig[] = [];
  const extras: EmployeeScheduleConfig[] = [];

  for (const role of REQUIRED_BASE_ROLES) {
    const matches = enabledEmployees.filter((employee) => employee.scheduleRole === role);
    if (matches.length === 1) {
      roles[role] = matches[0];
      baseEmployees.push(matches[0]);
    } else if (matches.length === 0) {
      warnings.push(
        warning(
          `role-${role}`,
          'MISSING_REQUIRED_ROLE',
          `Ο ρόλος ${role} πρέπει να έχει ακριβώς έναν ενεργό εργαζόμενο.`,
        ),
      );
    } else {
      roles[role] = matches[0];
      baseEmployees.push(matches[0]);
      warnings.push(
        warning(
          `role-${role}`,
          'DUPLICATE_REQUIRED_ROLE',
          `Ο ρόλος ${role} έχει πάνω από έναν εργαζόμενο.`,
        ),
      );
    }
  }

  for (const employee of enabledEmployees) {
    if (!baseEmployees.some((b) => b.employeeId === employee.employeeId)) {
      extras.push(employee);
      roles[employee.scheduleRole || `EXTRA_${employee.employeeId}`] = employee;
    }
  }

  const otherActive = employees.filter(
    (employee) => employee.isEnabled !== false && employee.participatesInWeeklyRotation === false,
  );
  for (const employee of otherActive) {
    if (
      !extras.some((e) => e.employeeId === employee.employeeId) &&
      !baseEmployees.some((b) => b.employeeId === employee.employeeId)
    ) {
      extras.push(employee);
      const roleKey = REQUIRED_BASE_ROLES.includes(employee.scheduleRole)
        ? `EXTRA_${employee.employeeId}`
        : employee.scheduleRole || `EXTRA_${employee.employeeId}`;
      roles[roleKey] = employee;
    }
  }

  return {
    roles,
    extras,
    baseEmployees,
    warnings,
  };
}
