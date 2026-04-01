import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderCheck,
  Info,
  LockKeyhole,
  LogOut,
  Menu,
  MoonStar,
  RefreshCw,
  Sparkles,
  SunMedium,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { formatDateGreek } from '../../utils/time';

function ExportDropdown({ onExportPdf, onExportExcel, onExportWord }) {
  const [isOpen, setIsOpen] = useState(false);

  function handleAction(action) {
    setIsOpen(false);
    action();
  }

  return (
    <div className="relative z-[9999] overflow-visible">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/35 px-2.5 py-1.5 text-xs font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
      >
        <FileDown size={16} />
        Εξαγωγή
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-[9999] mt-2 min-w-[180px] rounded-lg border border-white/45 bg-white/85 p-1.5 shadow-2xl backdrop-blur-md dark:border-cyan-300/45 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => handleAction(onExportPdf)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileText size={15} />
            Εξαγωγή σε PDF
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportExcel)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileSpreadsheet size={15} />
            Εξαγωγή σε Excel
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportWord)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileText size={15} />
            Εξαγωγή Word
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function WeekToolbar({
  weekDays,
  isAdmin,
  isDark,
  onOpenAdminLogin,
  onLogoutAdmin,
  onToggleTheme,
  onPrevWeek,
  onNextWeek,
  onCurrentWeek,
  onCopyWhatsapp,
  onClearWeek,
  onFinalizeWeek,
  onMagicWand,
  onJumpToWeekDate,
  onExportPdf,
  onExportExcel,
  onExportWord,
  isWeekLocked = false,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  async function handleClearWeek() {
    const confirmed = window.confirm(
      `Να διαγραφούν όλες οι βάρδιες από ${formatDateGreek(weekDays[0])} έως ${formatDateGreek(weekDays[6])};`,
    );
    if (!confirmed) return;
    await onClearWeek();
  }

  async function handleFinalizeWeek() {
    const confirmed = window.confirm(
      'Είστε σίγουρος; Οι βάρδιες θα αρχειοθετηθούν και η εβδομάδα θα κλειδώσει',
    );
    if (!confirmed) return;
    await onFinalizeWeek();
  }

  function handleMoreAction(action) {
    setIsMoreOpen(false);
    action();
  }

  return (
    <header className="glass-panel relative z-[60] overflow-visible rounded-2xl p-2 sm:p-4">
      <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-900 sm:text-xl dark:text-white">Πίνακας Βαρδιών Πρατηρίου</h1>
          <p className="text-[11px] text-slate-700 sm:text-sm dark:text-slate-300">
            Εβδομάδα {formatDateGreek(weekDays[0])} - {formatDateGreek(weekDays[6])}
          </p>
        </div>

        <div className="relative z-[70] flex items-center gap-2 overflow-visible md:hidden">
          <button
            type="button"
            onClick={onPrevWeek}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/35 bg-white/40 text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
            aria-label="Προηγούμενη εβδομάδα"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={onCurrentWeek}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/35 bg-white/40 text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
            aria-label="Τρέχουσα εβδομάδα"
          >
            <RefreshCw size={16} />
          </button>

          <button
            type="button"
            onClick={onNextWeek}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/35 bg-white/40 text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
            aria-label="Επόμενη εβδομάδα"
          >
            <ChevronRight size={16} />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMoreOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
              aria-expanded={isMoreOpen}
            >
              <Menu size={16} />
              Περισσότερα
            </button>
          </div>
        </div>

        <div className="relative z-[70] hidden flex-wrap gap-2 overflow-visible md:flex">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-2.5 py-1.5 text-xs font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/45 dark:bg-slate-900/55 dark:text-cyan-100 dark:hover:border-pink-300/45 dark:hover:bg-slate-900/75"
            title={isDark ? 'Εναλλαγή σε Light mode' : 'Εναλλαγή σε Dark mode'}
          >
            {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/90 px-2.5 py-1.5 text-xs font-semibold text-amber-900 backdrop-blur-sm hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
            >
              <LockKeyhole size={16} />
              Admin Login
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutAdmin}
              className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
            >
              <LogOut size={16} />
              Αποσύνδεση
            </button>
          )}

          <button
            type="button"
            onClick={onPrevWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
          >
            <ChevronLeft size={16} />
            Προηγούμενη
          </button>

          <button
            type="button"
            onClick={onCurrentWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
          >
            <RefreshCw size={16} />
            Τρέχουσα
          </button>

          <button
            type="button"
            onClick={onMagicWand}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
          >
            <Sparkles size={16} />
            Magic Wand
          </button>

          <input
            type="date"
            onChange={(event) => onJumpToWeekDate?.(event.target.value)}
            className="input-glass rounded-lg border border-white/35 bg-white/40 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
            title="Μετάβαση σε εβδομάδα"
          />

          <button
            type="button"
            onClick={onNextWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
          >
            Επόμενη
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={handleClearWeek}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-red-700 dark:bg-red-500/80 dark:hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            Καθαρισμός Εβδομάδας
          </button>

          <button
            type="button"
            onClick={handleFinalizeWeek}
            disabled={!isAdmin || isWeekLocked}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/90 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-indigo-700 dark:bg-indigo-500/80 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderCheck size={16} />
            {isWeekLocked ? 'Οριστικοποιημένη' : 'Finalize Week'}
          </button>

          <button
            type="button"
            onClick={onCopyWhatsapp}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600/90 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md hover:bg-green-700 dark:bg-emerald-500/80 dark:hover:bg-emerald-500"
          >
            <Copy size={16} />
            Copy for WhatsApp
          </button>

          <ExportDropdown onExportPdf={onExportPdf} onExportExcel={onExportExcel} onExportWord={onExportWord} />
        </div>
      </div>

      <div className="mt-2 hidden rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs text-slate-700 backdrop-blur-md sm:mt-3 sm:block dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-cyan-100">
        <p className="inline-flex items-center gap-1.5">
          <Info size={14} />
          Επόμενη αναβάθμιση: πλήρως βελτιστοποιημένο Responsive Mobile UI.
        </p>
      </div>

      {isMoreOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Κλείσιμο"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-slate-100/90 p-4 shadow-2xl backdrop-blur-md dark:bg-slate-950/85">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Περισσότερες επιλογές</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleMoreAction(onToggleTheme)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              >
                {isDark ? <SunMedium size={15} /> : <MoonStar size={15} />}
                {isDark ? 'Light mode' : 'Dark mode'}
              </button>

              {!isAdmin ? (
                <button
                  type="button"
                  onClick={() => handleMoreAction(onOpenAdminLogin)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-left text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
                >
                  <LockKeyhole size={15} />
                  Admin Login
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleMoreAction(onLogoutAdmin)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  <LogOut size={15} />
                  Αποσύνδεση
                </button>
              )}

              <button
                type="button"
                onClick={() => handleMoreAction(onCopyWhatsapp)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-left text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25"
              >
                <Copy size={15} />
                Copy WhatsApp
              </button>

              <div className="my-1 h-px bg-slate-200/70 dark:bg-slate-700/70" />

              <button
                type="button"
                onClick={() => handleMoreAction(onExportPdf)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <FileText size={15} />
                Εξαγωγή σε PDF
              </button>
              <button
                type="button"
                onClick={() => handleMoreAction(onExportExcel)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <FileSpreadsheet size={15} />
                Εξαγωγή σε Excel
              </button>
              <button
                type="button"
                onClick={() => handleMoreAction(onExportWord)}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <FileText size={15} />
                Εξαγωγή Word
              </button>

              <div className="my-1 h-px bg-slate-200/70 dark:bg-slate-700/70" />

              <button
                type="button"
                onClick={() => handleMoreAction(handleClearWeek)}
                disabled={!isAdmin}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-left text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25"
              >
                <Trash2 size={15} />
                Καθαρισμός Εβδομάδας
              </button>

              <button
                type="button"
                onClick={() => handleMoreAction(handleFinalizeWeek)}
                disabled={!isAdmin || isWeekLocked}
                className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-left text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-300/40 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
              >
                <FolderCheck size={15} />
                {isWeekLocked ? 'Οριστικοποιημένη Εβδομάδα' : 'Finalize Week'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </header>
  );
}
