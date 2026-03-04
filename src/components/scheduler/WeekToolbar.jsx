import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  Info,
  LockKeyhole,
  LogOut,
  MoonStar,
  RefreshCw,
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
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/35 px-3 py-2 text-sm font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
      >
        <FileDown size={16} />
        Εξαγωγή
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 min-w-[170px] rounded-lg border border-white/40 bg-white/80 p-1 shadow-lg backdrop-blur-md dark:border-cyan-300/35 dark:bg-slate-900/85">
          <button
            type="button"
            onClick={() => handleAction(onExportPdf)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileText size={15} />
            Εξαγωγή PDF
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportExcel)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileSpreadsheet size={15} />
            Εξαγωγή Excel
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
  onExportPdf,
  onExportExcel,
  onExportWord,
}) {
  async function handleClearWeek() {
    const confirmed = window.confirm(
      `Να διαγραφούν όλες οι βάρδιες από ${formatDateGreek(weekDays[0])} έως ${formatDateGreek(weekDays[6])};`,
    );
    if (!confirmed) return;
    await onClearWeek();
  }

  return (
    <header className="glass-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Πίνακας Βαρδιών Πρατηρίου</h1>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Εβδομάδα {formatDateGreek(weekDays[0])} - {formatDateGreek(weekDays[6])}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/45 dark:bg-slate-900/55 dark:text-cyan-100 dark:hover:border-pink-300/45 dark:hover:bg-slate-900/75"
            title={isDark ? 'Εναλλαγή σε Light mode' : 'Εναλλαγή σε Dark mode'}
          >
            {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2 text-sm font-semibold text-amber-900 backdrop-blur-sm hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
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
            className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-3 py-2 text-sm font-semibold text-white backdrop-blur-md hover:bg-red-700 dark:bg-red-500/80 dark:hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            Καθαρισμός Εβδομάδας
          </button>

          <button
            type="button"
            onClick={onCopyWhatsapp}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600/90 px-3 py-2 text-sm font-semibold text-white backdrop-blur-md hover:bg-green-700 dark:bg-emerald-500/80 dark:hover:bg-emerald-500"
          >
            <Copy size={16} />
            Copy for WhatsApp
          </button>

          <ExportDropdown onExportPdf={onExportPdf} onExportExcel={onExportExcel} onExportWord={onExportWord} />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/40 bg-white/30 px-3 py-2 text-xs text-slate-700 backdrop-blur-md dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-cyan-100">
        <p className="inline-flex items-center gap-1.5">
          <Info size={14} />
          Επόμενη αναβάθμιση: πλήρως βελτιστοποιημένο Responsive Mobile UI.
        </p>
      </div>
    </header>
  );
}
