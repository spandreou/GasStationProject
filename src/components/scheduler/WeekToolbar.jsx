import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderCheck,
  LockKeyhole,
  LogOut,
  MoonStar,
  RefreshCw,
  Save,
  Sparkles,
  SunMedium,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateGreek } from '../../utils/time';

function ExportDropdown({ onExportWeekPdf, onExportMonthPdf, onExportExcel, onExportWord }) {
  const [isOpen, setIsOpen] = useState(false);

  function handleAction(action) {
    setIsOpen(false);
    if (typeof action === 'function') {
      action();
    }
  }

  return (
    <div className="relative z-[9999] overflow-visible">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-white/35 bg-white/35 px-2.5 py-2 text-xs font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
      >
        <FileDown size={16} />
        Εξαγωγή
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-[9999] mt-2 min-w-[180px] rounded-lg border border-white/45 bg-white/85 p-1.5 shadow-2xl backdrop-blur-md dark:border-cyan-300/45 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => handleAction(onExportWeekPdf)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileText size={15} />
            PDF Εβδομάδας
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportMonthPdf)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-white/70 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            <FileText size={15} />
            PDF Μήνα
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

function ToolbarGroup({ title, children }) {
  return (
    <section className="rounded-xl border border-white/45 bg-white/25 p-3 backdrop-blur-sm dark:border-cyan-300/25 dark:bg-slate-900/30">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-cyan-100/90">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

const neutralButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-xs font-semibold text-slate-900 backdrop-blur-md hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
const finalizeButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-300/70 bg-indigo-50/90 px-3 py-2 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-300/40 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25';
const infoButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300/60 bg-emerald-50/85 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-300/35 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25';
const dangerButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-red-300/70 bg-red-500/90 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50';
const warningDangerClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300/70 bg-amber-500/90 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50';

export default function WeekToolbar({
  weekDays,
  weekTemplates = [],
  selectedTemplateId = '',
  selectedMonth,
  selectedYear,
  isAdmin,
  isDark,
  onOpenAdminLogin,
  onLogoutAdmin,
  onToggleTheme,
  onPrevWeek,
  onNextWeek,
  onCurrentWeek,
  onSaveWeek,
  onSaveTemplate,
  onSelectTemplate,
  onLoadSelectedTemplate,
  onCopyWhatsapp,
  onClearWeek,
  onClearMonth,
  onFinalizeWeek,
  onMagicWand,
  onJumpToWeekDate,
  onExportWeekPdf,
  onExportMonthPdf,
  onExportExcel,
  onExportWord,
  isWeekLocked = false,
}) {
  const hasTemplates = weekTemplates.length > 0;
  const canLoadTemplate = isAdmin && hasTemplates && selectedTemplateId;

  const weekRangeText = useMemo(
    () => `Εβδομάδα ${formatDateGreek(weekDays?.[0])} - ${formatDateGreek(weekDays?.[6])}`,
    [weekDays],
  );

  async function handleClearWeek() {
    const confirmed = window.confirm(
      `Να διαγραφούν όλες οι βάρδιες από ${formatDateGreek(weekDays[0])} έως ${formatDateGreek(weekDays[6])};`,
    );
    if (!confirmed) return;
    await onClearWeek();
  }

  async function handleClearMonth() {
    if (typeof onClearMonth !== 'function') return;
    const monthDate = new Date(selectedYear, selectedMonth, 1);
    const monthLabel =
      Number.isFinite(monthDate.getTime())
        ? new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(monthDate)
        : 'τον επιλεγμένο μήνα';
    const confirmed = window.confirm(`Να διαγραφούν όλες οι βάρδιες για ${monthLabel};`);
    if (!confirmed) return;
    await onClearMonth();
  }

  async function handleFinalizeWeek() {
    const confirmed = window.confirm(
      'Είστε σίγουρος; Οι βάρδιες θα αρχειοθετηθούν και η εβδομάδα θα κλειδώσει',
    );
    if (!confirmed) return;
    await onFinalizeWeek();
  }

  async function handleSaveTemplate() {
    if (!isAdmin || typeof onSaveTemplate !== 'function') return;
    const suggestedName = `Template ${formatDateGreek(weekDays?.[0] || '')}`;
    const name = window.prompt('Όνομα για νέο template', suggestedName);
    if (!name || !name.trim()) return;
    await onSaveTemplate(name.trim());
  }

  return (
    <header className="glass-panel relative z-[60] overflow-visible rounded-2xl p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-base font-bold text-slate-900 sm:text-xl dark:text-white">Πίνακας Βαρδιών Πρατηρίου</h1>
          <p className="text-[11px] text-slate-700 sm:text-sm dark:text-slate-300">{weekRangeText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isAdmin
                ? 'border border-emerald-300/70 bg-emerald-50/85 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-500/20 dark:text-emerald-100'
                : 'border border-slate-300/70 bg-slate-100/80 text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100'
            }`}
          >
            {isAdmin ? 'Admin Mode' : 'Read-only Mode'}
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            className={neutralButtonClass}
            title={isDark ? 'Εναλλαγή σε Light mode' : 'Εναλλαγή σε Dark mode'}
          >
            {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
            {isDark ? 'Light' : 'Dark'}
          </button>

          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-900 backdrop-blur-sm hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
            >
              <LockKeyhole size={16} />
              Είσοδος Διαχειριστή
            </button>
          ) : (
            <button type="button" onClick={onLogoutAdmin} className={neutralButtonClass}>
              <LogOut size={16} />
              Αποσύνδεση
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-4">
        <ToolbarGroup title="Navigation">
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={onPrevWeek} className={neutralButtonClass}>
              <ChevronLeft size={16} />
              Προηγούμενη
            </button>
            <button type="button" onClick={onCurrentWeek} className={neutralButtonClass}>
              <RefreshCw size={16} />
              Τρέχουσα
            </button>
            <button type="button" onClick={onNextWeek} className={neutralButtonClass}>
              Επόμενη
              <ChevronRight size={16} />
            </button>
          </div>

          <input
            type="date"
            lang="el-GR"
            value={weekDays?.[0] || ''}
            onChange={(event) => onJumpToWeekDate?.(event.target.value)}
            className="input-glass w-full rounded-lg border border-white/35 bg-white/40 px-2.5 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
            title="Μετάβαση σε εβδομάδα"
          />
        </ToolbarGroup>

        <ToolbarGroup title="Editing">
          {isAdmin ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onSaveWeek} className={primaryButtonClass}>
                  <Save size={16} />
                  Αποθήκευση
                </button>

                <button type="button" onClick={onMagicWand} className={neutralButtonClass}>
                  <Sparkles size={16} />
                  Αυτόματη Δημιουργία
                </button>
              </div>

              <select
                value={selectedTemplateId}
                onChange={(event) => onSelectTemplate?.(event.target.value)}
                className="input-glass w-full rounded-lg border border-white/35 bg-white/40 px-2.5 py-2 text-xs text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                <option value="">Επιλογή template...</option>
                {weekTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name || 'Template'}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onLoadSelectedTemplate?.()}
                  disabled={!canLoadTemplate}
                  className={neutralButtonClass}
                >
                  <FileText size={14} />
                  Φόρτωση Template
                </button>

                <button type="button" onClick={handleSaveTemplate} className={neutralButtonClass}>
                  <Save size={14} />
                  Save as Template
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-slate-300/70 bg-white/45 px-3 py-2 text-xs text-slate-700 dark:border-cyan-300/25 dark:bg-slate-900/40 dark:text-slate-300">
              Read-only preview. Για επεξεργασία, κάνε είσοδο ως διαχειριστής.
            </div>
          )}
        </ToolbarGroup>

        <ToolbarGroup title="Finalize / Share">
          {isAdmin ? (
            <button
              type="button"
              onClick={handleFinalizeWeek}
              disabled={isWeekLocked}
              className={finalizeButtonClass}
            >
              <FolderCheck size={16} />
              {isWeekLocked ? 'Οριστικοποιημένη' : 'Οριστικοποίηση Εβδομάδας'}
            </button>
          ) : null}

          <button type="button" onClick={onCopyWhatsapp} className={infoButtonClass}>
            <Copy size={16} />
            Αντιγραφή για WhatsApp
          </button>

          <ExportDropdown
            onExportWeekPdf={onExportWeekPdf}
            onExportMonthPdf={onExportMonthPdf}
            onExportExcel={onExportExcel}
            onExportWord={onExportWord}
          />
        </ToolbarGroup>

        {isAdmin ? (
          <ToolbarGroup title="Danger Zone">
            <button type="button" onClick={handleClearWeek} className={dangerButtonClass}>
              <Trash2 size={16} />
              Καθαρισμός Εβδομάδας
            </button>
            <button
              type="button"
              onClick={handleClearMonth}
              disabled={typeof onClearMonth !== 'function'}
              className={warningDangerClass}
            >
              <Trash2 size={16} />
              Καθαρισμός Μήνα
            </button>
          </ToolbarGroup>
        ) : null}
      </div>
    </header>
  );
}
