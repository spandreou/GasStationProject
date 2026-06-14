import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { groupAndSortShiftsByDay } from '../../utils/scheduleUtils';
import { formatDateGreek } from '../../utils/time';
import StateNotice from '../feedback/StateNotice';

const HISTORY_WINDOW_SIZE = 7;

function formatSavedAt(value) {
  if (typeof value?.toDate === 'function') {
    return new Intl.DateTimeFormat('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value.toDate());
  }
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  }
  return '-';
}

function sourceLabel(source) {
  switch (source) {
    case 'manual_save_button':
      return 'Αποθήκευση';
    case 'manual_save':
      return 'Auto Save';
    case 'magic_wand':
      return 'Magic Wand';
    case 'finalize':
      return 'Οριστικοποίηση';
    case 'template_load':
      return 'Template';
    case 'history_load':
      return 'History Load';
    default:
      return source || 'manual';
  }
}

export default function WeekHistoryViewer({ isAdmin, weekHistory = [], employees = [], embedded = false }) {
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [historyStartIndex, setHistoryStartIndex] = useState(0);

  const sortedHistory = useMemo(
    () =>
      [...weekHistory].sort((a, b) => {
        const aTime = typeof a?.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
        const bTime = typeof b?.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      }),
    [weekHistory],
  );

  const selectedEntry = useMemo(() => {
    if (!sortedHistory.length) return null;
    if (!selectedEntryId) return sortedHistory[historyStartIndex] || sortedHistory[0];
    return sortedHistory.find((entry) => entry.id === selectedEntryId) || sortedHistory[historyStartIndex] || sortedHistory[0];
  }, [historyStartIndex, selectedEntryId, sortedHistory]);

  const maxHistoryStartIndex = useMemo(() => {
    if (!sortedHistory.length) return 0;
    return Math.floor((sortedHistory.length - 1) / HISTORY_WINDOW_SIZE) * HISTORY_WINDOW_SIZE;
  }, [sortedHistory]);

  const visibleHistory = useMemo(
    () => sortedHistory.slice(historyStartIndex, historyStartIndex + HISTORY_WINDOW_SIZE),
    [historyStartIndex, sortedHistory],
  );

  const canGoToMoreRecent = historyStartIndex > 0;
  const canGoToOlder = historyStartIndex + HISTORY_WINDOW_SIZE < sortedHistory.length;

  useEffect(() => {
    if (!sortedHistory.length) {
      if (historyStartIndex !== 0) setHistoryStartIndex(0);
      if (selectedEntryId) setSelectedEntryId('');
      return;
    }

    if (historyStartIndex > maxHistoryStartIndex) {
      setHistoryStartIndex(maxHistoryStartIndex);
      return;
    }

    const visibleIds = new Set(visibleHistory.map((entry) => entry.id));
    if (!selectedEntryId || !visibleIds.has(selectedEntryId)) {
      const nextSelectedId = visibleHistory[0]?.id || '';
      if (nextSelectedId && nextSelectedId !== selectedEntryId) {
        setSelectedEntryId(nextSelectedId);
      }
    }
  }, [historyStartIndex, maxHistoryStartIndex, selectedEntryId, sortedHistory, visibleHistory]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const groupedShifts = useMemo(
    () => groupAndSortShiftsByDay(selectedEntry?.shifts || []),
    [selectedEntry],
  );

  if (!isAdmin) return null;

  return (
    <section className={embedded ? 'space-y-3' : 'glass-panel rounded-2xl p-4 sm:p-5'}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History size={17} className="text-brand-700 dark:text-cyan-300" />
          <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ιστορικό Εβδομάδων</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHistoryStartIndex((prev) => Math.max(0, prev - HISTORY_WINDOW_SIZE))}
            disabled={!canGoToMoreRecent}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/70 bg-white/55 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-200 dark:hover:bg-slate-900/65"
            aria-label="Πιο πρόσφατα"
            title="Πιο πρόσφατα"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setHistoryStartIndex((prev) => Math.min(maxHistoryStartIndex, prev + HISTORY_WINDOW_SIZE))}
            disabled={!canGoToOlder}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/70 bg-white/55 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-200 dark:hover:bg-slate-900/65"
            aria-label="Πιο παλιά"
            title="Πιο παλιά"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr,1fr]">
        <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
          {sortedHistory.length ? (
            visibleHistory.map((entry) => {
              const isActive = entry.id === selectedEntry?.id;
              const shiftCount = entry.shiftCount ?? entry.metadata?.totalShifts ?? (entry.shifts || []).length;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`w-full rounded-xl border px-3 py-1.5 text-left transition ${
                    isActive
                      ? 'border-brand-300 bg-brand-50/80 dark:border-cyan-300/60 dark:bg-cyan-500/20'
                      : 'border-slate-300/70 bg-white/45 hover:bg-white/70 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:hover:bg-slate-900/65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {formatDateGreek(entry.weekStart)} - {formatDateGreek(entry.weekEnd)}
                    </p>
                    <span className="rounded-full border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-700 dark:border-cyan-300/35 dark:text-slate-200">
                      {sourceLabel(entry.source || entry.metadata?.saveAction)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                    Αποθήκευση: {formatSavedAt(entry.savedAt || entry.createdAt)}
                  </p>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300">
                    Από: {entry.savedBy || entry.createdBy || '-'} • Βάρδιες: {shiftCount}
                  </p>
              </button>
            );
          })
          ) : (
            <StateNotice
              state="empty"
              compact
              title="Δεν υπάρχουν snapshots"
              message="Δεν έχει αποθηκευτεί ακόμη εβδομαδιαίο ιστορικό."
            />
          )}
        </div>

        <div className="rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45">
          {selectedEntry ? (
            <div className="space-y-2">
              <div className="border-b border-slate-300/70 pb-2 dark:border-cyan-300/30">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Snapshot: {formatDateGreek(selectedEntry.weekStart)} - {formatDateGreek(selectedEntry.weekEnd)}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">
                  {formatSavedAt(selectedEntry.savedAt || selectedEntry.createdAt)} •{' '}
                  {sourceLabel(selectedEntry.source || selectedEntry.metadata?.saveAction)}
                </p>
              </div>

              <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1">
                {Object.entries(groupedShifts).map(([date, dayShifts]) => (
                  <article key={date} className="rounded-lg border border-slate-300/60 bg-white/60 p-2 dark:border-cyan-300/30 dark:bg-slate-900/40">
                    <p className="mb-1 text-xs font-semibold text-slate-900 dark:text-white">{formatDateGreek(date)}</p>
                    <div className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                      {dayShifts.map((shift, index) => {
                        const employeeName =
                          shift.employeeName ||
                          employeeById.get(shift.employeeId)?.fullName ||
                          'Άγνωστος';
                        const type = shift.type || SHIFT_TYPES.WORK;
                        const manualBadge = shift.isManualOverride ? ' • manual' : '';
                        return (
                          <p key={`${date}_${shift.employeeId}_${shift.startTime}_${index}`}>
                            {employeeName} • {getShiftTypeLabel(type)} • {shift.startTime}-{shift.endTime}
                            {manualBadge}
                          </p>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <StateNotice
              state="info"
              compact
              title="Επίλεξε snapshot"
              message="Επίλεξε μία εγγραφή από τη λίστα για να δεις λεπτομέρειες βαρδιών."
            />
          )}
        </div>
      </div>
    </section>
  );
}
