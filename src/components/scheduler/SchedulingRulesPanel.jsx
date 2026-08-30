import { useEffect, useMemo, useState } from 'react';
import StateNotice from '../feedback/StateNotice';
import {
  deriveShiftDurationHours,
  getDefaultCategoryConfig,
  normalizeSchedulerConfig,
  validateSchedulerConfig,
} from '../../scheduler-engine/configV2.ts';
import useSchedulerStore from '../../hooks/useSchedulerStore';

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
  { value: 'core1', label: 'Core 1 (Βασικός 1)' },
  { value: 'core2', label: 'Core 2 (Βασικός 2)' },
  { value: 'intermediate', label: 'Intermediate / Coverage (Ενδιάμεσος / Κάλυψη)' },
  { value: 'custom', label: 'Extra / Substitute (Αναπληρωτής / Κάλυψη Αδειών)' },
];

const SHIFT_PREFERENCE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'morning', label: 'Πρωινός' },
  { value: 'intermediate_0900', label: 'Ενδιάμεσος 09:00-17:00' },
  { value: 'intermediate_1000', label: 'Ενδιάμεσος 10:00-18:00' },
  { value: 'evening', label: 'Απογευματινός' },
];

const WEEKDAY_NAMES_GR = {
  MONDAY: 'Δευτέρα',
  TUESDAY: 'Τρίτη',
  WEDNESDAY: 'Τετάρτη',
  THURSDAY: 'Πέμπτη',
  FRIDAY: 'Παρασκευή',
  SATURDAY: 'Σάββατο',
  SUNDAY: 'Κυριακή',
};

