export default function ReportInsights({
  insights,
  recommendations,
}: {
  insights: string[]
  recommendations: string[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Insights</h2>
        {insights.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun insight disponible.</p>
        ) : (
          <ul className="space-y-2 text-sm text-gray-700">
            {insights.map((insight) => (
              <li key={insight} className="rounded bg-blue-50 px-3 py-2">
                {insight}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Recommandations</h2>
        {recommendations.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune recommandation disponible.</p>
        ) : (
          <ul className="space-y-2 text-sm text-gray-700">
            {recommendations.map((recommendation) => (
              <li key={recommendation} className="rounded bg-amber-50 px-3 py-2">
                {recommendation}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
