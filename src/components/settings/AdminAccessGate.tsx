import Link from 'next/link'

import {
  decideClanAccess,
  decideClanFeature,
  decidePlatformAdmin,
  getActiveMemberClanId,
  type AccessDecision,
} from '@/lib/auth/admin-guards'
import type { OwnerFeature } from '@/lib/auth/owner-features'
import { getServerComponentSession } from '@/lib/auth-session'

/**
 * Garde serveur des pages d'administration (docs/TODO/administration.md §6, lot 1) : même décision que les
 * routes d'API, prise avant tout rendu. À poser dans le `layout.tsx` du DOSSIER de chaque page gardée, pas
 * dans un layout parent partagé : un layout ne se ré-exécute pas quand on navigue entre ses pages enfants.
 *
 * Elle ne refuse que ce qu'elle sait refuser : une session VALIDE sans les droits. Sans session valide, la page
 * s'affiche comme avant — le client et l'API, qui répond 401, s'en chargent (Q21). Les données restent protégées
 * par les gardes d'API ; les tests Playwright, qui simulent la session dans le navigateur, gardent leurs pages.
 */
export type AdminAccessRequirement =
  | { kind: 'platform' }
  | { kind: 'clan-owner'; clanId: string }
  | { kind: 'clan-feature'; clanId: string; feature: OwnerFeature }
  /** Adresse sans clan (`/members/add`, accueils `/settings/admin|owner`) : clan du membre actif. */
  | { kind: 'active-clan-feature'; feature: OwnerFeature }
  | { kind: 'active-clan-owner' }

const DENIED_MESSAGES: Record<AdminAccessRequirement['kind'], string> = {
  platform: 'Cette page est réservée au SuperUser.',
  'clan-owner': 'Cette page est réservée à l’Owner de ce clan.',
  'clan-feature': 'Cette page est réservée au SuperUser et, quand elle leur est ouverte, à l’Owner de ce clan.',
  'active-clan-feature': 'Cette page est réservée au SuperUser et, quand elle leur est ouverte, aux Owners.',
  'active-clan-owner': 'Cette page est réservée aux Owners de clan.',
}

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const FORBIDDEN: AccessDecision = { allowed: false, status: 403, error: 'Forbidden' }

async function decide(requirement: AdminAccessRequirement): Promise<AccessDecision> {
  const session = await getServerComponentSession()
  // Sans session (401) ou SuperUser (accepté partout) : la décision ne dépend pas du clan
  if (!session || session.isSuperUser || requirement.kind === 'platform') {
    return decidePlatformAdmin(session)
  }

  switch (requirement.kind) {
    case 'clan-owner':
    case 'clan-feature': {
      const clanId = parseClanId(requirement.clanId)
      if (!clanId) return FORBIDDEN
      return requirement.kind === 'clan-owner'
        ? decideClanAccess(session, clanId, 'owner')
        : decideClanFeature(session, clanId, requirement.feature)
    }
    case 'active-clan-feature':
    case 'active-clan-owner': {
      const clanId = await getActiveMemberClanId(session)
      if (!clanId) return FORBIDDEN
      return requirement.kind === 'active-clan-owner'
        ? decideClanAccess(session, clanId, 'owner')
        : decideClanFeature(session, clanId, requirement.feature)
    }
  }
}

export default async function AdminAccessGate({
  requirement,
  children,
}: {
  requirement: AdminAccessRequirement
  children: React.ReactNode
}) {
  const decision = await decide(requirement)
  // 401 = pas de session valide : on laisse le client et l'API trancher (voir plus haut)
  if (decision.allowed || decision.status === 401) {
    return <>{children}</>
  }

  return (
    <main className="app-container app-main flex-1">
      <section className="app-panel p-6">
        <h1 className="text-xl font-semibold text-gray-900">Accès réservé</h1>
        <p className="mt-2 text-sm text-gray-600">{DENIED_MESSAGES[requirement.kind]}</p>
        <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
          Retour à l’accueil
        </Link>
      </section>
    </main>
  )
}
