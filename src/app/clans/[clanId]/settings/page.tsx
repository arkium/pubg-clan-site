import { MessageSquare, Monitor, Settings, Trophy, Users } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import SelectedClanSync from '@/components/settings/SelectedClanSync'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { decideClanFeature } from '@/lib/auth/admin-guards'
import type { OwnerFeature } from '@/lib/auth/owner-feature-catalog'
import { getServerComponentSession } from '@/lib/auth-session'

/**
 * Accueil « Mon clan » (docs/TODO/administration.md §5.2, lot 3b) : rendu serveur, une carte par outil que la
 * personne peut ouvrir — même décision que les gardes d'API (`decideClanFeature`), délégation aux Owners comprise.
 * Le sous-domaine et l'arrêt de suivi, réglages de plateforme, sont sur la fiche du clan côté Plateforme.
 */

type HubCard = { feature: OwnerFeature; path: string; title: string; description: string; icon: ReactNode }

const GROUPS: Array<{ title: string; cards: HubCard[] }> = [
  {
    title: 'Membres',
    cards: [
      {
        feature: 'clan-members',
        path: 'settings/members',
        title: 'Membres et invitations',
        description: 'Membres du clan, invitations, demandes d’adhésion et ajout de joueurs.',
        icon: <Users className="h-6 w-6" aria-hidden />,
      },
    ],
  },
  {
    title: 'Apparence et annonces',
    cards: [
      {
        feature: 'clan-announcements',
        path: 'settings/login-welcome',
        title: 'Accueil login',
        description: 'Écran d’accueil montré aux joueurs du clan avant leur connexion.',
        icon: <Monitor className="h-6 w-6" aria-hidden />,
      },
      {
        feature: 'clan-announcements',
        path: 'settings/discord',
        title: 'Notifications Discord',
        description: 'Victoires Top 1 et résultats de tournoi publiés dans un canal Discord.',
        icon: <MessageSquare className="h-6 w-6" aria-hidden />,
      },
    ],
  },
  {
    title: 'Compétition',
    cards: [
      {
        feature: 'clan-competition',
        path: 'settings/tournaments',
        title: 'Tournois',
        description: 'Créer, modifier et synchroniser les tournois organisés par le clan.',
        icon: <Trophy className="h-6 w-6" aria-hidden />,
      },
    ],
  },
]

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default async function ClanSettingsHub({ params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: rawClanId } = await params
  const clanId = parseClanId(rawClanId)
  if (!clanId) redirect('/clans')

  const session = await getServerComponentSession()
  const features = [...new Set(GROUPS.flatMap((group) => group.cards.map((card) => card.feature)))]
  const decisions = await Promise.all(
    features.map(async (feature) => [feature, (await decideClanFeature(session, clanId, feature)).allowed] as const)
  )
  const allowed = new Set(decisions.filter(([, ok]) => ok).map(([feature]) => feature))
  const groups = GROUPS.map((group) => ({ ...group, cards: group.cards.filter((card) => allowed.has(card.feature)) })).filter(
    (group) => group.cards.length > 0
  )

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <SelectedClanSync clanId={clanId} />
      <NavigationTrail
        currentLabel="Paramètres du clan"
        currentHref={`/clans/${clanId}/settings`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />

      <section className="app-panel p-6">
        <SettingsPageHeader title="Paramètres du clan" subtitle="Membres, annonces et compétition de votre clan." />

        {!session ? (
          <p className="mt-6 text-sm text-gray-600">
            <Link href={`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings`)}`} className="font-semibold underline">
              Connectez-vous
            </Link>{' '}
            pour accéder aux paramètres du clan.
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-6 text-sm text-gray-600">Aucun outil du clan n’est actuellement ouvert à votre profil.</p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="mt-8">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">{group.title}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.cards.map((card) => (
                  <Link
                    key={card.path}
                    href={`/clans/${clanId}/${card.path}`}
                    className="app-panel-muted flex flex-col gap-2 p-5 transition-colors hover:bg-gray-100"
                  >
                    <span className="text-[var(--theme-ui-accent-text)]">{card.icon}</span>
                    <span className="text-base font-semibold text-gray-900">{card.title}</span>
                    <span className="text-sm text-gray-500">{card.description}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {session?.isSuperUser ? (
        <section className="app-panel p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Plateforme</h2>
          <Link
            href={`/settings/clans/${clanId}`}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--theme-ui-accent-text)] underline"
          >
            <Settings className="h-4 w-4" aria-hidden />
            Sous-domaine et suivi du clan
          </Link>
        </section>
      ) : null}
    </main>
  )
}
