import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  LogOut,
  RefreshCw,
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
        className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/35 px-3 py-2 text-sm font-semibold text-slate-900 backdrop-blur-md hover:bg-white/55"
      >
        <FileDown size={16} />
        Εξαγωγή
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-20 mt-2 min-w-[170px] rounded-lg border border-white/40 bg-white/80 p-1 shadow-lg backdrop-blur-md">
          <button
            type="button"
            onClick={() => handleAction(onExportPdf)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70"
          >
            <FileText size={15} />
            Εξαγωγή PDF
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportExcel)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70"
          >
            <FileSpreadsheet size={15} />
            Εξαγωγή Excel
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportWord)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70"
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
  onOpenAdminLogin,
  onLogoutAdmin,
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
      `Να διαγραφούν όλες οι βάρδιες από ${formatDateGreek(weekDays[0])} έως ${formatDateGreek(
        weekDays[6],
      )};`,
    );
    if (!confirmed) return;
    await onClearWeek();
  }

  return (
    <header className="glass-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Πίνακας Βαρδιών Πρατηρίου</h1>
          <p className="text-sm text-slate-700">
            Εβδομάδα {formatDateGreek(weekDays[0])} - {formatDateGreek(weekDays[6])}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2 text-sm font-semibold text-amber-900 backdrop-blur-sm hover:bg-amber-100"
            >
              <LockKeyhole size={16} />
              Admin Login
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutAdmin}
              className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60"
            >
              <LogOut size={16} />
              Αποσύνδεση
            </button>
          )}

          <button
            type="button"
            onClick={onPrevWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60"
          >
            <ChevronLeft size={16} />
            Προηγούμενη
          </button>

          <button
            type="button"
            onClick={onCurrentWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60"
          >
            <RefreshCw size={16} />
            Τρέχουσα
          </button>

          <button
            type="button"
            onClick={onNextWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-sm text-slate-900 backdrop-blur-md hover:bg-white/60"
          >
            Επόμενη
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={handleClearWeek}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600/90 px-3 py-2 text-sm font-semibold text-white backdrop-blur-md hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            Καθαρισμός Εβδομάδας
          </button>

          <button
            type="button"
            onClick={onCopyWhatsapp}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600/90 px-3 py-2 text-sm font-semibold text-white backdrop-blur-md hover:bg-green-700"
          >
            <Copy size={16} />
            Copy for WhatsApp
          </button>

          <ExportDropdown onExportPdf={onExportPdf} onExportExcel={onExportExcel} onExportWord={onExportWord} />
        </div>
      </div>
    </header>
  );
}
