export default function AuthPageShell({ title, subtitle, children }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
      <section className="glass-panel w-full rounded-2xl p-5 text-slate-900 dark:text-white">
        <h1 className="text-2xl font-black">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{subtitle}</p> : null}
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}
