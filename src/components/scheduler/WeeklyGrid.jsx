import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SHIFT_TYPE_OPTIONS, WEEKDAY_LABELS } from '../../data/constants';
import { SHIFT_TYPES } from '../../utils/analytics';
import {
  formatGreekDate,
  getDurationLabel,
  groupAndSortShiftsByDay,
  inferShiftTypeFromTimes,
} from '../../utils/scheduleUtils';
import { formatDateGreek, normalizeTimeLabel, timeToMinutes } from '../../utils/time';
import AssignedShiftItem from './AssignedShiftItem';

const MONTH_OPTIONS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

const SHIFT_TYPE_LABEL_MAP = SHIFT_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

function getShiftLabelForDraft(draft) {
  if ((draft.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) {
    return draft.label?.trim() || 'Μη εργάσιμη ημέρα';
  }
  if (draft.shiftType === 'custom') {
    return draft.customLabel?.trim() || draft.label?.trim() || 'Προσαρμοσμένη';
  }
  return SHIFT_TYPE_LABEL_MAP[draft.shiftType] || draft.label?.trim() || 'Προσαρμοσμένη';
}

function buildDraftFromShift(shift) {
  const normalizedType = shift?.type || SHIFT_TYPES.WORK;
  const normalizedShiftType = shift?.shiftType || inferShiftTypeFromTimes(shift?.startTime, shift?.endTime);
  return {
    employeeId: shift?.employeeId || '',
    date: shift?.date || '',
    startTime: shift?.startTime || '06:00',
    endTime: shift?.endTime || '14:00',
    type: normalizedType,
    shiftType: normalizedShiftType,
    customLabel: shift?.customLabel || '',
    label: shift?.label || '',
    notes: shift?.notes || '',
    isHoliday: Boolean(shift?.isHoliday),
    isSpecialDay: Boolean(shift?.isSpecialDay),
    specialDayLabel: shift?.specialDayLabel || '',
    isManualOverride: shift?.isManualOverride !== false,
  };
}

function buildNewDraft({ date, employeeId = '' }) {
  return {
    employeeId,
    date,
    startTime: '06:00',
    endTime: '14:00',
    type: SHIFT_TYPES.WORK,
    shiftType: 'morning',
    customLabel: '',
    label: '',
    notes: '',
    isHoliday: false,
    isSpecialDay: false,
    specialDayLabel: '',
    isManualOverride: true,
  };
}

function getDaySpecialInfo(dayShifts, specialDayConfig) {
  if (specialDayConfig) {
    if (specialDayConfig.label?.trim()) {
      const hasWindow = specialDayConfig.operatingStartTime && specialDayConfig.operatingEndTime;
      if (hasWindow) {
        return `${specialDayConfig.label.trim()} (${specialDayConfig.operatingStartTime}-${specialDayConfig.operatingEndTime})`;
      }
      return specialDayConfig.label.trim();
    }
    if (specialDayConfig.operatingStartTime && specialDayConfig.operatingEndTime) {
      return `Ειδικό Ωράριο ${specialDayConfig.operatingStartTime}-${specialDayConfig.operatingEndTime}`;
    }
    if (specialDayConfig.isHoliday) return 'Αργία';
    if (specialDayConfig.isSpecialDay) return 'Ειδικό Ωράριο';
  }

  const specialShift = (dayShifts || []).find((item) => item.isHoliday || item.isSpecialDay);
  if (!specialShift) return null;
  if (specialShift.specialDayLabel?.trim()) return specialShift.specialDayLabel.trim();
  return specialShift.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο';
}

function getDayLabel(date) {
  return new Intl.DateTimeFormat('el-GR', { weekday: 'long' }).format(new Date(`${date}T00:00:00`));
}

function getSnapshotSourceLabel(source) {
  switch (source) {
    case 'manual_save_button':
      return 'Αποθήκευση';
    case 'manual_save':
      return 'Αυτόματη Αποθήκευση';
    case 'magic_wand':
      return 'Magic Wand';
    case 'finalize':
      return 'Οριστικοποίηση';
    case 'template_load':
      return 'Φόρτωση Προτύπου';
    case 'history_load':
      return 'Φόρτωση Ιστορικού';
    default:
      return source || 'χειροκίνητα';
  }
}

function buildConflictShiftIdSet(shifts) {
  const shiftsByEmployeeDay = new Map();
  const conflictIds = new Set();

  for (const shift of shifts || []) {
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) continue;
    if (!shift.employeeId || !shift.date || !shift.id) continue;

    const key = `${shift.employeeId}_${shift.date}`;
    if (!shiftsByEmployeeDay.has(key)) {
      shiftsByEmployeeDay.set(key, []);
    }
    shiftsByEmployeeDay.get(key).push(shift);
  }

  for (const dayShifts of shiftsByEmployeeDay.values()) {
    dayShifts.sort((a, b) => {
      const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (startDiff !== 0) return startDiff;
      return timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
    });

    for (let index = 0; index < dayShifts.length; index += 1) {
      const current = dayShifts[index];
      const currentEnd = timeToMinutes(current.endTime);

      for (let nextIndex = index + 1; nextIndex < dayShifts.length; nextIndex += 1) {
        const next = dayShifts[nextIndex];
        if (timeToMinutes(next.startTime) >= currentEnd) break;
        conflictIds.add(current.id);
        conflictIds.add(next.id);
      }
    }
  }

  return conflictIds;
}

