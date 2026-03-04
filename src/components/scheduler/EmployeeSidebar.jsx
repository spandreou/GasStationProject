import { Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ShiftCard from './ShiftCard';
import ShiftTemplateCard from './ShiftTemplateCard';

const defaultEmployeeForm = {
  fullName: '',
  role: '',
  color: '#1D4ED8',
  afm: '',
  phone: '',
  email: '',
  hireDate: '',
};

const defaultTemplateForm = {
  label: '',
  startTime: '10:00',
  endTime: '12:00',
  employeeId: '',
};

export default function EmployeeSidebar({
  employees,
  shiftTemplates,
  isAdmin,
  onAddEmployee,
  onDeleteEmployee,
  onOpenAdminLogin,
  onOpenProfile,
  onAddShiftTemplate,
  onDeleteShiftTemplate,
}) {
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [templateForm, setTemplateForm] = useState(defaultTemplateForm);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el')),
    [employees],
  );

  const sortedTemplates = useMemo(
    () => [...shiftTemplates].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'el')),
    [shiftTemplates],
  );

  async function handleEmployeeSubmit(event) {
    event.preventDefault();
    await onAddEmployee(employeeForm);
    setEmployeeForm(defaultEmployeeForm);
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    await onAddShiftTemplate(templateForm);
    setTemplateForm((prev) => ({
      ...defaultTemplateForm,
      employeeId: prev.employeeId || '',
    }));
  }

  async function handleDeleteEmployee(employee) {
    const confirmed = window.confirm(
      `Θέλεις να διαγράψεις τον/την ${employee.fullName}; Θα διαγραφούν και οι βάρδιές του/της.`,
    );
    if (!confirmed) return;
    await onDeleteEmployee(employee.id);
  }

  async function handleDeleteTemplate(template) {
    const confirmed = window.confirm(`Θέλεις να διαγράψεις το template "${template.label}";`);
    if (!confirmed) return;
    await onDeleteShiftTemplate(template.id);
  }

  return (
    <aside className="glass-panel space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Υπάλληλοι</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">Σύρε υπάλληλο πάνω σε preset βάρδια.</p>
      </div>

      <div className="max-h-[260px] space-y-2 overflow-auto pr-1 scrollbar-thin">
        {sortedEmployees.map((employee) => (
          <div key={employee.id} className="flex items-center gap-2">
            <div className="flex-1">
              <ShiftCard employee={employee} disabled={!isAdmin} showRole={isAdmin} />
            </div>

            <button
              type="button"
              onClick={() => onOpenProfile(employee)}
              disabled={!isAdmin}
              className="rounded-lg border border-white/35 bg-white/55 p-2 text-slate-700 backdrop-blur-sm hover:bg-white/80 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-40"
              title="Προφίλ / Επεξεργασία"
            >
              <Pencil size={15} />
            </button>

            <button
              type="button"
              onClick={() => handleDeleteEmployee(employee)}
              disabled={!isAdmin}
              className="rounded-lg border border-white/35 bg-white/55 p-2 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              title="Διαγραφή"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleEmployeeSubmit} className="glass-soft space-y-2 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Νέος υπάλληλος</p>
          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
            >
              <Lock size={12} />
              Admin Login
            </button>
          ) : null}
        </div>

        <input
          value={employeeForm.fullName}
          onChange={(event) => setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))}
          placeholder="Ονοματεπώνυμο"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
          required
          disabled={!isAdmin}
        />

        <input
          value={employeeForm.role}
          onChange={(event) => setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))}
          placeholder="Ρόλος (π.χ. Ταμείο)"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
          disabled={!isAdmin}
        />

        <label className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200">
          Χρώμα κάρτας
          <input
            type="color"
            value={employeeForm.color}
            onChange={(event) => setEmployeeForm((prev) => ({ ...prev, color: event.target.value }))}
            className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
            disabled={!isAdmin}
          />
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isAdmin}
        >
          <Plus size={16} />
          Προσθήκη
        </button>
      </form>

      <section className="glass-soft space-y-3 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-cyan-700 dark:text-pink-300" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Custom Βάρδιες (Draggable)</h3>
        </div>

        <div className="max-h-[180px] space-y-2 overflow-auto pr-1 scrollbar-thin">
          {sortedTemplates.map((template) => (
            <div key={template.id} className="flex items-center gap-2">
              <div className="flex-1">
                <ShiftTemplateCard template={template} disabled={!isAdmin} />
              </div>

              <button
                type="button"
                onClick={() => handleDeleteTemplate(template)}
                disabled={!isAdmin}
                className="rounded-lg border border-white/35 bg-white/55 p-2 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                title="Διαγραφή template"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          {!sortedTemplates.length ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Δεν υπάρχουν custom templates ακόμα.</p>
          ) : null}
        </div>

        <form onSubmit={handleTemplateSubmit} className="space-y-2 rounded-lg border border-cyan-300/45 bg-cyan-50/55 p-2.5 dark:border-pink-300/35 dark:bg-slate-900/45">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Νέο custom template</p>

          <input
            value={templateForm.label}
            onChange={(event) => setTemplateForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="Όνομα βάρδιας (π.χ. Πλύσιμο)"
            className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
            disabled={!isAdmin}
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={templateForm.startTime}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, startTime: event.target.value }))}
              className="input-glass rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
              required
            />
            <input
              type="time"
              value={templateForm.endTime}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, endTime: event.target.value }))}
              className="input-glass rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
              required
            />
          </div>

          <label className="block text-xs font-medium text-slate-800 dark:text-slate-100">
            Προεπιλεγμένος υπάλληλος (προαιρετικό)
            <select
              value={templateForm.employeeId}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, employeeId: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
            >
              <option value="">Χωρίς προεπιλογή</option>
              {sortedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700 dark:border dark:border-pink-300/45 dark:bg-pink-500/85 dark:hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isAdmin}
          >
            <Plus size={16} />
            Προσθήκη Template
          </button>
        </form>
      </section>
    </aside>
  );
}