const SUNDAY_MODE_OPTIONS = [
  { value: 'CYCLIC_FAIR', label: 'Κυκλική Δίκαιη Εναλλαγή (Fair Cyclic)' },
  { value: 'FIXED_ASSIGNMENT', label: 'Σταθερή Ανάθεση (Fixed Assignment)' },
  { value: 'STANDARD_WEEKDAY_LIKE', label: 'Κανονική Βάρδια όπως Καθημερινές' },
  { value: 'CLOSED', label: 'Κλειστά την Κυριακή' },
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
  const storeV2Config = useSchedulerStore((state) => state.schedulerConfigV2);
  const saveV2ConfigAction = useSchedulerStore((state) => state.saveSchedulerConfigV2);

  const [activeTab, setActiveTab] = useState('v2_operating');
  const [rulesDraft, setRulesDraft] = useState({
    weeklyRotationEnabled: true,
    avoidConsecutiveSundays: true,
    allowManualOverride: true,
    startWithCoreAMorning: true,
  });

  const [v2Draft, setV2Draft] = useState(() => {
    return storeV2Config || getDefaultCategoryConfig('default', 'FUEL_STATION');
  });

  const [employeeDraftMap, setEmployeeDraftMap] = useState({});
  const [isSavingGenerator, setIsSavingGenerator] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState('');

  const activeEmployees = useMemo(
    () => (employees || []).filter((employee) => employee?.isActive !== false),
    [employees],
  );

  useEffect(() => {
    if (storeV2Config) {
      setV2Draft(storeV2Config);
    } else {
      setV2Draft(normalizeSchedulerConfig(generatorRules, employees, 'FUEL_STATION', 'default'));
    }
  }, [storeV2Config, generatorRules, employees]);

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

  // Live V2 Validation
  const v2Validation = useMemo(() => {
    return validateSchedulerConfig(v2Draft);
  }, [v2Draft]);

  const roleCounts = useMemo(() => {
    const counts = { core1: 0, core2: 0 };
    Object.values(employeeDraftMap).forEach((draft) => {
      if (draft?.scheduleRole === 'core1') counts.core1 += 1;
      if (draft?.scheduleRole === 'core2') counts.core2 += 1;
    });
    return counts;
  }, [employeeDraftMap]);

  async function handleSaveV2Config() {
    if (!v2Validation.valid) return;
    setIsSavingGenerator(true);
    try {
      if (typeof saveV2ConfigAction === 'function') {
        await saveV2ConfigAction(v2Draft);
      }
      if (typeof onSaveRules === 'function') {
        await onSaveRules({
          ...rulesDraft,
          avoidConsecutiveSundays: v2Draft.sundayAndHolidays?.avoidConsecutiveSundays,
        });
      }
    } finally {
      setIsSavingGenerator(false);
    }
  }

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
      if (typeof saveV2ConfigAction === 'function' && v2Validation.valid) {
        await saveV2ConfigAction(v2Draft);
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">
            Ρυθμίσεις Scheduler Contract V2
          </h2>
          <p className="text-xs text-slate-700 sm:text-sm dark:text-slate-300">
            Πλήρης διαμόρφωση ωραρίων, προτύπων, κάλυψης, συμμόρφωσης και πολιτικής Κυριακών.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveV2Config}
            disabled={isBusy || !v2Validation.valid}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingGenerator ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων V2'}
          </button>
        </div>
      </div>

      {/* Live Validation Alert */}
      {!v2Validation.valid ? (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-bold">Εντοπίστηκαν σφάλματα επικύρωσης ρυθμίσεων:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {v2Validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-2 text-xs font-medium text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-200">
          ✓ Οι ρυθμίσεις προγραμματισμού V2 είναι έγκυρες.
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2 dark:border-slate-700">
        {[
          { id: 'v2_operating', label: 'Ωράριο Λειτουργίας' },
          { id: 'v2_templates', label: 'Πρότυπα Βαρδιών' },
          { id: 'v2_coverage', label: 'Απαιτήσεις Κάλυψης' },
          { id: 'v2_compliance', label: 'Κανόνες Συμμόρφωσης & Ανάπαυσης' },
          { id: 'v2_sunday', label: 'Κυριακές & Αργίες' },
          { id: 'legacy_employees', label: 'Εργαζόμενοι & Ρόλοι' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.id
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Operating Days & Windows */}
      {activeTab === 'v2_operating' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Ημέρες & Παράθυρα Λειτουργίας Επιχείρησης
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(v2Draft.operatingDays || []).map((day, dIdx) => (
              <div key={day.weekday} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {WEEKDAY_NAMES_GR[day.weekday] || day.weekday}
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={day.isOpen}
                      onChange={(e) => {
                        const nextDays = [...v2Draft.operatingDays];
                        nextDays[dIdx] = { ...day, isOpen: e.target.checked };
                        setV2Draft({ ...v2Draft, operatingDays: nextDays });
                      }}
                    />
                    Ανοιχτά
                  </label>
                </div>

                {day.isOpen ? (
                  <div className="mt-2 space-y-2">
                    {(day.windows || []).map((w, wIdx) => (
                      <div key={wIdx} className="flex items-center gap-1 text-xs">
                        <input
                          type="time"
                          value={w.openTime}
                          onChange={(e) => {
                            const nextDays = [...v2Draft.operatingDays];
                            const nextWindows = [...day.windows];
                            nextWindows[wIdx] = { ...w, openTime: e.target.value };
                            nextDays[dIdx] = { ...day, windows: nextWindows };
                            setV2Draft({ ...v2Draft, operatingDays: nextDays });
                          }}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                        />
                        <span>έως</span>
                        <input
                          type="time"
                          value={w.closeTime}
                          onChange={(e) => {
                            const nextDays = [...v2Draft.operatingDays];
                            const nextWindows = [...day.windows];
                            nextWindows[wIdx] = { ...w, closeTime: e.target.value };
                            nextDays[dIdx] = { ...day, windows: nextWindows };
                            setV2Draft({ ...v2Draft, operatingDays: nextDays });
                          }}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs italic text-slate-500">Κλειστά</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Shift Templates */}
      {activeTab === 'v2_templates' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Πρότυπα Βαρδιών (Shift Templates)
            </h3>
            <button
              type="button"
              onClick={() => {
                const newId = `shift-custom-${Date.now()}`;
                const newTpl = {
                  id: newId,
                  label: 'Νέα Βάρδια',
                  shortCode: 'ΝΕΑ',
                  shiftType: 'CUSTOM',
                  startTime: '08:00',
                  endTime: '16:00',
                  durationHours: 8.0,
                  unpaidBreakMinutes: 0,
                  crossMidnight: false,
                  color: '#0D9488',
                  isActive: true,
                };
                setV2Draft({
                  ...v2Draft,
                  shiftTemplates: [...(v2Draft.shiftTemplates || []), newTpl],
                });
              }}
              className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + Προσθήκη Προτύπου
            </button>
          </div>

          <div className="space-y-2">
            {(v2Draft.shiftTemplates || []).map((tpl, tIdx) => (
              <div key={tpl.id} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Όνομα</label>
                    <input
                      type="text"
                      value={tpl.label}
                      onChange={(e) => {
                        const nextTemplates = [...v2Draft.shiftTemplates];
                        nextTemplates[tIdx] = { ...tpl, label: e.target.value };
                        setV2Draft({ ...v2Draft, shiftTemplates: nextTemplates });
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Κωδικός</label>
                    <input
                      type="text"
                      value={tpl.shortCode}
                      onChange={(e) => {
                        const nextTemplates = [...v2Draft.shiftTemplates];
                        nextTemplates[tIdx] = { ...tpl, shortCode: e.target.value };
                        setV2Draft({ ...v2Draft, shiftTemplates: nextTemplates });
                      }}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Έναρξη - Λήξη</label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="time"
                        value={tpl.startTime}
                        onChange={(e) => {
                          const nextTemplates = [...v2Draft.shiftTemplates];
                          const newStart = e.target.value;
                          const derived = deriveShiftDurationHours(newStart, tpl.endTime, Boolean(tpl.crossMidnight), tpl.unpaidBreakMinutes);
                          nextTemplates[tIdx] = { ...tpl, startTime: newStart, durationHours: derived };
                          setV2Draft({ ...v2Draft, shiftTemplates: nextTemplates });
                        }}
                        className="rounded border border-slate-300 px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                      />
                      <span>-</span>
                      <input
                        type="time"
                        value={tpl.endTime}
                        onChange={(e) => {
                          const nextTemplates = [...v2Draft.shiftTemplates];
                          const newEnd = e.target.value;
                          const derived = deriveShiftDurationHours(tpl.startTime, newEnd, Boolean(tpl.crossMidnight), tpl.unpaidBreakMinutes);
                          nextTemplates[tIdx] = { ...tpl, endTime: newEnd, durationHours: derived };
                          setV2Draft({ ...v2Draft, shiftTemplates: nextTemplates });
                        }}
                        className="rounded border border-slate-300 px-1 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Διάρκεια (Ώρες)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={tpl.durationHours}
                      readOnly
                      className="mt-1 w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <label className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={tpl.isActive}
                        onChange={(e) => {
                          const nextTemplates = [...v2Draft.shiftTemplates];
                          nextTemplates[tIdx] = { ...tpl, isActive: e.target.checked };
                          setV2Draft({ ...v2Draft, shiftTemplates: nextTemplates });
                        }}
                      />
                      Ενεργό
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setV2Draft({
                          ...v2Draft,
                          shiftTemplates: v2Draft.shiftTemplates.filter((t) => t.id !== tpl.id),
                        });
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Διαγραφή
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Coverage Requirements */}
      {activeTab === 'v2_coverage' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Απαιτήσεις Κάλυψης Προσωπικού ανά Ημέρα
          </h3>
          <div className="space-y-3">
            {(v2Draft.coverageRequirements || []).map((pattern, pIdx) => (
              <div key={pattern.weekday} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="mb-2 font-bold text-slate-900 dark:text-white">
                  {WEEKDAY_NAMES_GR[pattern.weekday] || pattern.weekday}
                </div>
                <div className="space-y-2">
                  {(pattern.slots || []).map((slot, sIdx) => (
                    <div key={sIdx} className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {v2Draft.shiftTemplates?.find((t) => t.id === slot.shiftTemplateId)?.label || slot.shiftTemplateId}
                      </span>
                      <label className="inline-flex items-center gap-1">
                        <span>Ελάχιστοι:</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={slot.minHeadcount}
                          onChange={(e) => {
                            const nextPatterns = [...v2Draft.coverageRequirements];
                            const nextSlots = [...pattern.slots];
                            nextSlots[sIdx] = { ...slot, minHeadcount: Number(e.target.value) };
                            nextPatterns[pIdx] = { ...pattern, slots: nextSlots };
                            setV2Draft({ ...v2Draft, coverageRequirements: nextPatterns });
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <span>Στόχος:</span>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={slot.targetHeadcount}
                          onChange={(e) => {
                            const nextPatterns = [...v2Draft.coverageRequirements];
                            const nextSlots = [...pattern.slots];
                            nextSlots[sIdx] = { ...slot, targetHeadcount: Number(e.target.value) };
                            nextPatterns[pIdx] = { ...pattern, slots: nextSlots };
                            setV2Draft({ ...v2Draft, coverageRequirements: nextPatterns });
                          }}
                          className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Compliance & Rest Rules */}
      {activeTab === 'v2_compliance' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Κανόνες Συμμόρφωσης & Εργατικής Νομοθεσίας
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Ελάχιστα Ρεπό ανά Εβδομάδα
              </label>
              <input
                type="number"
                min="1"
                max="6"
                value={v2Draft.complianceRules?.minDaysOffPerWeek || 1}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    complianceRules: {
                      ...v2Draft.complianceRules,
                      minDaysOffPerWeek: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Μέγιστες Συνεχόμενες Ημέρες Εργασίας
              </label>
              <input
                type="number"
                min="1"
                max="14"
                value={v2Draft.complianceRules?.maxConsecutiveWorkingDays || 6}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    complianceRules: {
                      ...v2Draft.complianceRules,
                      maxConsecutiveWorkingDays: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Ελάχιστη Ανάπαυση μεταξύ Βαρδιών (Ώρες)
              </label>
              <input
                type="number"
                min="8"
                max="24"
                step="0.5"
                value={v2Draft.complianceRules?.minRestIntervalBetweenShiftsHours || 11.0}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    complianceRules: {
                      ...v2Draft.complianceRules,
                      minRestIntervalBetweenShiftsHours: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Μέγιστες Ημερήσιες Ώρες
              </label>
              <input
                type="number"
                min="1"
                max="24"
                value={v2Draft.complianceRules?.maxDailyWorkingHours || 12.0}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    complianceRules: {
                      ...v2Draft.complianceRules,
                      maxDailyWorkingHours: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Μέγιστες Εβδομαδιαίες Ώρες
              </label>
              <input
                type="number"
                min="10"
                max="84"
                value={v2Draft.complianceRules?.maxWeeklyStandardHours || 48.0}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    complianceRules: {
                      ...v2Draft.complianceRules,
                      maxWeeklyStandardHours: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Sunday & Holiday Policy */}
      {activeTab === 'v2_sunday' && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Πολιτική Κυριακών & Δημοσίων Αργιών
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Λειτουργία Κυριακής
              </label>
              <select
                value={v2Draft.sundayAndHolidays?.sundayMode || 'CYCLIC_FAIR'}
                onChange={(e) =>
                  setV2Draft({
                    ...v2Draft,
                    sundayAndHolidays: {
                      ...v2Draft.sundayAndHolidays,
                      sundayMode: e.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
              >
                {SUNDAY_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {v2Draft.sundayAndHolidays?.sundayMode === 'FIXED_ASSIGNMENT' && (
              <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Σταθερός Υπάλληλος Κυριακής
                </label>
                <select
                  value={v2Draft.sundayAndHolidays?.fixedSundayEmployeeIds?.[0] || ''}
                  onChange={(e) =>
                    setV2Draft({
                      ...v2Draft,
                      sundayAndHolidays: {
                        ...v2Draft.sundayAndHolidays,
                        fixedSundayEmployeeIds: e.target.value ? [e.target.value] : [],
                      },
                    })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">Επίλεξε σταθερό εργαζόμενο</option>
                  {activeEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.scheduleRole || 'auto'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white/60 p-3 sm:col-span-2 dark:border-slate-700 dark:bg-slate-900/50">
              <label className="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={Boolean(v2Draft.sundayAndHolidays?.avoidConsecutiveSundays)}
                  onChange={(e) =>
                    setV2Draft({
                      ...v2Draft,
                      sundayAndHolidays: {
                        ...v2Draft.sundayAndHolidays,
                        avoidConsecutiveSundays: e.target.checked,
                      },
                    })
                  }
                />
                Αποφυγή συνεχόμενων Κυριακών στον ίδιο εργαζόμενο
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Employees & Legacy Rules (Preserving all existing data-testids) */}
      {activeTab === 'legacy_employees' && (
        <div>
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
        </div>
      )}
    </section>
  );
}

