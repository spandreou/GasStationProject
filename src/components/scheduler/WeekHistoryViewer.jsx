import { History } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { groupAndSortShiftsByDay } from '../../utils/scheduleUtils';
import { formatDateGreek } from '../../utils/time';

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

export default function WeekHistoryViewer({ isAdmin, weekHistory = [], employees = [] }) {
  const [selectedEntryId, setSelectedEntryId] = useState('');

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
    if (!selectedEntryId) return sortedHistory[0];
    return sortedHistory.find((entry) => entry.id === selectedEntryId) || sortedHistory[0];
  }, [selectedEntryId, sortedHistory]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const groupedShifts = useMemo(
    () => groupAndSortShiftsByDay(selectedEntry?.shifts || []),
    [selectedEntry],
  );

  if (!isAdmin) return null;

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <History size={17} className="text-brand-700 dark:text-cyan-300" />
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ιστορικό Εβδομάδων</h2>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.2fr,1fr]">
        <div className="space-y-2">
          {sortedHistory.length ? (
            sortedHistory.map((entry) => {
              const isActive = entry.id === selectedEntry?.id;
              const shiftCount = entry.shiftCount ?? entry.metadata?.totalShifts ?? (entry.shifts || []).length;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedEntryId(entry.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                    isActive
                      ? 'border-brand-300 bg-brand-50/80 dark:border-cyan-300/60 dark:bg-cyan-500/20'
                      : 'border-slate-300/70 bg-white/45 hover:bg-white/70 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:hover:bg-slate-900/65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {entry.weekStart} - {entry.weekEnd}
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
            <p className="rounded-lg border border-slate-300/60 bg-white/40 p-3 text-xs text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-300">
              Δεν υπάρχουν αποθηκευμένα snapshots εβδομάδων.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45">
          {selectedEntry ? (
            <div className="space-y-2">
              <div className="border-b border-slate-300/70 pb-2 dark:border-cyan-300/30">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Snapshot: {selectedEntry.weekStart} - {selectedEntry.weekEnd}
                </p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">
                  {formatSavedAt(selectedEntry.savedAt || selectedEntry.createdAt)} •{' '}
                  {sourceLabel(selectedEntry.source || selectedEntry.metadata?.saveAction)}
                </p>
              </div>

              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
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
            <p className="text-xs text-slate-700 dark:text-slate-300">Επίλεξε snapshot για προεπισκόπηση.</p>
          )}
        </div>
      </div>
    </section>
  );
}
