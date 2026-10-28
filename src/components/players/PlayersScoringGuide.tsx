import { ArrowUpDown, Calculator, GitCompareArrows, Swords } from 'lucide-react'
import type { ReactNode } from 'react'

import { RoleTile } from '@/components/players/PlayersUi'
import CalculationHelp from '@/components/ui/CalculationHelp'
import { METHODOLOGY_PATH } from '@/lib/legal/legal-info'
import { MAX_COMPARED, PLAYER_ROLES, PLAYERS_MIN_MATCHES, PLAYERS_MIN_RANKED, ROLE_MIN_SAMPLE } from '@/lib/players-ranking'

/**
 * Guide de calcul de la page Joueurs, en bas de page (demande du 2026-10-18), atteint par le lien « Comment c'est
 * calculé ? » du haut de page (`#guide-calcul`). Barre commune `CalculationHelp` (2026-10-28) : repliée par défaut mais
 * dans le HTML ; les liens de la page l'ouvrent avant d'y descendre (état tenu par la page). Les seuils viennent des
 * constantes du calcul (`players-ranking.ts`) : le guide ne peut pas annoncer un autre chiffre que celui appliqué.
 * Détail : docs/features/joueurs.md §3.
 */

export const SCORING_GUIDE_ID = 'guide-calcul'

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="app-panel-muted flex flex-col gap-2 p-3.5 sm:p-4">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-gray-900">
        {icon}
        {title}
      </h3>
      <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-gray-700">{children}</div>
    </div>
  )
}

const ICON = 'h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]'

export default function PlayersScoringGuide({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  return (
    <CalculationHelp
      id={SCORING_GUIDE_ID}
      open={open}
      onToggle={onToggle}
      methodologyHref={`${METHODOLOGY_PATH}#roles`}
      className="scroll-mt-[160px]"
      testId="players-scoring-guide"
    >
      <div className="flex flex-col gap-4">
        <p className="t-meta">Toutes les valeurs viennent des parties enregistrées par le site ; recalcul toutes les 5 minutes.</p>

        <div className="grid gap-3 md:grid-cols-2">
          <Block icon={<Swords className={ICON} aria-hidden="true" />} title="Les parties qui comptent">
            <p>
              Les parties <b>normales</b> jouées avec au moins un autre membre de ton clan : les <b>parties de clan</b>, comme pour la Ligue.
              Une partie en solo ou avec des inconnus ne compte pas.
            </p>
            <p>
              Période : la semaine du lundi au dimanche, le mois civil, ou depuis le début. Mode : le mode PUBG de la partie (Duo, Squad), FPP
              compris.
            </p>
          </Block>

          <Block icon={<Calculator className={ICON} aria-hidden="true" />} title="Le classement">
            <p>
              Chaque valeur est une <b>moyenne par partie</b> : dégâts, kills, knocks, réanimations, temps de survie.
            </p>
            <p>
              Classé à partir de <b>{PLAYERS_MIN_MATCHES} parties</b> sur la période ; en dessous, « en qualification ». Le classement
              s’affiche dès {PLAYERS_MIN_RANKED} joueurs classés. À égalité : le plus de parties, puis le pseudo.
            </p>
          </Block>

          <Block icon={<ArrowUpDown className={ICON} aria-hidden="true" />} title="Les flèches">
            <p>
              Rang de la <b>période précédente</b> (la semaine ou le mois d’avant), pour le même critère et le même mode : ▲ places gagnées, ▼
              places perdues, « = » même rang, « nouv. » pas classé la fois d’avant. Aucune flèche pour « Tous ».
            </p>
          </Block>

          <Block icon={<GitCompareArrows className={ICON} aria-hidden="true" />} title="Le comparateur">
            <p>
              Jusqu’à {MAX_COMPARED} joueurs ou moyennes de clan. La couronne marque la meilleure valeur parmi les joueurs à {PLAYERS_MIN_MATCHES}{' '}
              parties ou plus ; les autres restent indicatifs.
            </p>
            <p>
              Positionnement et armes : moyennes de la période <b>tous modes</b>. Coups de zone bleue : chaque dégât de la zone reçu. Duels :
              depuis le début, tous modes. Lecture : les mesures où un joueur se détache des autres d’au moins 5 %.
            </p>
          </Block>
        </div>

        <div className="flex flex-col gap-2.5">
          <h3 className="text-sm font-extrabold text-gray-900">Les rôles, score sur 100</h3>
          <p className="text-[13px] leading-relaxed text-gray-700">
            Pour chaque mesure, on regarde la part des joueurs classés que tu dépasses (100 : devant tous, 50 : au milieu), entre{' '}
            <b>tous les clans</b> suivis ; le score du rôle est la moyenne de ces parts. Une mesure sur moins de {ROLE_MIN_SAMPLE} kills ou{' '}
            {ROLE_MIN_SAMPLE} fermetures de zone n’entre pas dans le calcul (« — »). À ne pas confondre avec le style de jeu d’un joueur, mesuré
            face au meilleur de son clan.
          </p>
          <p className="text-[13px] leading-relaxed text-gray-700">
            Le <b>badge</b> à côté du pseudo (Fragger, Medic ou Ghost) est le plus haut de ces trois scores sur la période et le mode choisis ; il
            ne change pas avec le critère de tri. Tireur à distance n’a pas de badge.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PLAYER_ROLES.map((role) => (
              <li key={role.id} className="flex items-center gap-2.5 text-[13px] text-gray-700">
                <RoleTile role={role.id} size="sm" />
                <span>
                  <b className="text-gray-900">{role.label}</b> — {role.hint}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </CalculationHelp>
  )
}
