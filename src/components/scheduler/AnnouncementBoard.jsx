import { Megaphone, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../feedback/ConfirmDialog';
import StateNotice from '../feedback/StateNotice';

function formatAnnouncementDate(value) {
  const formatter = new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (!value) return '';

  if (typeof value?.toDate === 'function') {
    return formatter.format(value.toDate());
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return formatter.format(parsed);
  }

  return '';
}

export default function AnnouncementBoard({ announcements, isAdmin, isSaving, onAddAnnouncement, onDeleteAnnouncement }) {
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [formMessage, setFormMessage] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState('');

  const pendingDeleteAnnouncement = useMemo(
    () => announcements.find((item) => item.id === pendingDeleteId) || null,
    [announcements, pendingDeleteId],
  );

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedTitle = draft.title.trim();
    const normalizedBody = draft.body.trim();
    if (!normalizedTitle || !normalizedBody) {
      setFormMessage('Συμπλήρωσε τίτλο και περιεχόμενο πριν τη δημοσίευση.');
      return;
    }

    const saved = await onAddAnnouncement({ title: normalizedTitle, body: normalizedBody });
    if (!saved) {
      setFormMessage('Η ανακοίνωση δεν δημοσιεύτηκε. Δοκίμασε ξανά.');
      return;
    }

    setFormMessage('');
    setDraft({ title: '', body: '' });
  }

  async function confirmDeleteAnnouncement() {
    if (!pendingDeleteId) return;
    await onDeleteAnnouncement(pendingDeleteId);
    setPendingDeleteId('');
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
            onChange={(event) => {
              setDraft((prev) => ({ ...prev, title: event.target.value }));
              if (formMessage) setFormMessage('');
            }}
            className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 outline-none ring-brand-300/50 focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            required
          />
          <textarea
            placeholder="Γράψε την ανακοίνωση..."
            value={draft.body}
            onChange={(event) => {
              setDraft((prev) => ({ ...prev, body: event.target.value }));
              if (formMessage) setFormMessage('');
            }}
            className="input-glass min-h-[100px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            required
          />

          {formMessage ? <StateNotice state="error" compact message={formMessage} /> : null}

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            aria-busy={isSaving}
          >
            {isSaving ? <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Plus size={14} />}
            {isSaving ? 'Δημοσίευση...' : 'Δημοσίευση Ανακοίνωσης'}
          </button>
        </form>
      ) : null}

      <div className="space-y-3">
        {isSaving && !announcements.length ? (
          <StateNotice state="loading" title="Φόρτωση ανακοινώσεων" message="Περίμενε λίγο να ολοκληρωθεί ο συγχρονισμός." />
        ) : null}

        {!isSaving && !announcements.length ? (
          <StateNotice
            state="empty"
            title="Δεν υπάρχουν ανακοινώσεις"
            message={
              isAdmin
                ? 'Δημοσίευσε την πρώτη ανακοίνωση για να ενημερώσεις την ομάδα.'
                : 'Όταν προστεθεί ανακοίνωση από διαχειριστή, θα εμφανιστεί εδώ.'
            }
          />
        ) : null}

        {announcements.map((announcement) => (
          <article
            key={announcement.id}
            className="rounded-xl border border-slate-300/70 bg-white/55 p-3 shadow-sm dark:border-cyan-300/35 dark:bg-slate-900/45"
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{announcement.title}</h3>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(announcement.id)}
                  className="rounded p-1 text-slate-500 transition hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
                  title="Διαγραφή ανακοίνωσης"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{announcement.body}</p>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {formatAnnouncementDate(announcement.createdAt)}
              {isAdmin && announcement.authorEmail ? ` - ${announcement.authorEmail}` : ''}
            </p>
          </article>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteAnnouncement)}
        title="Διαγραφή ανακοίνωσης"
        message={
          pendingDeleteAnnouncement
            ? `Θέλεις να διαγράψεις την ανακοίνωση "${pendingDeleteAnnouncement.title}";`
            : ''
        }
        details="Η ενέργεια αφαιρεί την ανακοίνωση από το dashboard."
        tone="danger"
        confirmLabel="Ναι, διαγραφή"
        onClose={() => setPendingDeleteId('')}
        onConfirm={confirmDeleteAnnouncement}
        isConfirming={isSaving}
      />
    </section>
  );
}
