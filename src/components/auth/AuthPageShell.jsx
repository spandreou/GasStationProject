export default function AuthPageShell({ title, subtitle, children, footer = 'Powered by HomelabShare' }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,#f8fbff_0%,#edf6ff_48%,#f8fafc_100%)] px-4 py-8 text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="pointer-events-none absolute left-[-12%] top-[-16%] h-72 w-72 rounded-full bg-cyan-200/55 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18%] right-[-12%] h-80 w-80 rounded-full bg-blue-200/60 blur-3xl" />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-6 text-center">
          <a href="/" className="inline-flex items-center gap-3 text-left">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg shadow-slate-300">
              GS
            </span>
            <span>
              <span className="block text-sm font-black text-slate-950">GasStation Shift Manager</span>
              <span className="block text-xs font-semibold text-slate-500">SaaS Portal</span>
            </span>
          </a>
        </div>

        <div className="w-full rounded-3xl border border-white/80 bg-white/85 p-6 text-slate-950 shadow-2xl shadow-slate-200/80 backdrop-blur sm:p-7">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <p className="mt-6 text-center text-xs font-semibold text-slate-500">{footer}</p> : null}
      </section>
    </main>
  );
}
