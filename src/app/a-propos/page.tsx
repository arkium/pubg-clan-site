import type { Metadata } from 'next'
import { Ban, ExternalLink, FileLock2, Info, MonitorX, RadioTower, ShieldCheck, type LucideIcon } from 'lucide-react'

import { LegalDocument, LegalNote, LegalPageShell, LegalText, type LegalSection } from '@/components/legal/LegalLayout'
import {
  KRAFTON_DISCLAIMER,
  PUBG_API_TERMS_URL,
  PUBG_RULES_URL,
  PUBLISHER_NAME,
  PUBLISHER_URL,
  SITE_DOMAIN,
} from '@/lib/legal/legal-info'

/** À propos, page publique — docs/features/pages-legales.md (analyse de conformité : docs/TODO/CU.md). */

export const metadata: Metadata = { title: `À propos · ${SITE_DOMAIN}` }

const NOT_DONE: Array<{ icon: LucideIcon; text: string }> = [
  { icon: MonitorX, text: 'Aucun programme installé sur ton PC.' },
  { icon: FileLock2, text: 'Aucune lecture du jeu ni interception réseau.' },
  { icon: RadioTower, text: 'Aucune donnée en direct pendant la partie.' },
  { icon: Ban, text: 'Aucune vente de clan, d’EXP ou d’objets.' },
]

const DATA_FACTS = [
  { label: 'Source', text: 'API officielle PUBG, en HTTPS' },
  { label: 'Moment', text: 'Après la fin de chaque partie' },
  { label: 'Quotas', text: 'File d’attente et cache pour ménager les serveurs' },
]

const REFERENCES = [
  { href: PUBG_RULES_URL, label: 'Règles de conduite PUBG' },
  { href: PUBG_API_TERMS_URL, label: 'Conditions de l’API PUBG' },
  { href: PUBLISHER_URL, label: 'arkium.eu' },
]

const SECTIONS: LegalSection[] = [
  {
    id: 'ce-que-le-site-ne-fait-pas',
    title: 'Ce que le site ne fait pas',
    content: (
      <>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {NOT_DONE.map(({ icon: Icon, text }) => (
            <li key={text} className="app-panel-muted t-body flex items-start gap-2.5 px-3 py-2.5 text-gray-900">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
        {/* Pas de promesse « aucun risque de bannissement » : le site ne peut pas la garantir (docs/features/pages-legales.md). */}
        <p className="t-body m-0 flex items-center gap-2 rounded-[10px] bg-[var(--game-pos-soft)] px-3 py-2.5 font-semibold text-gray-900">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--game-pos)]" aria-hidden="true" />
          Le site ne touche pas au jeu : il n’entre dans aucun des cas interdits par les règles de KRAFTON.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'D’où viennent les données',
    content: (
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
        {DATA_FACTS.map((fact) => (
          <li key={fact.label} className="app-panel-muted flex flex-col gap-1 px-3 py-2.5">
            <span className="t-label">{fact.label}</span>
            <span className="t-body text-gray-900">{fact.text}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'affiliation',
    title: 'Affiliation et références',
    content: (
      <>
        <LegalNote>{KRAFTON_DISCLAIMER}</LegalNote>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {REFERENCES.map((reference) => (
            <li key={reference.href}>
              <a href={reference.href} target="_blank" rel="noreferrer" className="app-btn app-btn--secondary app-btn--sm gap-1.5">
                {reference.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </>
    ),
  },
]

export default function AboutPage() {
  return (
    <LegalPageShell
      label="À propos"
      href="/a-propos"
      parent={{ href: '/', label: 'Accueil' }}
      image="/chickendinnerfr.jpg"
      icon={Info}
      title="À propos"
      subtitle="Projet communautaire, gratuit et non officiel"
    >
      <LegalDocument
        sections={SECTIONS}
        intro={
          <div className="app-panel flex flex-col items-start gap-2.5 p-4 sm:p-5">
            <span className="app-meta-pill gap-1.5 uppercase tracking-[0.08em]">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Projet non officiel
            </span>
            <LegalText>
              {SITE_DOMAIN} est un hub communautaire et gratuit pour suivre les performances des clans PUBG, centraliser les
              rapports et organiser la vie du clan. Il est créé par {PUBLISHER_NAME}.
            </LegalText>
          </div>
        }
      />
    </LegalPageShell>
  )
}
