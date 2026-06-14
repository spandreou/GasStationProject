import { useDroppable } from '@dnd-kit/core';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Lock, Pencil, Plus, RefreshCw, Save, Trash2, UserRound, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SHIFT_TYPE_OPTIONS, WEEKDAY_LABELS } from '../../data/constants';
import { SHIFT_TYPES } from '../../utils/analytics';
import {
  getDurationLabel,
  groupAndSortShiftsByDay,
  inferShiftTypeFromTimes,
} from '../../utils/scheduleUtils';
import { hasTimeOverlap } from '../../utils/overlap';
import { formatDateGreek, getIsoDate, normalizeTimeLabel, parseGreekDateInputToIso, timeToMinutes } from '../../utils/time';
import ConfirmDialog from '../feedback/ConfirmDialog';
import StateNotice from '../feedback/StateNotice';
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

const SHIFT_TYPE_TIME_MAP = {
  morning: { startTime: '06:00', endTime: '14:00' },
  intermediate: { startTime: '09:00', endTime: '17:00' },
  evening: { startTime: '14:00', endTime: '22:00' },
};

function normalizeScheduleRole(value) {
  const token = `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (token.includes('core1') || token.includes('core 1') || token.includes('core_a')) return 'core1';
  if (token.includes('core2') || token.includes('core 2') || token.includes('core_b')) return 'core2';
  if (token.includes('intermediate') || token.includes('coverage') || token.includes('ενδιαμεσ') || token.includes('καλυψ')) {
    return 'intermediate';
  }
  if (token.includes('core') || token.includes('βασ') || token.includes('σταθερ')) return 'core';
  if (token.includes('custom') || token.includes('general')) return 'custom';
  return '';
}

const DENSITY_CLASSES = {
  compact: {
    dayBox: 'p-2',
    dayHeader: 'px-2.5 py-2',
    dayTitle: 'text-sm',
    dayDate: 'text-[11px]',
    dayGap: 'space-y-1',
    helperText: 'text-[11px]',
    weekGrid: 'gap-2 2xl:gap-2.5',
    weekBlock: 'p-1.5 sm:p-2',
    placeholderHeader: 'px-2.5 py-2',
  },
  comfortable: {
    dayBox: 'p-2.5',
    dayHeader: 'px-3 py-2.5',
    dayTitle: 'text-[15px]',
    dayDate: 'text-xs',
    dayGap: 'space-y-1.5',
    helperText: 'text-[12px]',
    weekGrid: 'gap-2 2xl:gap-2.5',
    weekBlock: 'p-2 sm:p-3',
    placeholderHeader: 'px-3 py-2.5',
  },
  roomy: {
    dayBox: 'p-3',
    dayHeader: 'px-3 py-2.5',
    dayTitle: 'text-base',
    dayDate: 'text-xs',
    dayGap: 'space-y-2',
    helperText: 'text-[12px]',
    weekGrid: 'gap-2.5 2xl:gap-3',
    weekBlock: 'p-2.5 sm:p-3',
    placeholderHeader: 'px-3 py-2.5',
  },
};

function applyShiftTypeTimes(draft, nextShiftType) {
  const nextTimes = SHIFT_TYPE_TIME_MAP[nextShiftType];
  if (!nextTimes) {
    return { ...draft, shiftType: nextShiftType };
  }
  return {
    ...draft,
    shiftType: nextShiftType,
    startTime: nextTimes.startTime,
    endTime: nextTimes.endTime,
  };
}

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

function getMondayFirstIndex(dateValue) {
  const day = new Date(`${dateValue}T00:00:00`).getDay();
  return day === 0 ? 6 : day - 1;
}

function addDaysIso(dateValue, daysToAdd) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return getIsoDate(date);
}

function buildMonthWeekRows(monthDays = []) {
  if (!monthDays.length) return [];

  const monthDaySet = new Set(monthDays);
  const firstWeekStart = addDaysIso(monthDays[0], -getMondayFirstIndex(monthDays[0]));
  const lastMonthDay = monthDays[monthDays.length - 1];
  const rows = [];
  let cursor = firstWeekStart;
  let guard = 0;

  while (cursor <= lastMonthDay && guard < 8) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDaysIso(cursor, index);
      return {
        date,
        isInMonth: monthDaySet.has(date),
      };
    });
    const realDays = days.filter((item) => item.isInMonth);

    if (realDays.length) {
      rows.push({
        key: cursor,
        startDate: days[0].date,
        endDate: days[6].date,
        days,
      });
    }

    cursor = addDaysIso(cursor, 7);
    guard += 1;
  }

  return rows;
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

function DayStatusChip({ tone = 'neutral', icon: Icon = null, children }) {
  const toneClasses = {
    neutral: 'border-slate-300/70 bg-white/60 text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/55 dark:text-slate-200',
    info: 'border-sky-300/70 bg-sky-50/75 text-sky-800 dark:border-sky-300/45 dark:bg-sky-500/15 dark:text-sky-100',
    warning: 'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-300/45 dark:bg-amber-500/15 dark:text-amber-100',
    danger: 'border-rose-300/70 bg-rose-50/80 text-rose-900 dark:border-rose-300/45 dark:bg-rose-500/15 dark:text-rose-100',
    lock: 'border-slate-400/60 bg-slate-100/75 text-slate-800 dark:border-slate-400/45 dark:bg-slate-900/70 dark:text-slate-100',
    accent: 'border-fuchsia-300/70 bg-fuchsia-50/80 text-fuchsia-900 dark:border-fuchsia-300/45 dark:bg-fuchsia-500/15 dark:text-fuchsia-100',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses[tone] || toneClasses.neutral}`}
    >
      {Icon ? <Icon size={11} /> : null}
      {children}
    </span>
  );
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
  isWeekLocked = false,
  isActive = false,
  getEmployeeById,
  getSundayViolationMessage,
  conflictShiftIds,
  onDeleteShift,
  onToggleManualOverride,
  onDeleteShiftTemplate,
  onOpenDayEditor,
  onClearDay,
  density = 'comfortable',
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-box-${day}`,
    data: { type: 'day-box', day: { date: day } },
    disabled: !canManage,
  });

  const hasShifts = dayShifts.length > 0;
  const hasTemplates = dayTemplates.length > 0;
  const isEmptyDay = !hasShifts && !hasTemplates;
  const specialInfo = getDaySpecialInfo(dayShifts, specialDayConfig);
  const isHoliday = Boolean(specialDayConfig?.isHoliday || dayShifts.some((item) => item.isHoliday));
  const isSpecialDay = Boolean(specialDayConfig?.isSpecialDay || dayShifts.some((item) => item.isSpecialDay));
  const conflictCount = dayShifts.filter((shift) => conflictShiftIds.has(shift.id)).length;
  const warningCount = dayShifts.reduce(
    (total, shift) => (getSundayViolationMessage(shift.id) ? total + 1 : total),
    0,
  );
  const densityClasses = DENSITY_CLASSES[density] || DENSITY_CLASSES.comfortable;
  const stateClasses = isOver && canManage
    ? 'border-brand-400 bg-brand-50/75 shadow-brand-500/20 dark:border-cyan-300 dark:bg-cyan-500/12'
    : conflictCount > 0 || warningCount > 0
      ? 'border-amber-300/70 bg-amber-50/50 dark:border-amber-300/45 dark:bg-amber-500/8'
      : isEmptyDay
        ? 'border-dashed border-slate-300/80 bg-white/35 dark:border-cyan-300/25 dark:bg-slate-900/28'
        : 'border-white/50 bg-white/45 dark:border-cyan-300/30 dark:bg-slate-900/40';

  const interactionClasses = canManage
    ? 'hover:-translate-y-[1px] hover:border-sky-300/70 hover:shadow-md hover:shadow-slate-900/10 focus-within:ring-2 focus-within:ring-brand-300/60 dark:hover:border-cyan-300/55 dark:hover:shadow-cyan-500/10 dark:focus-within:ring-cyan-300/45'
    : '';
  const mobileActiveClasses = isActive ? 'ring-2 ring-brand-300/65 dark:ring-cyan-300/55 md:ring-0' : '';

  return (
    <section
      ref={setNodeRef}
      data-testid="day-box"
      data-date={day}
      data-day-anchor={day}
      onDragOver={(event) => event.preventDefault()}
      className={`group relative overflow-hidden rounded-lg border shadow-sm backdrop-blur-sm transition-all duration-200 ${densityClasses.dayBox} ${stateClasses} ${interactionClasses} ${mobileActiveClasses}`}
    >
      <header className={`relative mb-2 rounded-md border border-slate-300/60 bg-slate-900/80 text-xs text-white dark:border-cyan-300/25 dark:bg-slate-950/85 dark:text-cyan-100 ${densityClasses.dayHeader}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`font-bold leading-snug ${densityClasses.dayTitle}`}>{title}</p>
            <p className={`font-medium leading-snug text-white/85 dark:text-cyan-100/85 ${densityClasses.dayDate}`}>{subtitle}</p>
          </div>
          {canManage ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenDayEditor?.(day, title, subtitle)}
                className="rounded p-0.5 text-white/85 transition hover:bg-sky-500/20 hover:text-sky-100"
                title="Edit day"
                aria-label="Edit day"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => onClearDay(day)}
                className="rounded p-0.5 text-white/85 transition hover:bg-red-500/20 hover:text-red-200"
                title="Clear day"
                aria-label="Clear day"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {isWeekLocked ? (
            <DayStatusChip tone="lock" icon={Lock}>
              Locked week
            </DayStatusChip>
          ) : null}
          {isHoliday ? <DayStatusChip tone="warning">Holiday</DayStatusChip> : null}
          {isSpecialDay && !isHoliday ? <DayStatusChip tone="info">Special day</DayStatusChip> : null}
          {conflictCount > 0 ? (
            <DayStatusChip tone="danger" icon={AlertCircle}>
              Conflict: {conflictCount}
            </DayStatusChip>
          ) : null}
          {warningCount > 0 ? <DayStatusChip tone="warning">Warnings: {warningCount}</DayStatusChip> : null}
        </div>
      </header>

      <div className={densityClasses.dayGap}>
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
                density={density}
              />
              {sundayWarning ? (
                <p className={`rounded border border-amber-300/60 bg-amber-50/70 px-1.5 py-0.5 text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/10 dark:text-amber-200 ${densityClasses.helperText}`}>
                  {sundayWarning}
                </p>
              ) : null}
            </div>
          );
        })}

        {isEmptyDay ? (
          <div className={`rounded-md border border-dashed border-slate-300/80 bg-white/45 px-2.5 py-2 text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-slate-300 ${densityClasses.helperText}`}>
            <p className="font-semibold text-slate-800 dark:text-slate-100">No shifts</p>
            <p className="mt-0.5">
              {isWeekLocked
                ? 'This week is locked. You can only view this day.'
                : canManage
                  ? 'Drop a card here or use day edit to add a shift.'
                  : 'Read-only mode: changes are disabled.'}
            </p>
            {canManage && !isWeekLocked ? (
              <button
                type="button"
                onClick={() => onOpenDayEditor?.(day, title, subtitle)}
                className={`mt-1 inline-flex items-center gap-1 rounded-md border border-slate-300/80 bg-white/70 px-1.5 py-0.5 font-semibold text-slate-800 transition hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/55 dark:text-slate-100 dark:hover:bg-slate-900/75 ${densityClasses.helperText}`}
              >
                <Plus size={10} />
                Add shift
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {(conflictCount > 0 || warningCount > 0) ? (
        <footer className={`mt-1.5 flex flex-wrap items-center gap-1 border-t border-slate-300/50 pt-1 text-slate-700 dark:border-cyan-300/20 dark:text-slate-300 ${densityClasses.helperText}`}>
          {conflictCount > 0 ? <span className="font-semibold text-red-700 dark:text-red-300">{conflictCount} conflicts</span> : null}
          {warningCount > 0 ? <span className="font-semibold text-amber-800 dark:text-amber-200">{warningCount} warnings</span> : null}
        </footer>
      ) : null}
      {specialInfo ? (
        <p className={`mt-1 truncate text-slate-600 dark:text-slate-400 ${densityClasses.helperText}`} title={specialInfo}>
          {isHoliday ? 'This day is marked as a holiday.' : `Day note: ${specialInfo}`}
        </p>
      ) : null}
      {isOver && canManage ? (
        <p className={`mt-1 font-semibold text-brand-700 dark:text-cyan-200 ${densityClasses.helperText}`}>Drop here</p>
      ) : null}
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
        data-testid="schedule-mode-select"
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
  onPrevWeek,
  onCurrentWeek,
  onNextWeek,
  onJumpToWeekDate,
  onCreateShift,
  onUpdateShift,
  onDeleteShift,
  onToggleManualOverride,
  onDeleteShiftTemplate,
  onClearDayShifts,
  canManage,
  isWeekLocked = false,
  isSaving = false,
  density = 'comfortable',
}) {
  const densityClasses = DENSITY_CLASSES[density] || DENSITY_CLASSES.comfortable;
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const gridSectionRef = useRef(null);
  const scrollRef = useRef(null);
  const dayEditorFormRef = useRef(null);
  const dayEditorEmployeeSelectRef = useRef(null);
  const dayEditorDialogRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCreateFormHighlighted, setIsCreateFormHighlighted] = useState(false);

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
  const monthlyRoleSummary = useMemo(() => {
    const core1 = activeEmployees.find((employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core1');
    const core2 = activeEmployees.find((employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core2');
    const intermediates = activeEmployees.filter(
      (employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'intermediate',
    );
    const hasExplicitRoles = Boolean(core1 || core2 || intermediates.length);
    return { core1, core2, intermediates, hasExplicitRoles };
  }, [activeEmployees]);
  const visibleDayOptions = scheduleMode === 'month' ? monthDays : weekDays;
  const monthWeekRows = useMemo(() => buildMonthWeekRows(monthDays), [monthDays]);

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
  const [dayEditorValidationMessage, setDayEditorValidationMessage] = useState('');
  const [pendingClearDay, setPendingClearDay] = useState('');
  const [weekJumpInput, setWeekJumpInput] = useState('');

  const dayEditorShifts = useMemo(() => {
    if (!dayEditor?.date) return [];
    return grouped[dayEditor.date] || [];
  }, [dayEditor?.date, grouped]);

  useEffect(() => {
    if (!dayEditorValidationMessage) return;
    const timeoutId = setTimeout(() => setDayEditorValidationMessage(''), 4200);
    return () => clearTimeout(timeoutId);
  }, [dayEditorValidationMessage]);

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

  useEffect(() => {
    if (scheduleMode !== 'week') return;
    setWeekJumpInput(formatDateGreek(weekDays?.[0] || ''));
  }, [scheduleMode, weekDays]);

  const openDayEditor = useCallback((date, title, subtitle, shift = null) => {
    if (!canManage) return;
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
  }, [canManage]);

  const closeDayEditor = useCallback(() => {
    setDayEditor({
      open: false,
      date: '',
      title: '',
      subtitle: '',
      editingShiftId: '',
    });
    setDayEditorValidationMessage('');
    setDayEditorDraft(
      buildNewDraft({
        date: visibleDayOptions[0] || '',
        employeeId: '',
      }),
    );
  }, [visibleDayOptions]);

  function setEditorToCreateMode({ focusForm = false } = {}) {
    setDayEditor((prev) => ({ ...prev, editingShiftId: '' }));
    setDayEditorValidationMessage('');
    setDayEditorDraft(
      buildNewDraft({
        date: dayEditor.date || visibleDayOptions[0] || '',
        employeeId: '',
      }),
    );

    if (focusForm) {
      requestAnimationFrame(() => {
        dayEditorFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        dayEditorEmployeeSelectRef.current?.focus();
        setIsCreateFormHighlighted(true);
      });
    }
  }

  useEffect(() => {
    if (!isCreateFormHighlighted) return;
    const timeoutId = setTimeout(() => setIsCreateFormHighlighted(false), 900);
    return () => clearTimeout(timeoutId);
  }, [isCreateFormHighlighted]);

  function setEditorToExistingShift(shift) {
    if (!shift) return;
    setDayEditor((prev) => ({ ...prev, editingShiftId: shift.id }));
    setDayEditorValidationMessage('');
    setDayEditorDraft(buildDraftFromShift(shift));
  }

  useEffect(() => {
    if (!dayEditor.open) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      dayEditorDialogRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [dayEditor.open]);

  useEffect(() => {
    if (!dayEditor.open) return;
    const handleEscapeClose = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      event.preventDefault();
      closeDayEditor();
    };
    window.addEventListener('keydown', handleEscapeClose, true);
    document.addEventListener('keydown', handleEscapeClose, true);
    return () => {
      window.removeEventListener('keydown', handleEscapeClose, true);
      document.removeEventListener('keydown', handleEscapeClose, true);
    };
  }, [closeDayEditor, dayEditor.open]);

  async function handleDayEditorSave(event) {
    event.preventDefault();
    if (!canManage) return;

    if (!dayEditorDraft.employeeId || !dayEditorDraft.date) {
      setDayEditorValidationMessage('Συμπλήρωσε υπάλληλο και ημερομηνία.');
      return;
    }

    if (timeToMinutes(dayEditorDraft.startTime) >= timeToMinutes(dayEditorDraft.endTime)) {
      setDayEditorValidationMessage('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
      return;
    }

    if (dayEditorDraft.type === SHIFT_TYPES.WORK && dayEditorDraft.shiftType === 'custom' && !dayEditorDraft.customLabel?.trim()) {
      setDayEditorValidationMessage('Δώσε ετικέτα για την προσαρμοσμένη βάρδια.');
      return;
    }

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

    if (payload.type === SHIFT_TYPES.WORK) {
      const conflict = hasTimeOverlap(shifts, {
        id: dayEditor.editingShiftId || undefined,
        employeeId: payload.employeeId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
      });
      if (conflict) {
        setDayEditorValidationMessage('Υπάρχει επικάλυψη βάρδιας για τον ίδιο υπάλληλο. Διάλεξε άλλο υπάλληλο ή ώρες.');
        return;
      }
    }

    setIsEditorSaving(true);
    try {
      if (dayEditor.editingShiftId) {
        const targetShiftId = dayEditor.editingShiftId;
        const updated = await onUpdateShift?.({
          shiftId: targetShiftId,
          ...payload,
        });
        if (updated) {
          setDayEditorValidationMessage('');
          closeDayEditor();
        } else {
          setDayEditorValidationMessage('Η ενημέρωση βάρδιας απέτυχε. Έλεγξε τα στοιχεία και δοκίμασε ξανά.');
        }
        return;
      }

      const created = await onCreateShift?.(payload);
      if (created) {
        setDayEditorValidationMessage('');
        closeDayEditor();
      } else {
        setDayEditorValidationMessage('Η βάρδια δεν αποθηκεύτηκε. Δοκίμασε ξανά.');
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
    setPendingClearDay(date);
  }, []);

  const confirmClearDay = useCallback(async () => {
    if (!pendingClearDay) return;
    await onClearDayShifts(pendingClearDay);
    setPendingClearDay('');
  }, [onClearDayShifts, pendingClearDay]);

  const commitWeekJump = useCallback((rawValue) => {
    const isoDate = parseGreekDateInputToIso(rawValue);
    if (!isoDate) {
      setWeekJumpInput(formatDateGreek(weekDays?.[0] || ''));
      return;
    }
    onJumpToWeekDate?.(isoDate);
    setWeekJumpInput(formatDateGreek(isoDate));
  }, [onJumpToWeekDate, weekDays]);

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
    <section
      id="weekly-grid-export"
      ref={gridSectionRef}
      data-density={density}
      className="glass-panel relative w-full min-w-0 overflow-hidden rounded-2xl p-3 sm:p-4 lg:p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
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
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-grid grid-cols-3 gap-1 rounded-lg border border-slate-300/70 bg-white/45 p-1 dark:border-cyan-300/35 dark:bg-slate-900/45">
                <button
                  type="button"
                  onClick={onPrevWeek}
                  className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800/70"
                >
                  <ChevronLeft size={14} />
                  Προηγ.
                </button>
                <button
                  type="button"
                  onClick={onCurrentWeek}
                  className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800/70"
                >
                  <RefreshCw size={14} />
                  Τρέχουσα
                </button>
                <button
                  type="button"
                  onClick={onNextWeek}
                  className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800/70"
                >
                  Επόμ.
                  <ChevronRight size={14} />
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/yyyy"
                value={weekJumpInput}
                onChange={(event) => setWeekJumpInput(event.target.value)}
                onBlur={(event) => commitWeekJump(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitWeekJump(event.currentTarget.value);
                  }
                }}
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
              />
              {canManage ? (
                <>
                  <select
                    className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    value={selectedHistoryWeekId}
                    onChange={(event) => onSelectHistoryWeek?.(event.target.value)}
                  >
                    <option value="">Ιστορικό εβδομάδων</option>
                    {weekHistory.map((item) => (
                      <option key={item.id} value={item.weekId}>
                        {formatDateGreek(item.weekStart)} ({getSnapshotSourceLabel(item.source)})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onLoadSelectedHistoryWeek}
                    disabled={!selectedHistoryWeekId}
                    className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
                  >
                    Φόρτωση Εβδομάδας
                  </button>
                </>
              ) : null}
            </div>

            {canManage ? (
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
            ) : null}
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

          <div className={`w-full min-w-0 rounded-lg border border-white/45 bg-white/25 dark:border-cyan-300/20 dark:bg-slate-900/30 ${densityClasses.weekBlock}`}>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className={`flex overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth md:grid md:w-full md:min-w-0 md:grid-cols-2 md:overflow-visible md:snap-none lg:grid-cols-4 xl:grid-cols-7 ${densityClasses.weekGrid}`}
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
                      isWeekLocked={isWeekLocked}
                      isActive={index === activeIndex}
                      getEmployeeById={getEmployeeById}
                      getSundayViolationMessage={getSundayViolationMessage}
                      conflictShiftIds={conflictShiftIds}
                      onDeleteShift={onDeleteShift}
                      onToggleManualOverride={onToggleManualOverride}
                      onDeleteShiftTemplate={onDeleteShiftTemplate}
                      onOpenDayEditor={openDayEditor}
                      onClearDay={clearDayWithConfirm}
                      density={density}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Μήνας
              <select
                value={selectedMonth}
                data-testid="monthly-month-select"
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
                data-testid="monthly-year-select"
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

            {canManage ? (
              <button
                type="button"
                onClick={onGenerateMonthlySchedule}
                data-testid="generate-monthly-schedule"
                className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600"
              >
                Αυτόματη δημιουργία μηνιαίου προγράμματος
              </button>
            ) : null}
          </div>

          {canManage ? (
            <div
              data-testid="monthly-role-summary"
              className="mb-4 rounded-xl border border-slate-300/70 bg-white/45 px-3 py-2.5 text-xs text-slate-900 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-100"
            >
            <p className="mb-2 font-bold">Ρόλοι από κανόνες εργαζομένων</p>
            {monthlyRoleSummary.hasExplicitRoles ? (
              <div className="grid gap-2 md:grid-cols-3">
                <div
                  data-testid="monthly-role-core1"
                  className="rounded-lg border border-slate-300/60 bg-white/50 px-2.5 py-2 dark:border-cyan-300/20 dark:bg-slate-950/30"
                >
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Core 1</p>
                  <p className="mt-0.5 font-bold">{monthlyRoleSummary.core1?.fullName || 'Δεν έχει οριστεί'}</p>
                </div>
                <div
                  data-testid="monthly-role-core2"
                  className="rounded-lg border border-slate-300/60 bg-white/50 px-2.5 py-2 dark:border-cyan-300/20 dark:bg-slate-950/30"
                >
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Core 2</p>
                  <p className="mt-0.5 font-bold">{monthlyRoleSummary.core2?.fullName || 'Δεν έχει οριστεί'}</p>
                </div>
                <div
                  data-testid="monthly-role-intermediates"
                  className="rounded-lg border border-slate-300/60 bg-white/50 px-2.5 py-2 dark:border-cyan-300/20 dark:bg-slate-950/30"
                >
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Intermediate / Coverage</p>
                  {monthlyRoleSummary.intermediates.length ? (
                    <ul className="mt-0.5 space-y-0.5 font-bold">
                      {monthlyRoleSummary.intermediates.map((employee) => (
                        <li key={employee.id}>{employee.fullName}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-0.5 font-bold">Δεν έχει οριστεί</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Δεν έχουν οριστεί ρόλοι ανά εργαζόμενο. Ο generator θα χρησιμοποιήσει legacy/fallback σειρά.
              </p>
            )}
            </div>
          ) : null}

          <div className="space-y-4">
            {monthWeekRows.map((weekRow) => (
              <section
                key={weekRow.key}
                className={`rounded-xl border border-white/45 bg-white/25 dark:border-cyan-300/20 dark:bg-slate-900/30 ${densityClasses.weekBlock}`}
              >
                <header className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/50 pb-2 dark:border-cyan-300/20">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Εβδομάδα {formatDateGreek(weekRow.startDate)} - {formatDateGreek(weekRow.endDate)}
                  </h3>
                </header>
                <div className={`flex overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth md:grid md:w-full md:min-w-0 md:grid-cols-2 md:overflow-visible md:snap-none lg:grid-cols-4 xl:grid-cols-7 ${densityClasses.weekGrid}`}>
                  {weekRow.days.map(({ date, isInMonth }, index) => {
                    if (!isInMonth) {
                      return (
                        <div key={`placeholder-${weekRow.key}-${index}`} className="min-w-full shrink-0 snap-start md:min-w-0 md:snap-none">
                          <div className={`h-full min-h-[120px] rounded-lg border border-dashed border-slate-300/45 bg-white/20 opacity-45 dark:border-cyan-300/20 dark:bg-slate-900/25 ${densityClasses.dayBox}`} aria-hidden="true">
                            <div className={`rounded-md border border-slate-300/40 bg-slate-900/35 text-xs text-white/70 dark:border-cyan-300/15 dark:bg-slate-950/45 ${densityClasses.placeholderHeader}`}>
                              <p className={`font-bold leading-snug ${densityClasses.dayTitle}`}>{WEEKDAY_LABELS[index]}</p>
                              <p className={`font-medium leading-snug ${densityClasses.dayDate}`}>{formatDateGreek(date)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const dayShifts = grouped[date] || [];
                    return (
                      <div key={date} className="min-w-full shrink-0 snap-start md:min-w-0 md:snap-none">
                        <DayBox
                          day={date}
                          title={WEEKDAY_LABELS[index]}
                          subtitle={formatDateGreek(date)}
                          dayShifts={dayShifts}
                          dayTemplates={[]}
                          specialDayConfig={specialDaysByDate?.[date]}
                          canManage={canManage}
                          isWeekLocked={false}
                          getEmployeeById={getEmployeeById}
                          getSundayViolationMessage={getSundayViolationMessage}
                          conflictShiftIds={conflictShiftIds}
                          onDeleteShift={onDeleteShift}
                          onToggleManualOverride={onToggleManualOverride}
                          onDeleteShiftTemplate={onDeleteShiftTemplate}
                          onOpenDayEditor={openDayEditor}
                          onClearDay={clearDayWithConfirm}
                          density={density}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {!monthDays.length ? (
            <p className="rounded-xl border border-slate-300/60 bg-white/45 p-4 text-sm text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-200">
              Δεν βρέθηκαν ημέρες για τον επιλεγμένο μήνα.
            </p>
          ) : null}
        </>
      )}

      {dayEditor.open && typeof document !== 'undefined'
        ? createPortal(
        <div
          ref={dayEditorDialogRef}
          className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/55 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' && event.key !== 'Esc') return;
            event.preventDefault();
            closeDayEditor();
          }}
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

            <div className="grid max-h-[85vh] gap-4 overflow-y-auto p-4 lg:grid-cols-[1.1fr,1.4fr]">
              <aside className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    Βάρδιες ημέρας ({dayEditorShifts.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setEditorToCreateMode({ focusForm: true })}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-brand-600"
                    disabled={!canManage}
                  >
                    <Plus size={12} />
                    Νέα Βάρδια
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

              <form
                ref={dayEditorFormRef}
                onSubmit={handleDayEditorSave}
                className={`grid gap-2 rounded-lg p-1 transition sm:grid-cols-2 ${
                  isCreateFormHighlighted
                    ? 'ring-2 ring-brand-300/70 bg-brand-50/20 dark:ring-cyan-300/45 dark:bg-cyan-500/10'
                    : ''
                }`}
              >
                <h4 className="sm:col-span-2 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                  {dayEditor.editingShiftId ? 'Επεξεργασία Βάρδιας' : 'Νέα Βάρδια'}
                </h4>

                <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Υπάλληλος
                  <select
                    ref={dayEditorEmployeeSelectRef}
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
                        {formatDateGreek(day)}
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
                    onChange={(event) =>
                      setDayEditorDraft((prev) => applyShiftTypeTimes(prev, event.target.value))
                    }
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

                {dayEditorValidationMessage ? (
                  <div className="sm:col-span-2">
                    <StateNotice state="error" compact message={dayEditorValidationMessage} />
                  </div>
                ) : null}

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
        </div>,
        document.body,
      )
        : null}

      <ConfirmDialog
        open={Boolean(pendingClearDay)}
        title="Καθαρισμός ημέρας"
        message={
          pendingClearDay
            ? `Θέλεις να διαγραφούν όλες οι βάρδιες για ${formatDateGreek(pendingClearDay)};`
            : ''
        }
        details="Η ενέργεια αφαιρεί όλες τις βάρδιες της ημέρας."
        tone="danger"
        confirmLabel="Ναι, καθαρισμός"
        onClose={() => setPendingClearDay('')}
        onConfirm={confirmClearDay}
        isConfirming={isSaving}
      />
    </section>
  );
}
