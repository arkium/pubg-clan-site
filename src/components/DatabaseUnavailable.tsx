import type { DatabaseErrorPresentation } from '@/lib/database-error'

export default function DatabaseUnavailable({
  title,
  description,
  checks,
}: DatabaseErrorPresentation) {
  return (
    <main className="app-container app-main flex min-h-screen items-center justify-center">
      <section className="app-panel w-full max-w-xl p-6 sm:p-8" role="alert">
        <div className="flex items-start gap-4">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-xl font-bold text-amber-800"
            aria-hidden="true"
          >
            !
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-amber-700">Service indisponible</p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        <div className="app-panel-muted mt-6 p-4">
          <h2 className="text-sm font-bold text-slate-900">Points à vérifier</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            {checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href="" className="app-btn app-btn--md app-btn--primary">
            Réessayer
          </a>
          <p className="text-xs text-slate-500">Le diagnostic technique est disponible dans les logs serveur.</p>
        </div>
      </section>
    </main>
  )
}