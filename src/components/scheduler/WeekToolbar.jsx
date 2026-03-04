import { ChevronLeft, ChevronRight, Copy, LockKeyhole, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { formatDateGreek } from '../../utils/time';

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
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Πίνακας Βαρδιών Πρατηρίου</h1>
          <p className="text-sm text-slate-500">
            Εβδομάδα {formatDateGreek(weekDays[0])} - {formatDateGreek(weekDays[6])}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              <LockKeyhole size={16} />
              Admin Login
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogoutAdmin}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
            >
              <LogOut size={16} />
              Αποσύνδεση
            </button>
          )}

          <button
            type="button"
            onClick={onPrevWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <ChevronLeft size={16} />
            Προηγούμενη
          </button>

          <button
            type="button"
            onClick={onCurrentWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            <RefreshCw size={16} />
            Τρέχουσα
          </button>

          <button
            type="button"
            onClick={onNextWeek}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
          >
            Επόμενη
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={handleClearWeek}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} />
            Καθαρισμός Εβδομάδας
          </button>

          <button
            type="button"
            onClick={onCopyWhatsapp}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            <Copy size={16} />
            Copy for WhatsApp
          </button>
        </div>
      </div>
    </header>
  );
}
