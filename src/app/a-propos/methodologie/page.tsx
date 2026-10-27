import Link from 'next/link'
import { Calculator } from 'lucide-react'

import { LegalDocument, LegalFacts, LegalPageShell, LegalText, type LegalSection } from '@/components/legal/LegalLayout'
import { LEAGUE_MATCH_TYPE_OPTIONS } from '@/lib/clan-league'
import { GEO_PROTECTED_RETENTION_DAYS, GEO_RETENTION_DAYS } from '@/lib/geo-retention'
import { METHODOLOGY_PATH, METHODOLOGY_UPDATED_AT, SITE_DOMAIN } from '@/lib/legal/legal-info'
import { getLeagueSettings } from '@/lib/league-settings-service'
import { SESSION_DAY_START_HOUR } from '@/lib/match-sessions'
import { DISTINCTION_MIN_MATCHES } from '@/lib/distinctions'
import { ZONE_READING_MIN_MATCHES } from '@/lib/zone-reading/zone-reading-analysis'
import { figuresDate } from '@/lib/site-figures'

/**
 * Méthodologie, page publique (docs/TODO/geo-seo-propositions.md, 4.2) : comment se calcule chaque chiffre du site. Les
 * réglages du Power score sont lus en direct (`getLeagueSettings`) : le texte suit un changement fait sur
 * /settings/league. Chaque formule renvoie à son module de calcul, seule source de vérité :
 * Power score `src/lib/clan-league.ts`, rôles du clan `src/lib/pubg-telemetry/period-aggregates.ts`, rôles entre clans
 * `src/lib/players-ranking.ts`, distinctions `src/lib/distinctions.ts`, soirée `src/lib/match-sessions.ts`, conservation des
 * positions `src/lib/geo-retention.ts` (appliquée par `purgeExpiredGeolocation`).
 */

const integer = new Intl.NumberFormat('fr-FR')
const updated = figuresDate(new Date(`${METHODOLOGY_UPDATED_AT}T12:00:00Z`))

function placementScale(points: readonly number[]) {
  return points.map((value, index) => `${index === 0 ? '1er' : `${index + 1}e`} : ${value}`).join(' · ')
}

