import { useEffect, useMemo, useState } from 'react';

const DAY_OFF_OPTIONS = [
  { value: '', label: 'Χωρίς σταθερό ρεπό' },
  { value: 1, label: 'Δευτέρα' },
  { value: 2, label: 'Τρίτη' },
  { value: 3, label: 'Τετάρτη' },
  { value: 4, label: 'Πέμπτη' },
  { value: 5, label: 'Παρασκευή' },
  { value: 6, label: 'Σάββατο' },
  { value: 0, label: 'Κυριακή' },
];

const ROLE_OPTIONS = [
  { value: 'general', label: 'General / Custom' },
  { value: 'core', label: 'Core' },
  { value: 'intermediate', label: 'Intermediate' },
];

const SHIFT_PREFERENCE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'morning', label: 'Πρωινός' },
  { value: 'intermediate_0900', label: 'Ενδιάμεσος 09:00-17:00' },
  { value: 'intermediate_1000', label: 'Ενδιάμεσος 10:00-18:00' },
  { value: 'evening', label: 'Απογευματινός' },
];

function buildEmployeeRuleDraft(employee) {
  return {
    employeeId: employee.id,
    scheduleRole: employee.scheduleRole || 'general',
    fixedDayOff:
      typeof employee.fixedDayOff === 'number' && Number.isInteger(employee.fixedDayOff) ? employee.fixedDayOff : '',
    participatesInRotation: employee.participatesInRotation !== false,
    defaultShiftPreference: employee.defaultShiftPreference || 'auto',
  };
}

export default function SchedulingRulesPanel({
  isAdmin,
  isSaving = false,
  employees = [],
  generatorRules = {},
  onSaveRules,
  onSaveEmployeeRules,
}) {
  const [rulesDraft, setRulesDraft] = useState({
    weeklyRotationEnabled: true,
    avoidConsecutiveSundays: true,
    allowManualOverride: true,
    startWithCoreAMorning: true,
  });
  const [employeeDraftMap, setEmployeeDraftMap] = useState({});

  const activeEmployees = useMemo(
    () => (employees || []).filter((employee) => employee?.isActive !== false),
    [employees],
  );

  useEffect(() => {
    setRulesDraft((prev) => ({
      ...prev,
      ...generatorRules,
    }));
  }, [generatorRules]);

  useEffect(() => {
    const next = {};
    activeEmployees.forEach((employee) => {
      next[employee.id] = buildEmployeeRuleDraft(employee);
    });
    setEmployeeDraftMap(next);
  }, [activeEmployees]);

  if (!isAdmin) return null;

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <div className="mb-3">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Κανόνες Προγραμματισμού</h2>
        <p className="text-xs text-slate-700 sm:text-sm dark:text-slate-300">
          Ρυθμίσεις fairness, rotation και βασικών ρόλων ανά εργαζόμενο.
        </p>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(rulesDraft.weeklyRotationEnabled)}
            onChange={(event) =>
              setRulesDraft((prev) => ({ ...prev, weeklyRotationEnabled: event.target.checked }))
            }
            disabled={isSaving}
          />
          Εβδομαδιαία εναλλαγή core εργαζομένων
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(rulesDraft.avoidConsecutiveSundays)}
            onChange={(event) =>
              setRulesDraft((prev) => ({ ...prev, avoidConsecutiveSundays: event.target.checked }))
            }
            disabled={isSaving}
          />
          Αποφυγή συνεχόμενων Κυριακών
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(rulesDraft.allowManualOverride)}
            onChange={(event) => setRulesDraft((prev) => ({ ...prev, allowManualOverride: event.target.checked }))}
            disabled={isSaving}
          />
          Διατήρηση manual overrides στον generator
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(rulesDraft.startWithCoreAMorning)}
            onChange={(event) =>
              setRulesDraft((prev) => ({ ...prev, startWithCoreAMorning: event.target.checked }))
            }
            disabled={isSaving}
          />
          Εκκίνηση μήνα με Core A πρωινό
        </label>
      </div>

      <button
        type="button"
        onClick={() => onSaveRules?.(rulesDraft)}
        disabled={isSaving}
        className="mb-4 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Αποθήκευση κανόνων generator
      </button>

      <div className="space-y-2">
        {activeEmployees.map((employee) => {
          const draft = employeeDraftMap[employee.id] || buildEmployeeRuleDraft(employee);
          return (
            <article key={employee.id} className="glass-soft rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{employee.fullName}</p>
                <button
                  type="button"
                  onClick={() => onSaveEmployeeRules?.(draft)}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-300 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
                >
                  Αποθήκευση
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-[11px] font-medium text-slate-800 dark:text-slate-200">
                  Scheduling role
                  <select
                    value={draft.scheduleRole}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: { ...draft, scheduleRole: event.target.value },
                      }))
                    }
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-medium text-slate-800 dark:text-slate-200">
                  Σταθερό ρεπό
                  <select
                    value={draft.fixedDayOff}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: {
                          ...draft,
                          fixedDayOff: event.target.value === '' ? '' : Number(event.target.value),
                        },
                      }))
                    }
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                  >
                    {DAY_OFF_OPTIONS.map((option) => (
                      <option key={String(option.value)} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-[11px] font-medium text-slate-800 dark:text-slate-200">
                  Default προτίμηση βάρδιας
                  <select
                    value={draft.defaultShiftPreference}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: { ...draft, defaultShiftPreference: event.target.value },
                      }))
                    }
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                  >
                    {SHIFT_PREFERENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inline-flex items-center gap-2 self-end rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-[11px] text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.participatesInRotation)}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: { ...draft, participatesInRotation: event.target.checked },
                      }))
                    }
                  />
                  Συμμετέχει στο weekly rotation
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
