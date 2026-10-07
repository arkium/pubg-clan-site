import Link from 'next/link'
import { EyeOff, Mail, Shield, X } from 'lucide-react'

import { LegalDocument, LegalFacts, LegalPageShell, LegalText, type LegalSection } from '@/components/legal/LegalLayout'
import { CONTACT_EMAIL, DATA_PROTECTION_AUTHORITY, LEGAL_UPDATED_AT, PRIVACY_REQUEST_PATH } from '@/lib/legal/legal-info'

/**
 * Confidentialité, page publique — docs/features/pages-legales.md. Chaque ligne a été vérifiée contre le code
 * (schéma Prisma, cookies, stockage du navigateur) le 05/10/2026, journal d'administration ajouté le 07/10/2026 : à revoir
 * quand le site collecte une donnée nouvelle.
 */


const DATA_ROWS = [
  { data: 'Pseudo PUBG (IGN), account_id', source: 'API PUBG, public', usage: 'Profil, classements' },
  { data: 'Matchs, statistiques, télémétrie (positions sur la carte comprises)', source: 'API PUBG, après la partie', usage: 'Stats, débriefings, ligue' },
  { data: 'Joueurs croisés en partie : pseudo, account_id, clan', source: 'Télémétrie des parties', usage: 'Kill feed, Némésis' },
  { data: 'Compte du site : e-mail, mot de passe chiffré, nom affiché, lien d’avatar', source: 'Toi, à l’inscription', usage: 'Connexion, invitations' },
  { data: 'E-mail de contact d’une demande de clan', source: 'Toi, sur la page Rejoindre', usage: 'Réponse à la demande' },
  { data: 'Commentaires sur la carte des ressources', source: 'Toi', usage: 'Validation des points' },
  { data: 'Résultats publiés sur Discord : pseudos de l’escouade, kills, dégâts, carte', source: 'Matchs et tournois du clan', usage: 'Canal Discord du clan, si un admin l’active' },
  { data: 'Demande de retrait : pseudo, e-mail, motif', source: 'Toi, par le formulaire', usage: 'Traitement de ta demande' },
  { data: 'Actions d’administration : compte, clan, action, résultat', source: 'Les outils d’administration que tu utilises', usage: 'Suivi des outils partagés, réservé au SuperUser' },
]

const NOT_COLLECTED = ['Nom civil ou adresse postale', 'Coordonnées bancaires', 'Adresse IP associée à un profil de jeu']

const COLUMNS = 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-4'

const SECTIONS: LegalSection[] = [
  {
    id: 'donnees-traitees',
    title: 'Données traitées',
    content: (
      <>
        <div className="app-table-shell overflow-hidden">
          <div className={`app-table-head hidden px-3.5 py-2 md:grid ${COLUMNS}`} aria-hidden="true">
            <span className="t-label">Donnée</span>
            <span className="t-label">Source</span>
            <span className="t-label">Usage</span>
          </div>
          <ul className="m-0 list-none p-0">
            {DATA_ROWS.map((row) => (
              <li key={row.data} className={`app-table-row grid gap-0.5 px-3.5 py-2.5 last:border-b-0 ${COLUMNS}`}>
                <span className="t-body t-strong text-gray-900">{row.data}</span>
                <span className="t-body text-gray-500">
                  <span className="md:sr-only">Source : </span>
                  {row.source}
                </span>
                <span className="t-body text-gray-700">
                  <span className="md:sr-only">Usage : </span>
                  {row.usage}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <LegalText muted>
          L’avatar est l’adresse d’une image que tu choisis : les navigateurs qui l’affichent la chargent depuis le site qui
          l’héberge.
        </LegalText>
        <LegalText muted>
          Les messages Discord partent chez Discord Inc. (États-Unis), qui applique sa propre politique de confidentialité.
          Un admin du clan peut couper l’envoi à tout moment.
        </LegalText>
      </>
    ),
  },
  {
    id: 'non-collecte',
    title: 'Ce qu’on ne collecte pas',
    content: (
      <>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {NOT_COLLECTED.map((item) => (
            <li key={item} className="t-body flex items-center gap-2 text-gray-900">
              <X className="h-4 w-4 shrink-0 text-[var(--theme-ui-negative)]" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <LegalText muted>
          Comme tout serveur web, l’hébergement garde des journaux techniques (adresse IP, page demandée) pour sa sécurité.
          Ils ne sont jamais reliés à un profil. Aucune donnée n’est vendue ni cédée.
        </LegalText>
      </>
    ),
  },
  {
    id: 'finalite',
    title: 'Finalité et conservation',
    content: (
      <LegalFacts
        rows={[
          { label: 'Finalité', value: 'Afficher les statistiques de clan et de joueur, les classements et les débriefings.' },
          {
            label: 'Base légale',
            value: 'Intérêt légitime pour les statistiques de jeu publiques ; exécution du service pour le compte du site.',
          },
          {
            label: 'Conservation',
            value:
              'Statistiques : tant que le joueur est suivi par un clan du site. Compte : jusqu’à sa suppression. Connexion : 7 jours. Journal des actions d’administration : 12 mois. Effacement possible à tout moment sur demande.',
          },
        ]}
      />
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies et stockage',
    content: (
      <>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <code className="t-meta font-mono">pubg_clan_session</code>
            <span className="t-body min-w-0 flex-1 text-gray-700">Garde ta connexion, 7 jours.</span>
            <span className="t-label t-pos rounded-[6px] bg-[var(--game-pos-soft)] px-2 py-0.5">Nécessaire</span>
          </li>
          <li className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            <code className="t-meta font-mono">localStorage</code>
            <span className="t-body min-w-0 flex-1 text-gray-700">
              Thème clair ou sombre, clan choisi, menu replié, période : restent dans ton navigateur.
            </span>
            <span className="app-meta-pill">Préférence</span>
          </li>
        </ul>
        <LegalText muted>Aucun outil de mesure d’audience ni traceur publicitaire : rien à accepter.</LegalText>
      </>
    ),
  },
  {
    id: 'droits',
    title: 'Tes droits',
    content: (
      <>
        <LegalText>
          Tu peux demander l’accès, la correction, l’effacement de tes données ou t’opposer à leur affichage. Même si ton
          pseudo est public dans le jeu, tu peux demander qu’il soit masqué ou que ton historique soit purgé du site.
        </LegalText>
        <LegalText>
          On te répond sous un mois au plus. Tu peux aussi adresser une réclamation à l’
          <a href={DATA_PROTECTION_AUTHORITY.url} target="_blank" rel="noreferrer" className="app-link">
            {DATA_PROTECTION_AUTHORITY.name}
          </a>
          , ou à l’autorité de ton pays.
        </LegalText>
        <div className="flex flex-wrap gap-2">
          {/* Seul chemin vers le formulaire : il n'est pas dans le footer. */}
          <Link href={PRIVACY_REQUEST_PATH} className="app-btn app-btn--primary app-btn--md gap-1.5">
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            Retirer mes données
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="app-btn app-btn--secondary app-btn--md gap-1.5">
            <Mail className="h-4 w-4" aria-hidden="true" />
            Écrire à {CONTACT_EMAIL}
          </a>
        </div>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalPageShell
      label="Confidentialité"
      href="/confidentialite"
      parent={{ href: '/', label: 'Accueil' }}
      image="/recall.jpg"
      icon={Shield}
      title="Confidentialité"
      subtitle={`Ce que le site sait de toi, et comment le retirer · Mis à jour le ${LEGAL_UPDATED_AT}`}
    >
      <LegalDocument sections={SECTIONS} />
    </LegalPageShell>
  )
}