export default async function MethodologyPage() {
  const league = await getLeagueSettings()
  const thresholds = league.minMatches.official

  const sections: LegalSection[] = [
    {
      id: 'power-score',
      title: 'Power score de la Ligue des clans',
      content: (
        <>
          <LegalText>
            Le Power score classe les clans sur la qualité de leurs parties, pas sur leur volume. Chaque partie rapporte
            d’abord des points de placement ; le score brut d’un clan est la moyenne de ses parties :
          </LegalText>
          <LegalFacts
            rows={[
              {
                label: 'Score brut',
                value: `points de placement × ${integer.format(league.placementWeight)} + dégâts × ${integer.format(league.damageWeight)} + kills × ${integer.format(league.killWeight)} + knocks × ${integer.format(league.knockWeight)}`,
              },
              { label: 'Points de placement', value: `${placementScale(league.placementPoints)} · au-delà : 0` },
              {
                label: 'Power score',
                value: `(n × score brut + ${integer.format(league.priorMatches)} × score moyen de la ligue) ÷ (n + ${integer.format(league.priorMatches)}), n = parties du clan`,
              },
              {
                label: 'Classement',
                value: `à partir de ${thresholds.week} parties sur la semaine, ${thresholds.month} sur le mois, ${thresholds.all} depuis le début (parties normales)`,
              },
            ]}
          />
          <LegalText>
            Avec peu de parties, le score reste proche de la moyenne de la ligue ; plus un clan joue, plus son propre niveau
            pèse. Une seule partie gagnée ne suffit donc plus à prendre la tête. Chaque type de partie a son propre
            classement : {LEAGUE_MATCH_TYPE_OPTIONS.map((option) => option.label).join(', ')}.
          </LegalText>
        </>
      ),
    },
    {
      id: 'roles',
      title: 'Fragger, Medic, Ghost : deux mesures différentes',
      content: (
        <>
          <LegalText>
            <strong>Dans le style de jeu d’un clan</strong>, chaque rôle se mesure par rapport au meilleur joueur du clan sur
            la période, qui vaut 100 % :
          </LegalText>
          <LegalFacts
            rows={[
              { label: 'Fragger', value: '(kills × 8 + knocks × 4 + dégâts ÷ 150) par partie' },
              { label: 'Medic', value: 'réanimations par partie' },
              { label: 'Ghost', value: 'touches de zone bleue par partie, inversées : le joueur le plus touché vaut 0 %' },
            ]}
          />
          <LegalText>
            <strong>Sur la page Joueurs</strong>, entre tous les clans, chaque rôle est la moyenne des centiles de ses mesures
            parmi les joueurs classés : Fragger (dégâts, kills, knocks), Medic (réanimations, assistances, survie), Ghost
            (dans le cercle à chaque fermeture de zone), Tireur à distance (distance des kills, headshots). Le badge d’un
            joueur est son rôle le plus haut sur la période et le mode affichés ; « Tireur à distance » n’a pas de badge.
          </LegalText>
        </>
      ),
    },
    {
      id: 'distinctions',
      title: 'Distinctions',
      content: (
        <LegalFacts
          rows={[
            { label: 'Top killer, plus de dégâts', value: 'le total de la période' },
            { label: 'Win rate, K/M', value: `à partir de ${DISTINCTION_MIN_MATCHES} parties ; K/M = kills par partie` },
            { label: 'MVP', value: 'kills ÷ meilleur total + dégâts ÷ meilleur total + win rate' },
          ]}
        />
      ),
    },
    {
      id: 'soirees-periodes',
      title: 'Soirées et périodes',
      content: (
        <LegalFacts
          rows={[
            {
              label: 'Soirée',
              value: `de ${SESSION_DAY_START_HOUR} h à ${SESSION_DAY_START_HOUR} h, heure de Paris : une partie jouée à 1 h 30 compte dans la soirée de la veille`,
            },
            { label: 'Semaine', value: 'du lundi 0 h au dimanche 23 h 59' },
            { label: 'Mois', value: 'le mois civil' },
            { label: 'Lecture de zone', value: `30 ou 90 derniers jours ; une carte n’est analysée qu’au-delà de ${integer.format(ZONE_READING_MIN_MATCHES)} parties` },
          ]}
        />
      ),
    },
    {
      id: 'donnees',
      title: 'Données : ce que garde PUBG, ce que garde le site',
      content: (
        <>
          <LegalText>
            Tout vient de l’API officielle PUBG (KRAFTON), importé après la fin de chaque partie : rien n’est lu pendant la
            partie. Le site suit les comptes des clans inscrits ; la télémétrie de leurs parties nomme aussi les autres
            joueurs du lobby, dont il garde le pseudo et le clan (kill feed, Némésis).
          </LegalText>
          <LegalText>
            <strong>Chez PUBG</strong>, tout s’efface au bout d’environ 14 jours :
          </LegalText>
          <LegalFacts
            rows={[
              {
                label: 'Parties et télémétrie',
                value: 'la liste des parties d’un joueur, le détail de chaque partie et son fichier de télémétrie restent environ 14 jours, puis PUBG les supprime',
              },
              { label: 'Partie manquée', value: 'une partie que le site n’a pas importée à temps est perdue pour de bon' },
            ]}
          />
          <LegalText>
            <strong>Sur le site</strong>, ce qui a été importé reste, sauf les positions sur la carte :
          </LegalText>
          <LegalFacts
            rows={[
              { label: 'Import', value: 'chaque nuit, et à la demande quand un clan arrive ; la télémétrie est analysée dans la foulée, en file d’attente' },
              {
                label: 'Fichier de télémétrie',
                value: 'jamais conservé tel quel : le site en extrait les positions, tirs, dégâts, kills, réanimations et véhicules, puis jette le reste',
              },
              {
                label: 'Résultats et événements',
                value: 'gardés partie par partie, sans limite de durée, jusqu’à une demande de retrait : classements et débriefings durent bien après les 14 jours de PUBG',
              },
              {
                label: 'Positions sur la carte',
                value: `replay 2D et tracés : ${GEO_RETENTION_DAYS} jours, ${GEO_PROTECTED_RETENTION_DAYS} pour un Top 1 ou une partie custom (tournois compris), puis effacés`,
              },
              { label: 'Quotas', value: 'quelques appels par minute, mis en file d’attente : un résultat peut arriver avec un peu de retard' },
              { label: 'Parties analysées', value: 'une analyse par escouade suivie et par partie ; la vitrine ne compte que les parties normales et classées' },
            ]}
          />
          <LegalText>
            Ton compte, tes droits et le retrait de tes données :{' '}
            <Link href="/confidentialite" className="app-link">
              Confidentialité
            </Link>
            .
          </LegalText>
        </>
      ),
    },
  ]

  return (
    <LegalPageShell
      label="Méthodologie"
      href={METHODOLOGY_PATH}
      parent={{ href: '/a-propos', label: 'À propos' }}
      image="/chickendinnerfr.jpg"
      icon={Calculator}
      title="Méthodologie"
      subtitle={`Comment ${SITE_DOMAIN} calcule ses chiffres`}
    >
      <LegalDocument
        sections={sections}
        intro={
          <p className="t-meta m-0">
            Mise à jour le <time dateTime={updated.iso}>{updated.label}</time>.
          </p>
        }
      />
    </LegalPageShell>
  )
}
