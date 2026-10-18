/** Données structurées schema.org, déjà sérialisées et échappées par `toJsonLd` (src/lib/seo/structured-data.ts). */
export default function JsonLd({ json }: { json: string | null }) {
  if (!json) return null
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
