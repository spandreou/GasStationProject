import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderCheck,
  Loader2,
  LockKeyhole,
  LogOut,
  MoonStar,
  Save,
  Sparkles,
  SunMedium,
  Trash2,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../feedback/ConfirmDialog';
import { formatDateGreek } from '../../utils/time';

function LoadingButton({
  icon: Icon,
  label,
  loadingLabel,
  isLoading = false,
  className,
  disabled = false,
  onClick,
  title,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      disabled={disabled || isLoading}
      title={title}
      aria-busy={isLoading}
    >
      {isLoading ? <Loader2 size={15} className="animate-spin" /> : Icon ? <Icon size={15} /> : null}
      {isLoading ? loadingLabel || `${label}...` : label}
    </button>
  );
}

function SyncIndicator({ syncStatus }) {
  const status = syncStatus?.status || 'saved';
  const labelByStatus = {
    saved: 'Αποθηκευμένο',
    unsaved: 'Μη αποθηκευμένες αλλαγές',
    saving: 'Αποθήκευση...',
    error: 'Αποτυχία αποθήκευσης',
  };

  const classesByStatus = {
    saved:
      'border-emerald-300/70 bg-emerald-50/85 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-500/20 dark:text-emerald-100',
    unsaved:
      'border-amber-300/70 bg-amber-50/85 text-amber-900 dark:border-amber-300/35 dark:bg-amber-500/20 dark:text-amber-100',
    saving:
      'border-sky-300/70 bg-sky-50/85 text-sky-900 dark:border-sky-300/35 dark:bg-sky-500/20 dark:text-sky-100',
    error:
      'border-rose-300/70 bg-rose-50/85 text-rose-900 dark:border-rose-300/35 dark:bg-rose-500/20 dark:text-rose-100',
  };

  const Icon =
    status === 'saved'
      ? CheckCircle2
      : status === 'unsaved'
        ? TriangleAlert
        : status === 'saving'
          ? Loader2
          : XCircle;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        classesByStatus[status] || classesByStatus.saved
      }`}
    >
      <Icon size={13} className={status === 'saving' ? 'animate-spin' : ''} />
      {syncStatus?.label || labelByStatus[status] || labelByStatus.saved}
    </span>
  );
}

function ExportDropdown({ onExportWeekPdf, onExportMonthPdf, onExportExcel, onExportWord, actionLoading = {} }) {
  const [isOpen, setIsOpen] = useState(false);

  async function handleAction(action) {
    setIsOpen(false);
    if (typeof action === 'function') {
      await action();
    }
  }

  return (
    <div className="relative z-[9999] overflow-visible">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-white/35 bg-white/35 px-2.5 py-2 text-xs font-semibold text-slate-900 backdrop-blur-md transition active:scale-[0.99] hover:bg-white/60 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65"
      >
        <FileDown size={16} />
        Εξαγωγή
        <ChevronDown size={14} />
      </button>

      {isOpen ? (
        <div className="z-[9999] mt-2 w-full rounded-lg border border-white/45 bg-white/85 p-1.5 shadow-2xl backdrop-blur-md sm:absolute sm:right-0 sm:min-w-[200px] sm:w-auto dark:border-cyan-300/45 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => handleAction(onExportWeekPdf)}
            disabled={actionLoading.exportWeekPdf}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-white/70 disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            {actionLoading.exportWeekPdf ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            PDF Εβδομάδας
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportMonthPdf)}
            disabled={actionLoading.exportMonthPdf}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-white/70 disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            {actionLoading.exportMonthPdf ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            PDF Μήνα
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportExcel)}
            disabled={actionLoading.exportExcel}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-white/70 disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            {actionLoading.exportExcel ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            Excel
          </button>
          <button
            type="button"
            onClick={() => handleAction(onExportWord)}
            disabled={actionLoading.exportWord}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-white/70 disabled:opacity-60 dark:text-slate-100 dark:hover:bg-slate-800/80"
          >
            {actionLoading.exportWord ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Word
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
  'inline-flex items-center justify-center gap-1 rounded-lg border border-white/35 bg-white/40 px-3 py-2 text-xs font-semibold text-slate-900 backdrop-blur-md transition active:scale-[0.99] hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-900/65';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.99] hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
const finalizeButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-indigo-300/70 bg-indigo-50/90 px-3 py-2 text-xs font-semibold text-indigo-900 transition active:scale-[0.99] hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-300/40 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25';
const infoButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-300/60 bg-emerald-50/85 px-3 py-2 text-xs font-semibold text-emerald-900 transition active:scale-[0.99] hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-300/35 dark:bg-emerald-500/15 dark:text-emerald-100 dark:hover:bg-emerald-500/25';
const dangerButtonClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-red-300/70 bg-red-500/90 px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.99] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50';
const warningDangerClass =
  'inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300/70 bg-amber-500/90 px-3 py-2 text-xs font-semibold text-white transition active:scale-[0.99] hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50';

export default function WeekToolbar({
  weekDays,
  weekTemplates = [],
  selectedTemplateId = '',
  selectedMonth,
  selectedYear,
  isAdmin,
  isAdminTransitioning = false,
  isDark,
  onOpenAdminLogin,
  onLogoutAdmin,
  onToggleTheme,
  onSaveWeek,
  onSaveTemplate,
  onSelectTemplate,
  onLoadSelectedTemplate,
  onCopyWhatsapp,
  onClearWeek,
  onClearMonth,
  onFinalizeWeek,
  onMagicWand,
  onExportWeekPdf,
  onExportMonthPdf,
  onExportExcel,
  onExportWord,
  isWeekLocked = false,
  syncStatus,
  actionLoading = {},
}) {
  const hasTemplates = weekTemplates.length > 0;
  const canLoadTemplate = isAdmin && hasTemplates && selectedTemplateId;
  const [confirmDialog, setConfirmDialog] = useState(null);

  const weekRangeText = useMemo(
    () => `Εβδομάδα ${formatDateGreek(weekDays?.[0])} - ${formatDateGreek(weekDays?.[6])}`,
    [weekDays],
  );

  async function runWithConfirm(action) {
    if (!confirmDialog || typeof action !== 'function') return;
    await action();
    setConfirmDialog(null);
  }

  async function handleSaveTemplate() {
    if (!isAdmin || typeof onSaveTemplate !== 'function') return;
    const suggestedName = `Template ${formatDateGreek(weekDays?.[0] || '')}`;
    const name = window.prompt('Όνομα για νέο template', suggestedName);
    if (!name || !name.trim()) return;
    await onSaveTemplate(name.trim());
  }

  return (
    <>
      <header className="glass-panel relative z-[60] overflow-visible rounded-2xl p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <h1 className="text-base font-bold text-slate-900 sm:text-xl dark:text-white">Πίνακας Βαρδιών Πρατηρίου</h1>
            <p className="text-[11px] text-slate-700 sm:text-sm dark:text-slate-300">{weekRangeText}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SyncIndicator syncStatus={syncStatus} />
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                isAdmin
                  ? 'border border-emerald-300/70 bg-emerald-50/85 text-emerald-900 dark:border-emerald-300/35 dark:bg-emerald-500/20 dark:text-emerald-100'
                  : isAdminTransitioning
                    ? 'border border-sky-300/70 bg-sky-50/85 text-sky-900 dark:border-sky-300/35 dark:bg-sky-500/20 dark:text-sky-100'
                    : 'border border-slate-300/70 bg-slate-100/80 text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100'
              }`}
            >
              {isAdmin ? (
                <Circle size={10} className="fill-emerald-500 text-emerald-500" />
              ) : isAdminTransitioning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Circle size={10} className="fill-slate-400 text-slate-400" />
              )}
              {isAdmin ? 'Admin Mode' : isAdminTransitioning ? 'Ενεργοποίηση Admin Mode...' : 'Read-only Mode'}
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
                disabled={isAdminTransitioning}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs font-semibold text-amber-900 backdrop-blur-sm transition active:scale-[0.99] hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
              >
                {isAdminTransitioning ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
                {isAdminTransitioning ? 'Ενεργοποίηση...' : 'Είσοδος Διαχειριστή'}
              </button>
            ) : (
              <button type="button" onClick={onLogoutAdmin} className={neutralButtonClass}>
                <LogOut size={16} />
                Αποσύνδεση
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <ToolbarGroup title="Editing">
            {isAdmin ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <LoadingButton
                    icon={Save}
                    label="Αποθήκευση"
                    loadingLabel="Αποθήκευση..."
                    onClick={onSaveWeek}
                    className={primaryButtonClass}
                    isLoading={actionLoading.saveWeek}
                  />

                  <LoadingButton
                    icon={Sparkles}
                    label="Αυτόματη Δημιουργία"
                    loadingLabel="Δημιουργία..."
                    onClick={onMagicWand}
                    className={neutralButtonClass}
                    isLoading={actionLoading.magicWeek}
                  />
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
                  <LoadingButton
                    icon={FileText}
                    label="Φόρτωση Template"
                    loadingLabel="Φόρτωση..."
                    onClick={() => onLoadSelectedTemplate?.()}
                    disabled={!canLoadTemplate}
                    className={neutralButtonClass}
                    isLoading={actionLoading.loadTemplate}
                  />

                  <LoadingButton
                    icon={Save}
                    label="Save as Template"
                    loadingLabel="Αποθήκευση..."
                    onClick={handleSaveTemplate}
                    className={neutralButtonClass}
                    isLoading={actionLoading.saveTemplate}
                  />
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
              <LoadingButton
                icon={FolderCheck}
                label={isWeekLocked ? 'Οριστικοποιημένη' : 'Οριστικοποίηση Εβδομάδας'}
                loadingLabel="Οριστικοποίηση..."
                onClick={() =>
                  setConfirmDialog({
                    tone: 'warning',
                    title: 'Οριστικοποίηση εβδομάδας',
                    message: 'Θέλεις να οριστικοποιήσεις αυτή την εβδομάδα;',
                    details: 'Η εβδομάδα θα κλειδώσει και οι αλλαγές θα περιοριστούν.',
                    confirmLabel: 'Ναι, οριστικοποίηση',
                    onConfirm: onFinalizeWeek,
                  })
                }
                disabled={isWeekLocked}
                className={finalizeButtonClass}
                isLoading={actionLoading.finalizeWeek}
              />
            ) : null}

            <LoadingButton
              icon={Copy}
              label="Αντιγραφή για WhatsApp"
              loadingLabel="Αντιγραφή..."
              onClick={onCopyWhatsapp}
              className={infoButtonClass}
              isLoading={actionLoading.copyWhatsapp}
            />

            <ExportDropdown
              onExportWeekPdf={onExportWeekPdf}
              onExportMonthPdf={onExportMonthPdf}
              onExportExcel={onExportExcel}
              onExportWord={onExportWord}
              actionLoading={actionLoading}
            />
          </ToolbarGroup>

          {isAdmin ? (
            <ToolbarGroup title="Danger Zone">
              <LoadingButton
                icon={Trash2}
                label="Καθαρισμός Εβδομάδας"
                loadingLabel="Καθαρισμός..."
                onClick={() =>
                  setConfirmDialog({
                    tone: 'danger',
                    title: 'Καθαρισμός εβδομάδας',
                    message: `Θέλεις σίγουρα να καθαρίσεις τη βδομάδα ${formatDateGreek(weekDays[0])} - ${formatDateGreek(weekDays[6])};`,
                    details: 'Η ενέργεια διαγράφει όλες τις βάρδιες της εβδομάδας και δεν αναιρείται από το UI.',
                    confirmLabel: 'Ναι, καθαρισμός',
                    onConfirm: onClearWeek,
                  })
                }
                className={dangerButtonClass}
                isLoading={actionLoading.clearWeek}
              />
              <LoadingButton
                icon={Trash2}
                label="Καθαρισμός Μήνα"
                loadingLabel="Καθαρισμός..."
                onClick={() => {
                  const monthDate = new Date(selectedYear, selectedMonth, 1);
                  const monthLabel = Number.isFinite(monthDate.getTime())
                    ? new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(monthDate)
                    : 'τον επιλεγμένο μήνα';
                  setConfirmDialog({
                    tone: 'danger',
                    title: 'Καθαρισμός μήνα',
                    message: `Θέλεις σίγουρα να καθαρίσεις τον ${monthLabel};`,
                    details: 'Η ενέργεια διαγράφει όλες τις βάρδιες του μήνα και δεν αναιρείται από το UI.',
                    confirmLabel: 'Ναι, καθαρισμός',
                    onConfirm: onClearMonth,
                  });
                }}
                disabled={typeof onClearMonth !== 'function'}
                className={warningDangerClass}
                isLoading={actionLoading.clearMonth}
              />
            </ToolbarGroup>
          ) : null}
        </div>
      </header>

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        details={confirmDialog?.details || ''}
        tone={confirmDialog?.tone || 'danger'}
        confirmLabel={confirmDialog?.confirmLabel || 'Επιβεβαίωση'}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => runWithConfirm(confirmDialog?.onConfirm)}
        isConfirming={Boolean(
          actionLoading.clearWeek || actionLoading.clearMonth || actionLoading.finalizeWeek,
        )}
      />
    </>
  );
}
