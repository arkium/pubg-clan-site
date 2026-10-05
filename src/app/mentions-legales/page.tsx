import { Scale } from 'lucide-react'

import { LegalDocument, LegalFacts, LegalNote, LegalPageShell, LegalText, type LegalSection } from '@/components/legal/LegalLayout'
import {
  CONTACT_EMAIL,
  HOSTING,
  KRAFTON_DISCLAIMER,
  LEGAL_UPDATED_AT,
  PUBLISHER_NAME,
  SITE_DOMAIN,
} from '@/lib/legal/legal-info'

/** Mentions légales et CGU, page publique — docs/features/pages-legales.md (docs/TODO/CU.md, CU_todo.md). */


const TERMS = [
  'Le service est gratuit pour les membres et les clans. Aucune donnée de l’API PUBG n’est vendue ni réservée à un abonnement.',
  'Tu t’engages à ne pas usurper l’identité d’un joueur ou d’un clan.',
  'Les statistiques sont fournies telles quelles, sans garantie d’exactitude ni de disponibilité : elles dépendent de l’API PUBG, dont le site ne maîtrise ni les données ni les coupures.',
  'Le site n’intervient ni dans la vente de clans, ni dans l’EXP ou les objets en jeu.',
  `${PUBLISHER_NAME} peut modifier ces conditions. La date de mise à jour figure en haut de cette page.`,
]

const SECTIONS: LegalSection[] = [
  {
    id: 'editeur',
    title: 'Éditeur',
    content: (
      <LegalFacts
        rows={[
          { label: 'Site', value: SITE_DOMAIN },
          { label: 'Éditeur', value: PUBLISHER_NAME },
          { label: 'Directeur de la publication', value: PUBLISHER_NAME },
          {
            label: 'Contact',
            value: (
              <a href={`mailto:${CONTACT_EMAIL}`} className="app-link">
                {CONTACT_EMAIL}
              </a>
            ),
          },
        ]}
      />
    ),
  },
  {
    id: 'hebergement',
    title: 'Hébergement',
    content: (
      <LegalFacts
        rows={[
          { label: 'Hébergeur', value: HOSTING.name },
          { label: 'Adresse', value: HOSTING.address },
          {
            label: 'Site',
            value: (
              <a href={HOSTING.url} target="_blank" rel="noreferrer" className="app-link">
                {HOSTING.label}
              </a>
            ),
          },
        ]}
      />
    ),
  },
  {
    id: 'marques',
    title: 'Marques et affiliation',
    content: (
      <>
        <LegalNote>{KRAFTON_DISCLAIMER}</LegalNote>
        <LegalText>
          Les noms, icônes d’armes et d’objets, cartes et visuels du jeu restent la propriété de leurs ayants droit. Ils sont
          affichés uniquement pour illustrer les statistiques.
        </LegalText>
        {/* Notifications Discord (docs/features/discord-notifications.md) : marque citée, pas d'affiliation. */}
        <LegalText>
          Discord est une marque de Discord Inc. Le site publie dans les canaux Discord des clans qui l’ont activé, par un
          simple webhook ; il n’est ni affilié à, ni sponsorisé, ni approuvé par Discord Inc.
        </LegalText>
        {/* AI Act, art. 50 : signalement des images générées — docs/features/pages-legales.md §1. */}
        <LegalText>
          Les illustrations des bandeaux et des cartes de l’accueil sont générées par intelligence artificielle (Gemini,
          de Google). Elles ne représentent aucune personne réelle et ne sont pas des captures du jeu.
        </LegalText>
      </>
    ),
  },
  {
    id: 'origine-des-donnees',
    title: 'Origine des données',
    content: (
      <>
        <LegalText>
          Les statistiques, classements et télémétries viennent de l’API officielle PUBG (api.pubg.com), en HTTPS, avec une
          clé développeur standard.
        </LegalText>
        <LegalText>
          La télémétrie est récupérée après la fin de la partie, jamais en direct. Les réponses sont mises en cache pour
          limiter les appels aux serveurs de KRAFTON.
        </LegalText>
      </>
    ),
  },
  {
    id: 'conditions',
    title: 'Conditions d’utilisation',
    content: (
      <ol className="t-body m-0 flex max-w-[42rem] list-decimal flex-col gap-1.5 pl-5 text-gray-700">
        {TERMS.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ol>
    ),
  },
]

export default function LegalNoticePage() {
  return (
    <LegalPageShell
      label="Mentions légales"
      href="/mentions-legales"
      parent={{ href: '/', label: 'Accueil' }}
      image="/clan_banner.jpg"
      icon={Scale}
      title="Mentions légales et CGU"
      subtitle={`Mis à jour le ${LEGAL_UPDATED_AT}`}
    >
      <LegalDocument sections={SECTIONS} />
    </LegalPageShell>
  )
}
