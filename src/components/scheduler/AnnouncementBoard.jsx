import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

function formatAnnouncementDate(value) {
  if (!value) return '';

  if (typeof value?.toDate === 'function') {
    return new Intl.DateTimeFormat('el-GR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value.toDate());
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('el-GR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }

  return '';
}

export default function AnnouncementBoard({ announcements, isAdmin, isSaving, onAddAnnouncement, onDeleteAnnouncement }) {
  const [draft, setDraft] = useState({ title: '', body: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    const saved = await onAddAnnouncement(draft);
    if (saved) {
      setDraft({ title: '', body: '' });
    }
  }

  return (
    <section className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone size={18} className="text-brand-600 dark:text-cyan-200" />
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Πίνακας Ανακοινώσεων</h2>
      </div>

      {isAdmin ? (
        <form onSubmit={handleSubmit} className="mb-4 grid gap-2">
          <input
            type="text"
            placeholder="Τίτλος ανακοίνωσης"
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-brand-300/50 focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            required
          />
          <textarea
            placeholder="Γράψε την ανακοίνωση..."
            value={draft.body}
            onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
            className="input-glass min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            required
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            disabled={isSaving}
          >
            <Plus size={14} />
            {isSaving ? 'Αποθήκευση...' : 'Δημοσίευση Ανακοίνωσης'}
          </button>
        </form>
      ) : (
        <p className="mb-4 text-xs text-slate-700 dark:text-slate-300">Μόνο ο διαχειριστής μπορεί να δημοσιεύει ανακοινώσεις.</p>
      )}

      <div className="space-y-3">
        {!announcements.length ? (
          <p className="rounded-lg border border-slate-300/70 bg-white/50 px-3 py-2 text-sm text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-300">
            Δεν υπάρχουν ανακοινώσεις ακόμα.
          </p>
        ) : (
          announcements.map((announcement) => (
            <article
              key={announcement.id}
              className="rounded-xl border border-slate-300/70 bg-white/55 p-3 shadow-sm dark:border-cyan-300/35 dark:bg-slate-900/45"
            >
              <div className="mb-1 flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{announcement.title}</h3>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onDeleteAnnouncement(announcement.id)}
                    className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
                    title="Διαγραφή ανακοίνωσης"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{announcement.body}</p>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                {formatAnnouncementDate(announcement.createdAt)}
                {announcement.authorEmail ? ` - ${announcement.authorEmail}` : ''}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
