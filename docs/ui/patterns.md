# Patterns de création de pages

Ce document décrit les conventions obligatoires pour créer de nouvelles pages dans l'application.

---

## Structure de base obligatoire

Toute nouvelle page de données doit être un Client Component et respecter la structure suivante :

```tsx
'use client'

import { useParams, useRouter } from 'next/navigation'
import ClanSectionNav from '@/components/ClanSectionNav'

function parseClanId(value: string | string[] | undefined): number | null {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MyPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = parseClanId(params.clanId)

  // Redirection si paramètre invalide
  useEffect(() => {
    if (clanId === null) {
      router.replace('/clans')
    }
  }, [clanId, router])

  if (clanId === null) return null

  return (
    <main className="app-container app-main flex-1">
      <ClanSectionNav clanId={clanId} />
      {/* contenu */}
    </main>
  )
}
```

---

## Parser les paramètres d'URL

Les paramètres de route Next.js sont des chaînes ou des tableaux. Toujours valider et convertir explicitement.

```typescript
// Pour un clanId (entier positif)
function parseClanId(value: string | string[] | undefined): number | null {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

// Pour un memberId (identique)
function parseMemberId(value: string | string[] | undefined): number | null {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}
```

---

## Panneaux et surfaces

| Besoin | Classe | Fond |
|---|---|---|
| Page complète | `app-container app-main` | Fond de page (`--page-surface`) |
| Panneau principal | `app-panel` | Blanc / slate (selon thème) |
| Panneau secondaire ou info | `app-panel-muted` | Légèrement teinté |

Ne jamais utiliser `bg-white`, `bg-slate-800`, `border-gray-200` directement. Toujours passer par `.app-panel` ou les classes Tailwind remappées (voir `docs/ui/themes.md`).

---

## Navigation de section

Inclure la navigation en haut de chaque page de contenu :

- Pages sous `/clans/[clanId]/` : `<ClanSectionNav clanId={clanId} />`
- Pages sous `/members/[id]/` : `<MemberSectionNav memberId={memberId} />`
- Pages de settings admin : `<SettingsSectionNav section="admin-menu" />`
- Pages de settings owner : `<SettingsSectionNav section="owner-menu" />`

---

## Pattern de fetch dans un composant client

```typescript
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)
const [data, setData] = useState<MyType | null>(null)

useEffect(() => {
  if (!clanId) return
  let cancelled = false

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clans/${clanId}/my-endpoint`, { cache: 'no-store' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error ?? 'Erreur serveur')
      if (!cancelled) setData(payload)
    } catch (err) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  void run()
  return () => { cancelled = true }
}, [clanId])
```

Points importants :

- Le flag `cancelled` évite les mises à jour d'état sur un composant démonté.
- `cache: 'no-store'` est à utiliser pour les données dynamiques (stats, matchs, statuts).
- Toujours gérer les trois états : chargement, erreur, contenu.

---

## États standards à gérer

```tsx
if (loading) {
  return (
    <main className="app-container app-main">
      <div className="app-panel p-8 text-center text-gray-500">Chargement...</div>
    </main>
  )
}

if (error) {
  return (
    <main className="app-container app-main">
      <div className="app-panel p-8 text-center text-red-600">{error}</div>
    </main>
  )
}

if (!data) {
  return (
    <main className="app-container app-main">
      <div className="app-panel p-8 text-center text-gray-500">Aucune donnée disponible.</div>
    </main>
  )
}
```

---

## Espacement et rythme

- Espacement vertical principal : fourni par `.app-main` (`padding-block: 2rem`). Ne pas ajouter `py-8` en doublon.
- Entre blocs de contenu : `gap-4` à `gap-6` selon la densité.
- Ne pas mélanger `py-6` et `py-10` sans raison contextuelle explicite (pages auth, états vides, etc.).
- Padding interne d'un panneau : `p-4` ou `p-6`.

---

## Tri dans les tableaux

Le tri côté client s'implémente avec un état `sortKey` / `sortDir` et une fonction de comparaison :

```typescript
type SortDirection = 'asc' | 'desc'
type SortKey = 'kills' | 'damage' | 'winRate' | 'matches'

const [sortKey, setSortKey] = useState<SortKey>('kills')
const [sortDir, setSortDir] = useState<SortDirection>('desc')

function handleSortClick(key: SortKey) {
  if (key === sortKey) {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  } else {
    setSortKey(key)
    setSortDir('desc')
  }
}

function sortLabel(key: SortKey) {
  if (key !== sortKey) return ''
  return sortDir === 'asc' ? ' ↑' : ' ↓'
}
```

Pour les tableaux avec pagination (ex : `MatchHistory`), le tri est délégué côté serveur via les paramètres `sortBy` et `sortDirection` dans la requête API. Les clés de tri supportées sont documentées dans `docs/ui/tables.md`.

---

## Checklist nouvelle page

- [ ] `'use client'` en tête de fichier si composant client
- [ ] Structure `app-container` + `app-main` sur l'élément `<main>`
- [ ] Navigation de section incluse (`ClanSectionNav`, `MemberSectionNav` ou `SettingsSectionNav`)
- [ ] Panneaux avec `.app-panel` / `.app-panel-muted` (aucune couleur hardcodée)
- [ ] Parser et valider les paramètres d'URL (`parseClanId`, `parseMemberId`)
- [ ] Redirection si paramètre invalide ou utilisateur non autorisé
- [ ] États gérés : chargement, erreur, vide, contenu
- [ ] Couleurs de texte et de fond via classes Tailwind remappées ou tokens CSS
- [ ] Rendu vérifié en thème clair et sombre
- [ ] Rendu mobile vérifié (overflow, navigation dropdown, espacement)
- [ ] Contenu centré et borné à 1024 px sur desktop

---

## Routes API — Pattern handler

```typescript
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params  // toujours await params en Next.js 16+
  const id = Number(clanId)
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'clanId invalide' }, { status: 400 })
  }

  // ... logique métier

  return Response.json({ data })
}
```

Toujours utiliser `Response` (Web API standard), pas `NextResponse`. Toujours `await params` — c'est une `Promise` en Next.js 16.
