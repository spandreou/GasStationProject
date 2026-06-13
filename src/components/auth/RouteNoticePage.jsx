import AuthPageShell from './AuthPageShell';

export default function RouteNoticePage({
  title,
  subtitle,
  message,
  actionHref = '/',
  actionLabel = 'Επιστροφή',
}) {
  return (
    <AuthPageShell title={title} subtitle={subtitle}>
      <div className="space-y-3">
        <p className="rounded-lg border border-cyan-300/35 bg-slate-950/35 px-3 py-2 text-sm">{message}</p>
        <a href={actionHref} className="inline-flex rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600">
          {actionLabel}
        </a>
      </div>
    </AuthPageShell>
  );
}
