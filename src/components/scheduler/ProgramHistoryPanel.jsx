import { CalendarDays, Download, FileText, History, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import StateNotice from '../feedback/StateNotice';
import WeekHistoryViewer from './WeekHistoryViewer';

function formatTimestamp(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return '-';
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatYearMonth(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return value || '-';
  return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function MonthlyArchiveList({
  archives = [],
  isLoading = false,
  actionLoading = {},
  onRefresh,
  onDownload,
}) {
  const sortedArchives = useMemo(
    () => [...archives].sort((a, b) => String(b.yearMonth || '').localeCompare(String(a.yearMonth || ''))),
    [archives],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">PDF Μηνών</h3>
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Κάθε επιτυχής μηνιαία δημιουργία κρατά ένα PDF snapshot για λήψη.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/70 bg-white/45 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-55 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Ανανέωση
        </button>
      </div>

      {isLoading ? (
        <StateNotice
          state="loading"
          compact
          title="Φόρτωση PDF"
          message="Γίνεται ανάκτηση των αποθηκευμένων μηνιαίων αρχείων."
        />
      ) : null}

      {!isLoading && !sortedArchives.length ? (
        <StateNotice
          state="empty"
          compact
          title="Δεν υπάρχουν PDF μήνα"
          message="Δημιούργησε μηνιαίο πρόγραμμα για να αποθηκευτεί αυτόματα το πρώτο PDF."
        />
      ) : null}

      {!isLoading && sortedArchives.length ? (
        <div className="grid gap-2">
          {sortedArchives.map((archive) => {
            const actionKey = `downloadMonthlyArchive:${archive.yearMonth || archive.id}`;
            const isDownloading = Boolean(actionLoading[actionKey]);
            return (
              <article
                key={archive.id || archive.yearMonth}
                className="grid gap-3 rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="shrink-0 text-brand-700 dark:text-cyan-300" />
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {formatYearMonth(archive.yearMonth)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    {archive.fileName || '-'} • Βάρδιες: {archive.shiftCount || 0}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Ενημερώθηκε: {formatTimestamp(archive.updatedAt || archive.createdAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onDownload?.(archive)}
                  disabled={isDownloading || !archive.storagePath}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300/60 bg-emerald-50/85 px-3 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-55 dark:border-emerald-300/35 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25"
                >
                  {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Λήψη PDF
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ProgramHistoryPanel({
  isAdmin,
  weekHistory = [],
  employees = [],
  monthlyArchives = [],
  isMonthlyLoading = false,
  actionLoading = {},
  onRefreshMonthly,
  onDownloadMonthlyArchive,
}) {
  const [activeTab, setActiveTab] = useState('week');

  if (!isAdmin) return null;

  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-brand-700 dark:text-cyan-300" />
          <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ιστορικό Προγραμμάτων</h2>
        </div>

        <div className="inline-flex w-full rounded-lg border border-slate-300/70 bg-white/45 p-1 text-xs font-semibold text-slate-800 backdrop-blur-sm sm:w-auto dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab('week')}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 transition sm:flex-none ${
              activeTab === 'week'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <CalendarDays size={14} />
            Εβδομάδα
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('month')}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md px-3 py-1.5 transition sm:flex-none ${
              activeTab === 'month'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'hover:bg-white/70 dark:hover:bg-slate-800/70'
            }`}
          >
            <FileText size={14} />
            Μήνας
          </button>
        </div>
      </div>

      {activeTab === 'week' ? (
        <WeekHistoryViewer isAdmin={isAdmin} weekHistory={weekHistory} employees={employees} embedded />
      ) : (
        <MonthlyArchiveList
          archives={monthlyArchives}
          isLoading={isMonthlyLoading}
          actionLoading={actionLoading}
          onRefresh={onRefreshMonthly}
          onDownload={onDownloadMonthlyArchive}
        />
      )}
    </section>
  );
}
