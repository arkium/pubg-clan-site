import {
  ChevronRight,
  Database,
  Globe,
  MessageSquare,
  Monitor,
  Settings,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import SelectedClanSync from '@/components/settings/SelectedClanSync'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { decideClanFeature, decidePlatformAdmin } from '@/lib/auth/admin-guards'
import type { OwnerFeature } from '@/lib/auth/owner-feature-catalog'
import { getServerComponentSession } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

/**
 * Accueil « Paramètres du clan » (docs/TODO/administration.md §5.2, lot 3b), selon la charte UI (docs/ui/index.html) :
 * bandeau photo, puis deux sections.
 *
 * - **Gestion du clan** — les outils que l'Owner du clan peut ouvrir : même décision que les gardes d'API
 *   (`decideClanFeature`), délégation aux Owners comprise.
 * - **SuperUser** — visible et accessible au seul SuperUser : télémétrie du clan (jamais déléguée, 2026-10-08),
 *   sous-domaine et suivi du clan (fiche Plateforme `/settings/clans/[clanId]`). Chaque carte porte le badge SuperUser.
 */

type HubTile = {
  href: string
  title: string
  description: string
  icon: LucideIcon
  /** Surtitre : le domaine de l'outil. */
  group?: string
  /** Couleur de l'icône et de son fond (jetons de jeu de la charte). */
  color: string
  background: string
  superUser?: boolean
}

type OwnerTile = HubTile & { feature: OwnerFeature }

function ownerTiles(clanId: number): OwnerTile[] {
  const base = `/clans/${clanId}/settings`
  return [
    {
      feature: 'clan-members',
      href: `${base}/members`,
      group: 'Membres',
      title: 'Membres et invitations',
      description: 'Membres du clan, invitations, demandes d’adhésion et ajout de joueurs.',
      icon: Users,
      color: 'var(--game-pos)',
      background: 'var(--game-pos-soft)',
    },
    {
      feature: 'clan-announcements',
      href: `${base}/login-welcome`,
      group: 'Annonces',
      title: 'Accueil login',
      description: 'Écran d’accueil montré aux joueurs du clan avant leur connexion.',
      icon: Monitor,
      color: 'var(--game-sky)',
      background: 'var(--game-sky-soft)',
    },
    {
      feature: 'clan-announcements',
      href: `${base}/discord`,
      group: 'Annonces',
      title: 'Notifications Discord',
      description: 'Victoires Top 1 et résultats de tournoi publiés dans un canal Discord.',
      icon: MessageSquare,
      color: 'var(--game-sky)',
      background: 'var(--game-sky-soft)',
    },
    {
      feature: 'clan-competition',
      href: `${base}/tournaments`,
      group: 'Compétition',
      title: 'Tournois',
      description: 'Créer, modifier et synchroniser les tournois organisés par le clan.',
      icon: Trophy,
      color: 'var(--game-gold)',
      background: 'var(--game-gold-soft)',
    },
  ]
}

function superUserTiles(clanId: number): HubTile[] {
  const violet = { color: 'var(--theme-superuser-nav-text)', background: 'var(--theme-superuser-nav-bg)', superUser: true }
  return [
    {
      href: `/clans/${clanId}/settings/data`,
      title: 'Données et télémétrie',
      description: 'Santé des données, soirées et outils de télémétrie du clan.',
      icon: Database,
      ...violet,
    },
    {
      href: `/settings/clans/${clanId}`,
      title: 'Sous-domaine et suivi du clan',
      description: 'Adresse en sous-domaine du clan, suivi ou arrêt du suivi par le site.',
      icon: Globe,
      ...violet,
    },
  ]
}

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function SuperUserBadge() {
  return <span className="member-role-badge member-role-badge--superuser shrink-0">SuperUser</span>
}

function Tile({ tile }: { tile: HubTile }) {
  const Icon = tile.icon
  return (
    <Link href={tile.href} className="app-panel flex items-start gap-3 p-3.5 transition-colors hover:bg-gray-50">
      <span
        className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: tile.background }}
      >
        <Icon className="h-[18px] w-[18px]" style={{ color: tile.color }} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {tile.group ? <span className="t-label">{tile.group}</span> : null}
        <span className="t-card-title">{tile.title}</span>
        <span className="t-meta">{tile.description}</span>
      </span>
      {tile.superUser ? (
        <SuperUserBadge />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 self-center text-gray-500" aria-hidden="true" />
      )}
    </Link>
  )
}

export default async function ClanSettingsHub({ params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: rawClanId } = await params
  const clanId = parseClanId(rawClanId)
  if (!clanId) redirect('/clans')

  const [session, clan] = await Promise.all([
    getServerComponentSession(),
    prisma.clan.findUnique({ where: { id: clanId }, select: { name: true } }),
  ])
  const clanName = clan?.name ?? `Clan #${clanId}`

  const candidates = ownerTiles(clanId)
  const features = [...new Set(candidates.map((tile) => tile.feature))]
  const decisions = await Promise.all(
    features.map(async (feature) => [feature, (await decideClanFeature(session, clanId, feature)).allowed] as const)
  )
  const allowed = new Set(decisions.filter(([, ok]) => ok).map(([feature]) => feature))
  const ownerSection = candidates.filter((tile) => allowed.has(tile.feature))
  const isSuperUser = decidePlatformAdmin(session).allowed

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (couleurs des tuiles d'icône).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <SelectedClanSync clanId={clanId} />
      <NavigationTrail
        currentLabel="Paramètres du clan"
        currentHref={`/clans/${clanId}/settings`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />

      <header
        className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/city.jpg')`, backgroundPosition: 'center 45%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title text-white drop-shadow-md">Paramètres du clan</h1>
          </div>
          <p className="text-[13px] text-white/80 drop-shadow-md">
            Membres, annonces et compétition de <span className="font-semibold text-white">{clanName}</span>.
          </p>
        </div>
      </header>

      {!session ? (
        <p className="app-panel-muted t-body px-3.5 py-3 text-gray-700">
          <Link href={`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings`)}`} className="app-link font-semibold">
            Connectez-vous
          </Link>{' '}
          pour accéder aux paramètres du clan.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2.5" aria-labelledby="clan-settings-owner">
            <h2 id="clan-settings-owner" className="t-section-title m-0">
              Gestion du clan
            </h2>
            {ownerSection.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {ownerSection.map((tile) => (
                  <Tile key={tile.href} tile={tile} />
                ))}
              </div>
            ) : (
              <p className="app-panel-muted t-body px-3.5 py-3 text-gray-700">
                Aucun outil du clan n’est actuellement ouvert à votre profil.
              </p>
            )}
          </section>

          {isSuperUser ? (
            <section className="flex flex-col gap-2.5" aria-labelledby="clan-settings-superuser">
              <h2 id="clan-settings-superuser" className="t-section-title m-0">
                Réservé au SuperUser
              </h2>
              <p className="t-meta m-0">Visible et accessible au seul SuperUser : les Owners ne voient pas cette section.</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {superUserTiles(clanId).map((tile) => (
                  <Tile key={tile.href} tile={tile} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
