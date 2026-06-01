import { useEffect, useMemo, useState } from 'react';
import StateNotice from '../feedback/StateNotice';

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
  { value: 'core1', label: 'Core 1' },
  { value: 'core2', label: 'Core 2' },
  { value: 'intermediate', label: 'Intermediate / Coverage' },
  { value: 'custom', label: 'General / Custom' },
];

const SHIFT_PREFERENCE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'morning', label: 'Πρωινός' },
  { value: 'intermediate_0900', label: 'Ενδιάμεσος 09:00-17:00' },
  { value: 'intermediate_1000', label: 'Ενδιάμεσος 10:00-18:00' },
  { value: 'evening', label: 'Απογευματινός' },
];

function buildEmployeeRuleDraft(employee) {
  const legacyRole = employee.scheduleRole || employee.roleType || 'custom';
  return {
    employeeId: employee.id,
    scheduleRole: legacyRole === 'general' ? 'custom' : legacyRole,
    fixedDayOff:
      typeof employee.fixedDayOff === 'number' && Number.isInteger(employee.fixedDayOff) ? employee.fixedDayOff : '',
    participatesInRotation: employee.participatesInRotation !== false,
    participatesInSundayRotation: employee.participatesInSundayRotation !== false,
    defaultShiftPreference: employee.defaultShiftPreference || 'auto',
    weeklyFixedShiftSideRotation: employee.weeklyFixedShiftSideRotation === true,
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
  const [isSavingGenerator, setIsSavingGenerator] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState('');

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
    setEmployeeDraftMap((prev) => {
      const next = {};
      activeEmployees.forEach((employee) => {
        next[employee.id] = prev[employee.id] || buildEmployeeRuleDraft(employee);
      });
      return next;
    });
  }, [activeEmployees]);

  const isBusy = isSaving || isSavingGenerator || Boolean(savingEmployeeId);
  const roleCounts = useMemo(() => {
    const counts = { core1: 0, core2: 0 };
    Object.values(employeeDraftMap).forEach((draft) => {
      if (draft?.scheduleRole === 'core1') counts.core1 += 1;
      if (draft?.scheduleRole === 'core2') counts.core2 += 1;
    });
    return counts;
  }, [employeeDraftMap]);

  async function handleSaveGeneratorRules() {
    if (typeof onSaveRules !== 'function' && typeof onSaveEmployeeRules !== 'function') return;
    setIsSavingGenerator(true);
    try {
      if (typeof onSaveEmployeeRules === 'function') {
        for (const employee of activeEmployees) {
          const draft = employeeDraftMap[employee.id] || buildEmployeeRuleDraft(employee);
          await onSaveEmployeeRules(draft);
        }
      }
      if (typeof onSaveRules === 'function') {
        await onSaveRules(rulesDraft);
      }
    } finally {
      setIsSavingGenerator(false);
    }
  }

  async function handleSaveEmployeeRules(employeeId, draft) {
    if (typeof onSaveEmployeeRules !== 'function' || !employeeId) return;
    setSavingEmployeeId(employeeId);
    try {
      await onSaveEmployeeRules(draft);
    } finally {
      setSavingEmployeeId((current) => (current === employeeId ? '' : current));
    }
  }

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
            disabled={isBusy}
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
            disabled={isBusy}
          />
          Αποφυγή συνεχόμενων Κυριακών
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={Boolean(rulesDraft.allowManualOverride)}
            onChange={(event) => setRulesDraft((prev) => ({ ...prev, allowManualOverride: event.target.checked }))}
            disabled={isBusy}
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
            disabled={isBusy}
          />
          Εκκίνηση μήνα με Core A πρωινό
        </label>
      </div>

      <button
        type="button"
        onClick={handleSaveGeneratorRules}
        disabled={isBusy}
        data-testid="save-all-scheduler-rules"
        className="mb-4 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSavingGenerator ? 'Αποθήκευση...' : 'Αποθήκευση κανόνων generator'}
      </button>

      {roleCounts.core1 > 1 || roleCounts.core2 > 1 ? (
        <div className="mb-3 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/15 dark:text-amber-100">
          Κάθε πρόγραμμα πρέπει να έχει μέχρι έναν Core 1 και μέχρι έναν Core 2.
        </div>
      ) : null}

      <div className="space-y-2">
        {!activeEmployees.length ? (
          <StateNotice
            state="empty"
            compact
            title="Δεν υπάρχουν εργαζόμενοι"
            message="Πρόσθεσε εργαζόμενους για να ρυθμίσεις προσωπικούς κανόνες προγραμματισμού."
          />
        ) : null}
        {activeEmployees.map((employee) => {
          const draft = employeeDraftMap[employee.id] || buildEmployeeRuleDraft(employee);
          return (
            <article
              key={employee.id}
              data-testid={`employee-rules-${employee.id}`}
              data-employee-name={employee.fullName || ''}
              className="glass-soft rounded-xl p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{employee.fullName}</p>
                <button
                  type="button"
                  onClick={() => handleSaveEmployeeRules(employee.id, draft)}
                  disabled={isBusy}
                  data-testid={`employee-rules-save-${employee.id}`}
                  className="rounded-lg border border-slate-300 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
                >
                  {savingEmployeeId === employee.id ? 'Αποθήκευση...' : 'Αποθήκευση'}
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <label className="text-[11px] font-medium text-slate-800 dark:text-slate-200">
                  Scheduling role
                  <select
                    value={draft.scheduleRole}
                    data-testid={`employee-role-${employee.id}`}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: { ...draft, scheduleRole: event.target.value },
                      }))
                    }
                    disabled={isBusy}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                  >
                    {draft.scheduleRole === 'core' ? (
                      <option value="core">Legacy Core</option>
                    ) : null}
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
                    data-testid={`employee-fixed-day-${employee.id}`}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: {
                          ...draft,
                          fixedDayOff: event.target.value === '' ? '' : Number(event.target.value),
                        },
                      }))
                    }
                    disabled={isBusy}
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
                    disabled={isBusy}
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
                    disabled={isBusy}
                  />
                  Συμμετέχει στο weekly rotation
                </label>

                <label className="inline-flex items-center gap-2 self-end rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-[11px] text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.participatesInSundayRotation)}
                    onChange={(event) =>
                      setEmployeeDraftMap((prev) => ({
                        ...prev,
                        [employee.id]: { ...draft, participatesInSundayRotation: event.target.checked },
                      }))
                    }
                    disabled={isBusy}
                  />
                  Sunday rotation
                </label>

                <label className="rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-[11px] text-slate-800 md:col-span-2 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.weeklyFixedShiftSideRotation)}
                      onChange={(event) =>
                        setEmployeeDraftMap((prev) => ({
                          ...prev,
                          [employee.id]: { ...draft, weeklyFixedShiftSideRotation: event.target.checked },
                        }))
                      }
                      disabled={isBusy}
                    />
                    Σταθερή βάρδια ανά εβδομάδα (εναλλάξ πρωί/απόγευμα)
                  </span>
                  <span className="mt-1 block text-[10px] text-slate-600 dark:text-slate-300/90">
                    Μία εβδομάδα μόνο πρωί και την επόμενη μόνο απόγευμα.
                  </span>
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
