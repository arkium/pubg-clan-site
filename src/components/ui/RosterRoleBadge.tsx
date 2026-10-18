import { rosterRole, type RosterRoleId } from '@/lib/member-roster'

/**
 * Badge du rôle dominant d'un joueur (Fragger, Medic, Ghost) : pastille pleine à la couleur du rôle, encre sombre —
 * lisible dans les deux thèmes, jamais en texte coloré sur fond clair (docs/ui/index.html, « Cartes membres » et « Rôles »).
 * Né sur la fiche soldat (`MemberCard` : rôle dominant depuis le début du suivi, `dominantRole`), repris par la page
 * Joueurs (docs/features/joueurs.md : le plus haut des rôles de la période et du mode, `playerStyle`). La page choisit
 * le rôle ; le badge ne fait que l'afficher.
 */
export default function RosterRoleBadge({ role, className = '' }: { role: RosterRoleId; className?: string }) {
  const meta = rosterRole(role)
  return (
    <span
      className={`shrink-0 rounded-[5px] px-1.5 py-px text-[11px] font-black uppercase tracking-[0.08em] text-slate-950 ${className}`.trim()}
      style={{ backgroundColor: meta.color }}
      data-testid="roster-role-badge"
      data-role={role}
    >
      {meta.label}
    </span>
  )
}
