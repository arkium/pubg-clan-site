'use client'

import { Rocket, Settings } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import ClanOnboardingChecklist from '@/components/clan-onboarding/ClanOnboardingChecklist'
import ClanSettingsBanner, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/ClanSettingsBanner'
import { Callout, ErrorState, ListSkeleton } from '@/components/ui/CharteKit'
import { usePageData } from '@/hooks/usePageData'
import type { ClanOnboarding } from '@/lib/clan-onboarding/build'

/**
 * Mise en route d'un clan (docs/features/inscription-clan.md), selon la charte UI : de la validation à la ligue, chaque
 * étape avec son état et l'endroit où agir, deux actions directes (synchroniser les matchs, mettre la télémétrie en
 * file). Réservée au SuperUser (garde du dossier et de la route). On y arrive par la boîte « À traiter » de l'accueil
 * Plateforme, par le message de validation d'un clan et par la fiche Plateforme du clan.
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function pickOnboarding(payload: unknown): ClanOnboarding | null {
  const candidate = payload as Partial<ClanOnboarding> | null
  return candidate && Array.isArray(candidate.steps) ? (candidate as ClanOnboarding) : null
}

export default function ClanOnboardingPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  const [refresh, setRefresh] = useState(0)
  const url = clanId ? `/api/settings/clans/${clanId}/onboarding${refresh > 0 ? `?r=${refresh}` : ''}` : null
  const { data, loading, error } = usePageData(url, pickOnboarding)

  if (!clanId) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <section className="app-panel">
          <ErrorState message="Identifiant de clan invalide." />
        </section>
      </div>
    )
  }

  const nextTodo = data?.nextTodo ?? null

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <ClanSettingsBanner
        clanId={clanId}
        title="Mise en route"
        subtitle={
          data
            ? `[${data.clan.tag}] ${data.clan.name} : de la validation à la ligue, chaque étape et où agir.`
            : 'De la validation à la ligue : chaque étape et où agir.'
        }
        icon={Rocket}
        image="/clan_banner.jpg"
        currentHref={`/settings/clans/${clanId}/mise-en-route`}
        parent={{ href: `/settings/clans/${clanId}`, label: 'Sous-domaine et suivi' }}
        pills={[...(data ? [<span key="progress"><span className="t-num">{data.done}/{data.total}</span> étapes faites</span>] : []), 'Réservé au SuperUser']}
        action={
          <Link href={`/clans/${clanId}/settings`} className={BANNER_GLASS_BUTTON}>
            <Settings className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            Paramètres du clan
          </Link>
        }
      />

      {!data && loading ? (
        <ListSkeleton rows={4} />
      ) : !data ? (
        <section className="app-panel">
          <ErrorState message={error || 'Mise en route introuvable.'} onRetry={() => setRefresh((value) => value + 1)} testId="onboarding-error" />
        </section>
      ) : (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading || undefined}>
          {nextTodo ? (
            <Callout tone="warn" icon={Rocket} title={`Prochaine étape : ${nextTodo.title}`} testId="onboarding-next">
              {nextTodo.detail}
            </Callout>
          ) : data.clan.state === 'active' ? (
            <Callout tone="sky" icon={Rocket} title="Rien à faire de ton côté" testId="onboarding-next">
              Les étapes restantes avancent seules (nuit, worker) ou sont facultatives.
            </Callout>
          ) : null}
          <ClanOnboardingChecklist onboarding={data} onChanged={() => setRefresh((value) => value + 1)} />
        </div>
      )}
    </div>
  )
}
