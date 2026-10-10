'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  Globe,
  Mail,
  Plug,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted } from '@/components/settings/AdminPageStates'
import { Callout, ErrorState, SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import { useAuthSession } from '@/hooks/useAuthSession'
import type { SiteConfigItem, SiteConfigSectionId, SiteConfigStatus, SiteConfiguration } from '@/lib/site-config'

/**
 * Configuration du site (SuperUser) — tout ce que le `.env` règle, contrôlé et expliqué : statut, valeur (aucun secret
 * en clair), effet, correction. Sortie de la section « Configuration » de Tâches planifiées le 2026-10-10. Lecture
 * seule : un .env se modifie sur le serveur, puis on redémarre les services. Données : GET /api/settings/site-config.
 */

const SECTION_ICONS: Record<SiteConfigSectionId, LucideIcon> = {
  identity: Globe,
  security: ShieldCheck,
  email: Mail,
  pubg: Plug,
  tasks: CalendarClock,
  telemetry: Activity,
  database: Database,
  obsolete: Trash2,
}

const STATUS_TAG: Record<SiteConfigStatus, { tone: Tone; label: string }> = {
  error: { tone: 'neg', label: 'Erreur' },
  warning: { tone: 'warn', label: 'À revoir' },
  info: { tone: 'sky', label: 'Info' },
  ok: { tone: 'pos', label: 'OK' },
}

/** Page en lecture seule : le bandeau de titre a une hauteur fixe, la précision vit dans l'encadré récapitulatif. */
const READ_ONLY_NOTE = 'Lecture seule : modifier le .env sur le serveur, puis redémarrer les services.'

function plural(count: number, word: string) {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

function ConfigRow({ item }: { item: SiteConfigItem }) {
  const tag = STATUS_TAG[item.status]
  return (
    <li className="flex flex-col gap-1.5 border-t border-gray-200 py-3 first:border-t-0 first:pt-0 last:pb-0" data-testid={`config-${item.key}`} data-status={item.status}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <Tag tone={tag.tone}>{tag.label}</Tag>
          <span className="t-card-title">{item.label}</span>
        </span>
        <span className="t-body min-w-0 break-words text-right font-semibold text-gray-900">{item.value}</span>
      </div>
      {item.variable ? <code className="t-meta break-all font-mono">{item.variable}</code> : null}
      <p className="t-meta m-0">{item.effect}</p>
      {item.fix ? (
        <p className="t-body m-0 flex items-start gap-2 text-gray-700">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
          <span>{item.fix}</span>
        </p>
      ) : null}
    </li>
  )
}

export default function SiteConfigurationPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()
  const [configuration, setConfiguration] = useState<SiteConfiguration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!loading && !authenticated) router.replace('/login?redirect=/settings/configuration')
  }, [authenticated, loading, router])

  // Patron de chargement du dépôt : fonction async déclarée dans l'effet, rechargement par jeton.
  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) return
    let cancelled = false

    async function load() {
      try {
        setError(null)
        const response = await fetch('/api/settings/site-config', { cache: 'no-store' })
        if (!response.ok) throw new Error('Impossible de lire la configuration du site.')
        const payload = (await response.json()) as SiteConfiguration
        if (!cancelled) setConfiguration(payload)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setRefreshing(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, reloadToken])

  function reload() {
    setRefreshing(true)
    setReloadToken((token) => token + 1)
  }

  if (loading || (!authenticated && !error)) return <AdminPageLoading />
  if (!isSuperUser) return <AdminPageRestricted />
  if (!configuration) {
    return error ? (
      <div className={ADMIN_PAGE_CLASS}>
        <ErrorState message={error} onRetry={reload} />
      </div>
    ) : (
      <AdminPageLoading />
    )
  }

  const toFix = configuration.sections.flatMap((section) =>
    section.items.filter((item) => item.status === 'error').map((item) => ({ section: section.id, item }))
  )

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Configuration du site"
        subtitle="Le .env du serveur, réglage par réglage : statut, effet, correction."
        icon={SlidersHorizontal}
        image="/sauvetage1.jpg"
        currentHref="/settings/configuration"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <span key="state" className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  configuration.errors > 0 ? 'var(--game-neg)' : configuration.warnings > 0 ? 'var(--game-warn)' : 'var(--game-pos)',
              }}
              aria-hidden="true"
            />
            {configuration.errors > 0 || configuration.warnings > 0
              ? [configuration.errors > 0 ? plural(configuration.errors, 'erreur') : null, configuration.warnings > 0 ? plural(configuration.warnings, 'alerte') : null]
                  .filter(Boolean)
                  .join(' · ')
              : 'Tout est en ordre'}
          </span>,
          'Réservé au SuperUser',
        ]}
        action={
          <button type="button" onClick={reload} disabled={refreshing} className={BANNER_GLASS_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Recharger
          </button>
        }
      />

      {error ? <Callout tone="warn" icon={AlertTriangle} title="Rechargement impossible">{error}</Callout> : null}

      {toFix.length > 0 ? (
        <Callout tone="warn" icon={AlertTriangle} title={`${plural(toFix.length, 'erreur')} à corriger`} testId="config-errors">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {toFix.map(({ section, item }) => (
              <li key={item.key}>
                <a href={`#config-${section}`} className="app-link">
                  {item.label}
                </a>
                {item.variable ? <span className="font-mono text-xs"> ({item.variable})</span> : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-1.5">{READ_ONLY_NOTE}</p>
        </Callout>
      ) : (
        <Callout tone="sky" icon={CheckCircle2} title="Aucune erreur" testId="config-no-error">
          {configuration.warnings > 0
            ? `${plural(configuration.warnings, 'réglage')} à revoir, marqué${configuration.warnings > 1 ? 's' : ''} « À revoir » ci-dessous.`
            : 'Tous les réglages contrôlés sont en ordre.'}{' '}
          {READ_ONLY_NOTE}
        </Callout>
      )}

      {configuration.sections.map((section) => (
        <SectionCard
          key={section.id}
          id={`config-${section.id}`}
          icon={SECTION_ICONS[section.id]}
          title={section.title}
          meta={section.description}
          testId={`config-section-${section.id}`}
          // À droite du titre dès 640 px ; en dessous, sous la liste (sinon la description tient dans une colonne étroite).
          aside={
            section.link ? (
              // Visibilité sur un conteneur : `.app-btn` (hors couches Tailwind) l'emporterait sur `hidden`.
              <span className="hidden sm:inline-flex">
                <Link href={section.link.href} className="app-btn app-btn--sm app-btn--secondary">
                  {section.link.label}
                </Link>
              </span>
            ) : undefined
          }
        >
          <ul className="m-0 flex list-none flex-col p-0">
            {section.items.map((item) => (
              <ConfigRow key={item.key} item={item} />
            ))}
          </ul>
          {section.link ? (
            <div className="sm:hidden">
              <Link href={section.link.href} className="app-btn app-btn--sm app-btn--secondary">
                {section.link.label}
              </Link>
            </div>
          ) : null}
        </SectionCard>
      ))}
    </div>
  )
}
