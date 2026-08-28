import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const features = [
  {
    icon: CalendarClock,
    title: 'Smart shift planning',
    body: 'Generate weekly and monthly schedules with rotation rules, absences, fixed days off and manual overrides.',
  },
  {
    icon: BarChart3,
    title: 'Operational visibility',
    body: 'Track employee hours, public schedules, announcements and export-ready programme history from one place.',
  },
  {
    icon: ShieldCheck,
    title: 'Tenant access control',
    body: 'Admin access is based on Firebase uid, tenant membership, active status and role.',
  },
];

export default function CentralLandingPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#eef6ff_44%,#f8fafc_100%)] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 font-black text-slate-950">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-300">
              SO
            </span>
            <span>ShiftOryx</span>
          </a>
          <nav className="flex items-center gap-2">
            <a
              href="mailto:support@homelabshare.gr"
              className="hidden rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-slate-300 sm:inline-flex"
            >
              Support
            </a>
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-300 hover:bg-slate-800"
            >
              Sign In
              <ArrowRight size={16} />
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-700 shadow-sm">
              <Sparkles size={14} />
              SaaS operations portal
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[1.02] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Manage all your fuel stations from one platform.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Central login, tenant selection and secure station dashboards for schedule generation,
              employee visibility and programme exports.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-cyan-200 hover:bg-cyan-700"
              >
                Sign In
                <ArrowRight size={18} />
              </a>
              <a
                href="mailto:support@homelabshare.gr?subject=ShiftOryx%20Demo"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm hover:border-slate-300"
              >
                Request Demo
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/80 bg-white/75 p-4 shadow-2xl shadow-slate-200 backdrop-blur">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Platform</p>
                  <h2 className="mt-1 text-xl font-black">Tenant access overview</h2>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">
                  Ready
                </span>
              </div>
              <div className="mt-6 grid gap-3">
                {features.map(({ icon: Icon, title, body }) => (
                  <article key={title} className="rounded-2xl border border-cyan-300/25 bg-white/5 p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-200">
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3 className="font-black">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-300">{body}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 py-5 text-sm text-slate-500">
          Powered by HomelabShare
        </footer>
      </section>
    </main>
  );
}