const TemplateAssignmentCard = memo(function TemplateAssignmentCard({ template, canManage, onDeleteTemplate }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `template-assignment-${template.id}`,
    data: { type: 'template-assignment', template },
    disabled: !canManage,
  });

  return (
    <article
      ref={setNodeRef}
      className={`rounded-xl border p-3 text-xs shadow-sm backdrop-blur-sm transition ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/90 dark:border-cyan-300 dark:bg-cyan-500/15'
          : 'border-cyan-300/45 bg-cyan-50/70 dark:border-cyan-300/30 dark:bg-slate-900/45'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{template.label}</p>
          <p className="text-slate-700 dark:text-slate-300">
            {normalizeTimeLabel(template.startTime)} - {normalizeTimeLabel(template.endTime)} ({getDurationLabel(template.startTime, template.endTime)})
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => onDeleteTemplate(template.id)}
            className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
            title="Διαγραφή κάρτας"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-slate-300/70 px-2 py-1.5 text-[11px] text-slate-700 dark:border-cyan-300/35 dark:text-slate-300">
        <UserRound size={13} />
        {canManage ? 'Σύρε υπάλληλο εδώ για ανάθεση' : 'Αναμονή ανάθεσης'}
      </div>
    </article>
  );
});

const DayBox = memo(function DayBox({
  day,
  title,
  subtitle,
  dayShifts,
  dayTemplates,
  specialDayConfig,
  canManage,
  getEmployeeById,
  getSundayViolationMessage,
  conflictShiftIds,
  onDeleteShift,
  onToggleManualOverride,
  onDeleteShiftTemplate,
  onOpenDayEditor,
  onClearDay,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-box-${day}`,
    data: { type: 'day-box', day: { date: day } },
    disabled: !canManage,
  });

  const specialInfo = getDaySpecialInfo(dayShifts, specialDayConfig);
  const manualCount = (dayShifts || []).filter((item) => item.isManualOverride).length;

  return (
    <section
      ref={setNodeRef}
      data-day-anchor={day}
      onDragOver={(event) => event.preventDefault()}
      className={`relative overflow-hidden rounded-2xl border p-3 shadow-sm backdrop-blur-sm transition sm:p-4 ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/70 dark:border-cyan-300 dark:bg-cyan-500/10'
          : 'border-white/45 bg-white/45 dark:border-cyan-300/30 dark:bg-slate-900/40'
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-200/45 blur-2xl dark:bg-pink-400/20" />

      <header className="relative mb-3 rounded-xl bg-slate-900/85 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-950/85 dark:text-cyan-100">
        <div className="flex items-center justify-between gap-2">
          <span>
            {title} ({subtitle})
          </span>
          {canManage ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenDayEditor?.(day, title, subtitle)}
                className="rounded p-1 text-white/85 hover:bg-sky-500/20 hover:text-sky-100"
                title="Επεξεργασία ημέρας"
                aria-label="Επεξεργασία ημέρας"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onClearDay(day)}
                className="rounded p-1 text-white/85 hover:bg-red-500/20 hover:text-red-200"
                title="Καθαρισμός ημέρας"
                aria-label="Καθαρισμός ημέρας"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}
        </div>
        {specialInfo ? (
          <span className="mt-1 inline-flex rounded-full border border-amber-300/60 bg-amber-100/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
            {specialInfo === 'Αργία' ? 'Αργία' : `Ειδικό Ωράριο: ${specialInfo}`}
          </span>
        ) : null}
        {manualCount > 0 ? (
          <span className="mt-1 ml-2 inline-flex rounded-full border border-fuchsia-300/60 bg-fuchsia-200/20 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-100">
            Manual entries: {manualCount}
          </span>
        ) : null}
      </header>

      <div className="space-y-2">
        {dayTemplates.map((template) => (
          <TemplateAssignmentCard
            key={template.id}
            template={template}
            canManage={canManage}
            onDeleteTemplate={onDeleteShiftTemplate}
          />
        ))}

        {dayShifts.map((shift) => {
          const sundayWarning = getSundayViolationMessage(shift.id);
          return (
            <div key={shift.id} className="space-y-1">
              <AssignedShiftItem
                shift={shift}
                employee={getEmployeeById(shift.employeeId)}
                hasConflict={conflictShiftIds.has(shift.id)}
                onDelete={onDeleteShift}
                onEdit={() => onOpenDayEditor?.(day, title, subtitle, shift)}
                onToggleManualOverride={onToggleManualOverride}
                canManage={canManage}
              />
              {sundayWarning ? (
                <p className="rounded border border-amber-300/60 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/10 dark:text-amber-200">
                  {sundayWarning}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
});

function ScheduleModeSelector({ scheduleMode, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
      Τύπος Προγράμματος
      <select
        className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
        value={scheduleMode}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="week">Διαμόρφωση προγράμματος εβδομάδας</option>
        <option value="month">Διαμόρφωση προγράμματος μήνα</option>
      </select>
    </label>
  );
}

export default function WeeklyGrid({
  weekDays,
  monthDays = [],
  shifts,
  shiftTemplates,
  employees,
  weekHistory = [],
  weekTemplates = [],
  selectedHistoryWeekId = '',
  selectedTemplateId = '',
  selectedMonth = new Date().getMonth(),
  selectedYear = new Date().getFullYear(),
  scheduleMode = 'week',
  monthlyRoleConfig = { coreAId: '', coreBId: '', intermediateId: '' },
  sundayRuleViolations = {},
  specialDaysByDate = {},
  onChangeScheduleMode,
  onSelectMonth,
  onSelectYear,
  onChangeMonthlyRoleConfig,
  onSelectHistoryWeek,
  onLoadSelectedHistoryWeek,
  onSaveAsTemplate,
  onSelectTemplate,
  onLoadSelectedTemplate,
  onMagicWand,
  onGenerateMonthlySchedule,
  onJumpToWeekDate,
  onCreateShift,
  onUpdateShift,
  onDeleteShift,
  onToggleManualOverride,
  onDeleteShiftTemplate,
  onClearDayShifts,
  canManage,
  isSaving = false,
}) {
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const gridSectionRef = useRef(null);
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const grouped = useMemo(() => groupAndSortShiftsByDay(shifts), [shifts]);
  const conflictShiftIds = useMemo(() => buildConflictShiftIdSet(shifts), [shifts]);

  const navItems = useMemo(
    () =>
      weekDays.map((day, index) => ({
        key: day,
        label: WEEKDAY_LABELS[index],
        date: formatDateGreek(day),
      })),
    [weekDays],
  );

  const placedTemplatesByDay = useMemo(() => {
    const map = new Map(weekDays.map((day) => [day, []]));
    shiftTemplates.forEach((template) => {
      if (!template.isPlaced) return;
      if (!map.has(template.date)) return;
      map.get(template.date).push(template);
    });
    for (const values of map.values()) {
      values.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [shiftTemplates, weekDays]);

  const monthYears = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => year - 3 + index);
  }, []);

  const activeEmployees = useMemo(
    () => (employees || []).filter((employee) => employee?.isActive !== false),
    [employees],
  );
  const visibleDayOptions = scheduleMode === 'month' ? monthDays : weekDays;

  const [dayEditor, setDayEditor] = useState({
    open: false,
    date: '',
    title: '',
    subtitle: '',
    editingShiftId: '',
  });
  const [dayEditorDraft, setDayEditorDraft] = useState(() =>
    buildNewDraft({
      date: weekDays[0] || monthDays[0] || '',
      employeeId: '',
    }),
  );
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [dayEditorAnchorTop, setDayEditorAnchorTop] = useState(0);

  const dayEditorShifts = useMemo(() => {
    if (!dayEditor?.date) return [];
    return grouped[dayEditor.date] || [];
  }, [dayEditor?.date, grouped]);

  useEffect(() => {
    if (!dayEditor.open) return;
    const fallbackDate = dayEditor.date || visibleDayOptions[0] || '';
    const fallbackEmployeeId = dayEditor.editingShiftId ? activeEmployees[0]?.id || '' : '';

    setDayEditorDraft((prev) => {
      const nextDate = visibleDayOptions.includes(prev.date) ? prev.date : fallbackDate;
      const nextEmployeeId = activeEmployees.some((employee) => employee.id === prev.employeeId)
        ? prev.employeeId
        : fallbackEmployeeId;
      return {
        ...prev,
        date: nextDate,
        employeeId: nextEmployeeId,
      };
    });
  }, [activeEmployees, dayEditor.date, dayEditor.open, visibleDayOptions]);

  const updateDayEditorAnchor = useCallback((date) => {
    const container = gridSectionRef.current;
    if (!container || !date) return;

    const anchorElement = container.querySelector(`[data-day-anchor="${date}"]`);
    if (!anchorElement) return;

    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();
    const nextTop = Math.max(0, anchorRect.bottom - containerRect.top + 10);
    setDayEditorAnchorTop(nextTop);
  }, []);

  const openDayEditor = useCallback((date, title, subtitle, shift = null) => {
    if (!canManage) return;
    updateDayEditorAnchor(date);
    setDayEditor({
      open: true,
      date,
      title,
      subtitle,
      editingShiftId: shift?.id || '',
    });
    setDayEditorDraft(
      shift
        ? buildDraftFromShift(shift)
        : buildNewDraft({
            date,
            employeeId: '',
          }),
    );
  }, [canManage, updateDayEditorAnchor]);

  function closeDayEditor() {
    setDayEditor({
      open: false,
      date: '',
      title: '',
      subtitle: '',
      editingShiftId: '',
    });
    setDayEditorDraft(
      buildNewDraft({
        date: visibleDayOptions[0] || '',
        employeeId: '',
      }),
    );
  }

  function setEditorToCreateMode() {
    setDayEditor((prev) => ({ ...prev, editingShiftId: '' }));
    setDayEditorDraft(
      buildNewDraft({
        date: dayEditor.date || visibleDayOptions[0] || '',
        employeeId: '',
      }),
    );
  }

  function setEditorToExistingShift(shift) {
    if (!shift) return;
    setDayEditor((prev) => ({ ...prev, editingShiftId: shift.id }));
    setDayEditorDraft(buildDraftFromShift(shift));
  }

  useEffect(() => {
    if (!dayEditor.open || !dayEditor.date) return;
    const rafId = window.requestAnimationFrame(() => updateDayEditorAnchor(dayEditor.date));
    return () => window.cancelAnimationFrame(rafId);
  }, [dayEditor.date, dayEditor.open, scheduleMode, updateDayEditorAnchor, weekDays, monthDays]);

  async function handleDayEditorSave(event) {
    event.preventDefault();
    if (!canManage) return;

    const payload = {
      employeeId: dayEditorDraft.employeeId,
      date: dayEditorDraft.date,
      startTime: dayEditorDraft.startTime,
      endTime: dayEditorDraft.endTime,
      type: dayEditorDraft.type,
      shiftType: dayEditorDraft.shiftType,
      customLabel: dayEditorDraft.customLabel || '',
      notes: dayEditorDraft.notes || '',
      isHoliday: Boolean(dayEditorDraft.isHoliday),
      isSpecialDay: Boolean(dayEditorDraft.isSpecialDay),
      specialDayLabel: dayEditorDraft.specialDayLabel || '',
      isManualOverride: dayEditorDraft.isManualOverride !== false,
      label: getShiftLabelForDraft(dayEditorDraft),
    };

    setIsEditorSaving(true);
    try {
      if (dayEditor.editingShiftId) {
        const targetShiftId = dayEditor.editingShiftId;
        const updated = await onUpdateShift?.({
          shiftId: targetShiftId,
          ...payload,
        });
        if (updated) {
          closeDayEditor();
        }
        return;
      }

      const created = await onCreateShift?.(payload);
      if (created) {
        closeDayEditor();
      }
    } finally {
      setIsEditorSaving(false);
    }
  }

  const getEmployeeById = useCallback((employeeId) => employeeById.get(employeeId), [employeeById]);

  const getSundayViolationMessage = useCallback(
    (shiftId) => sundayRuleViolations?.[shiftId] || '',
    [sundayRuleViolations],
  );

  const clearDayWithConfirm = useCallback((date) => {
    const shouldClear = window.confirm(`Να διαγραφούν όλες οι βάρδιες για ${formatDateGreek(date)};`);
    if (!shouldClear) return;
    onClearDayShifts(date);
  }, [onClearDayShifts]);

  function getScrollStep() {
    const container = scrollRef.current;
    if (!container) return 0;
    const firstChild = container.firstElementChild;
    const childWidth = firstChild ? firstChild.getBoundingClientRect().width : container.clientWidth;
    const styles = getComputedStyle(container);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || 0);
    return childWidth + gap;
  }

  function scrollToIndex(index) {
    const container = scrollRef.current;
    if (!container) return;
    const safeIndex = Math.max(0, Math.min(index, navItems.length - 1));
    const step = getScrollStep() || container.clientWidth;
    container.scrollTo({ left: step * safeIndex, behavior: 'smooth' });
    setActiveIndex(safeIndex);
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const step = getScrollStep() || container.clientWidth;
    const nextIndex = Math.round(container.scrollLeft / step);
    if (nextIndex !== activeIndex) {
      setActiveIndex(Math.max(0, Math.min(nextIndex, navItems.length - 1)));
    }
  }

  return (
    <section id="weekly-grid-export" ref={gridSectionRef} className="glass-panel relative rounded-2xl p-2 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Πίνακας Βαρδιών</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleModeSelector scheduleMode={scheduleMode} onChange={onChangeScheduleMode} />
          {isSaving ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-brand-200/70 bg-brand-50/80 px-2 py-1 text-[11px] font-semibold text-brand-800 dark:border-cyan-300/45 dark:bg-cyan-500/15 dark:text-cyan-100">
              <Loader2 size={12} className="animate-spin" />
              Αποθήκευση...
            </div>
          ) : null}
        </div>
      </div>

      {scheduleMode === 'week' ? (
        <>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                onChange={(event) => onJumpToWeekDate?.(event.target.value)}
              />
              <select
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                value={selectedHistoryWeekId}
                onChange={(event) => onSelectHistoryWeek?.(event.target.value)}
              >
                <option value="">Ιστορικό εβδομάδων</option>
                {weekHistory.map((item) => (
                  <option key={item.id} value={item.weekId}>
                    {item.weekStart} ({getSnapshotSourceLabel(item.source)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onLoadSelectedHistoryWeek}
                disabled={!canManage || !selectedHistoryWeekId}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Φόρτωση Εβδομάδας
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <select
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                value={selectedTemplateId}
                onChange={(event) => onSelectTemplate?.(event.target.value)}
              >
                <option value="">Πρότυπα</option>
                {weekTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  const name = window.prompt('Όνομα προτύπου');
                  if (!name) return;
                  await onSaveAsTemplate?.(name);
                }}
                disabled={!canManage}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Αποθήκευση ως Πρότυπο
              </button>
              <button
                type="button"
                onClick={onLoadSelectedTemplate}
                disabled={!canManage || !selectedTemplateId}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Φόρτωση Προτύπου
              </button>
              <button
                type="button"
                onClick={onMagicWand}
                disabled={!canManage}
                className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Αυτόματη Δημιουργία
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              aria-label="Προηγούμενη ημέρα"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-thin snap-x snap-mandatory scroll-smooth">
              {navItems.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => scrollToIndex(index)}
                  className={`flex w-[110px] shrink-0 snap-center flex-col items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                    activeIndex === index
                      ? 'border-brand-400 bg-brand-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white/70 text-slate-700'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] font-medium opacity-80">{item.date}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              aria-label="Επόμενη ημέρα"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth md:grid md:min-w-[1120px] md:grid-cols-2 md:gap-4 md:snap-none xl:grid-cols-4"
          >
            {weekDays.map((day, index) => {
              const dayShifts = grouped[day] || [];
              const dayTemplates = placedTemplatesByDay.get(day) || [];

              return (
                <div key={day} className="min-w-full shrink-0 snap-start md:min-w-0 md:snap-none">
                  <DayBox
                    day={day}
                    title={WEEKDAY_LABELS[index]}
                    subtitle={formatDateGreek(day)}
                  dayShifts={dayShifts}
                  dayTemplates={dayTemplates}
                  specialDayConfig={specialDaysByDate?.[day]}
                  canManage={canManage}
                  getEmployeeById={getEmployeeById}
                  getSundayViolationMessage={getSundayViolationMessage}
                  conflictShiftIds={conflictShiftIds}
                  onDeleteShift={onDeleteShift}
                  onToggleManualOverride={onToggleManualOverride}
                  onDeleteShiftTemplate={onDeleteShiftTemplate}
                  onOpenDayEditor={openDayEditor}
                  onClearDay={clearDayWithConfirm}
                />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Μήνας
              <select
                value={selectedMonth}
                onChange={(event) => onSelectMonth?.(Number(event.target.value))}
                className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                {MONTH_OPTIONS.map((monthLabel, index) => (
                  <option key={monthLabel} value={index}>
                    {monthLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Έτος
              <select
                value={selectedYear}
                onChange={(event) => onSelectYear?.(Number(event.target.value))}
                className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                {monthYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onGenerateMonthlySchedule}
              disabled={!canManage}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Αυτόματη δημιουργία μηνιαίου προγράμματος
            </button>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Βασικός Υπάλληλος Α
              <select
                value={monthlyRoleConfig?.coreAId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, coreAId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Βασικός Υπάλληλος Β
              <select
                value={monthlyRoleConfig?.coreBId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, coreBId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Ενδιάμεσος Υπάλληλος
              <select
                value={monthlyRoleConfig?.intermediateId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, intermediateId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {monthDays.map((day) => {
              const dayShifts = grouped[day] || [];
              return (
                <DayBox
                  key={day}
                  day={day}
                  title={getDayLabel(day)}
                  subtitle={formatGreekDate(day)}
                  dayShifts={dayShifts}
                  dayTemplates={[]}
                  specialDayConfig={specialDaysByDate?.[day]}
                  canManage={canManage}
                  getEmployeeById={getEmployeeById}
                  getSundayViolationMessage={getSundayViolationMessage}
                  conflictShiftIds={conflictShiftIds}
                  onDeleteShift={onDeleteShift}
                  onToggleManualOverride={onToggleManualOverride}
                  onDeleteShiftTemplate={onDeleteShiftTemplate}
                  onOpenDayEditor={openDayEditor}
                  onClearDay={clearDayWithConfirm}
                />
              );
            })}
          </div>

          {!monthDays.length ? (
            <p className="rounded-xl border border-slate-300/60 bg-white/45 p-4 text-sm text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-200">
              Δεν βρέθηκαν ημέρες για τον επιλεγμένο μήνα.
            </p>
          ) : null}
        </>
      )}

      {dayEditor.open ? (
        <div
          className="absolute left-2 right-2 z-[90] sm:left-4 sm:right-4"
          style={{ top: `${dayEditorAnchorTop}px` }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur-md dark:border-cyan-300/30 dark:bg-slate-950/90">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-cyan-300/20">
              <div>
                <h3 className="text-sm font-bold text-slate-900 sm:text-base dark:text-white">
                  Επεξεργασία Ημέρας: {dayEditor.title} ({dayEditor.subtitle})
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Πλήρης διαχείριση βαρδιών (προσθήκη, αλλαγή, διαγραφή).
                </p>
              </div>
              <button
                type="button"
                onClick={closeDayEditor}
                className="rounded-md border border-slate-300/70 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-cyan-300/35 dark:text-slate-100 dark:hover:bg-slate-800/70"
              >
                Κλείσιμο
              </button>
            </div>

            <div className="grid max-h-[80vh] gap-4 overflow-y-auto p-4 lg:grid-cols-[1.1fr,1.4fr]">
              <aside className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    Βάρδιες ημέρας ({dayEditorShifts.length})
                  </h4>
                  <button
                    type="button"
                    onClick={setEditorToCreateMode}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-600"
                    disabled={!canManage}
                  >
                    <Plus size={12} />
                    Προσθήκη Υπαλλήλου
                  </button>
                </div>

                {!dayEditorShifts.length ? (
                  <p className="rounded-lg border border-dashed border-slate-300/80 p-3 text-xs text-slate-600 dark:border-cyan-300/30 dark:text-slate-300">
                    Δεν υπάρχουν βάρδιες για την επιλεγμένη ημέρα.
                  </p>
                ) : null}

                {dayEditorShifts.map((shift) => {
                  const employee = getEmployeeById(shift.employeeId);
                  const isEditing = dayEditor.editingShiftId === shift.id;
                  return (
                    <div
                      key={shift.id}
                      className={`rounded-lg border p-2 text-xs ${
                        isEditing
                          ? 'border-brand-300 bg-brand-50/80 dark:border-cyan-300/50 dark:bg-cyan-500/15'
                          : 'border-slate-200/80 bg-white/70 dark:border-cyan-300/25 dark:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">
                            {employee?.fullName || 'Άγνωστος'}
                          </p>
                          <p className="text-slate-700 dark:text-slate-300">
                            {shift.startTime} - {shift.endTime}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditorToExistingShift(shift)}
                            className="rounded p-1 text-slate-600 hover:bg-sky-100 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-sky-500/30 dark:hover:text-sky-200"
                            title="Επεξεργασία βάρδιας"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const deleted = await onDeleteShift?.(shift.id);
                              if (deleted && dayEditor.editingShiftId === shift.id) {
                                setEditorToCreateMode();
                              }
                            }}
                            className="rounded p-1 text-slate-600 hover:bg-red-100 hover:text-red-700 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
                            title="Διαγραφή βάρδιας"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {shift.isManualOverride ? (
                        <span className="mt-1 inline-flex rounded-full border border-fuchsia-300/70 bg-fuchsia-100/80 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-900 dark:border-fuchsia-300/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-100">
                          Manual Override
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </aside>

              <form onSubmit={handleDayEditorSave} className="grid gap-2 sm:grid-cols-2">
                <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  {dayEditor.editingShiftId ? 'Επεξεργασία Βάρδιας' : 'Προσθήκη Υπαλλήλου'}
                </h4>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Υπάλληλος
                  <select
                    value={dayEditorDraft.employeeId}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, employeeId: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                    disabled={!canManage}
                  >
                    <option value="" disabled>
                      Επιλογή υπαλλήλου
                    </option>
                    {activeEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Ημερομηνία
                  <select
                    value={dayEditorDraft.date}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, date: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                    disabled={!canManage}
                  >
                    {visibleDayOptions.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Κατηγορία
                  <select
                    value={dayEditorDraft.type}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, type: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    disabled={!canManage}
                  >
                    <option value={SHIFT_TYPES.WORK}>Εργασία</option>
                    <option value={SHIFT_TYPES.REST}>Ρεπό</option>
                    <option value={SHIFT_TYPES.LEAVE}>Άδεια</option>
                    <option value={SHIFT_TYPES.SICK}>Ασθένεια</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Τύπος Βάρδιας
                  <select
                    value={dayEditorDraft.shiftType}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, shiftType: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    disabled={!canManage || dayEditorDraft.type !== SHIFT_TYPES.WORK}
                  >
                    {SHIFT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {dayEditorDraft.type === SHIFT_TYPES.WORK && dayEditorDraft.shiftType === 'custom' ? (
                  <label className="sm:col-span-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                    Ετικέτα Προσαρμοσμένης Βάρδιας
                    <input
                      value={dayEditorDraft.customLabel}
                      onChange={(event) =>
                        setDayEditorDraft((prev) => ({ ...prev, customLabel: event.target.value }))
                      }
                      className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                      placeholder="π.χ. Εκπαίδευση"
                      disabled={!canManage}
                      required
                    />
                  </label>
                ) : null}

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Ώρα Έναρξης
                  <input
                    type="time"
                    value={dayEditorDraft.startTime}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                    disabled={!canManage}
                  />
                </label>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Ώρα Λήξης
                  <input
                    type="time"
                    value={dayEditorDraft.endTime}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                    disabled={!canManage}
                  />
                </label>

                <label className="sm:col-span-2 inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/50 px-3 py-2 text-xs text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(dayEditorDraft.isManualOverride)}
                    onChange={(event) =>
                      setDayEditorDraft((prev) => ({ ...prev, isManualOverride: event.target.checked }))
                    }
                    disabled={!canManage}
                  />
                  Διατήρηση ως manual override
                </label>

                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/50 px-3 py-2 text-xs text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(dayEditorDraft.isHoliday)}
                    onChange={(event) =>
                      setDayEditorDraft((prev) => ({
                        ...prev,
                        isHoliday: event.target.checked,
                        isSpecialDay: event.target.checked ? true : prev.isSpecialDay,
                      }))
                    }
                    disabled={!canManage}
                  />
                  Αργία
                </label>

                <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/50 px-3 py-2 text-xs text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(dayEditorDraft.isSpecialDay)}
                    onChange={(event) =>
                      setDayEditorDraft((prev) => ({ ...prev, isSpecialDay: event.target.checked }))
                    }
                    disabled={!canManage}
                  />
                  Ειδικό Ωράριο
                </label>

                {dayEditorDraft.isHoliday || dayEditorDraft.isSpecialDay ? (
                  <label className="sm:col-span-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                    Περιγραφή ειδικής ημέρας
                    <input
                      value={dayEditorDraft.specialDayLabel}
                      onChange={(event) =>
                        setDayEditorDraft((prev) => ({ ...prev, specialDayLabel: event.target.value }))
                      }
                      className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                      placeholder="π.χ. Ειδικό Ωράριο 08:00-20:00"
                      disabled={!canManage}
                    />
                  </label>
                ) : null}

                <label className="sm:col-span-2 text-xs font-medium text-slate-800 dark:text-slate-200">
                  Σημειώσεις
                  <input
                    value={dayEditorDraft.notes}
                    onChange={(event) => setDayEditorDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    placeholder="Προαιρετικό"
                    disabled={!canManage}
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canManage || isEditorSaving || isSaving || !dayEditorDraft.employeeId || !dayEditorDraft.date}
                  className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Save size={13} />
                  Αποθήκευση Βάρδιας
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}


