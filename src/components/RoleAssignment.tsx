'use client'

import { ShieldCheck, ShieldOff } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ChoiceMenu, ConfirmDialog } from '@/components/ui/CharteKit'

type ClanMemberLite = {
  id: number
  name: string
}

type ClanRoleLite = {
  id: number
  name: string
}

type RoleAssignmentProps = {
  member: ClanMemberLite
  currentRole: ClanRoleLite
  availableRoles: ClanRoleLite[]
  onAssign: (roleId: number) => Promise<void> | void
  onRevokeOwner?: () => Promise<void> | void
  isSuperUser?: boolean
}

const ROLE_LABELS: Record<string, string> = { Owner: 'Owner', Member: 'Membre' }

/**
 * Rôle d'un membre dans son clan, selon la charte UI (docs/ui/index.html) : menu de choix de la charte et confirmation
 * en modale (jamais de boîte du navigateur). Nommer ou retirer un Owner reste au SuperUser.
 */
export default function RoleAssignment({
  member,
  currentRole,
  availableRoles,
  onAssign,
  onRevokeOwner,
  isSuperUser = false,
}: RoleAssignmentProps) {
  const [draftRoleId, setDraftRoleId] = useState<number | null>(null)
  const [confirming, setConfirming] = useState<'assign' | 'revoke' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  const selectableRoles = useMemo(() => {
    if (isSuperUser) return availableRoles
    return availableRoles.filter((role) => role.name !== 'Owner')
  }, [availableRoles, isSuperUser])

  const isEditing = draftRoleId !== null
  const selectedRoleId = draftRoleId ?? currentRole.id
  const selectedRole = selectableRoles.find((role) => role.id === selectedRoleId)
  const hasChanged = selectedRoleId !== currentRole.id
  const isCurrentOwner = currentRole.name === 'Owner'
  const label = (name: string) => ROLE_LABELS[name] ?? name

  async function run(action: () => Promise<void> | void, success: string, failure: string) {
    try {
      setSubmitting(true)
      setFeedback(null)
      await action()
      setFeedback({ message: success, tone: 'success' })
      setDraftRoleId(null)
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : failure, tone: 'error' })
    } finally {
      setSubmitting(false)
      setConfirming(null)
    }
  }

  function revokeOwner() {
    return run(
      async () => {
        if (onRevokeOwner) {
          await onRevokeOwner()
          return
        }
        const memberRole = availableRoles.find((role) => role.name === 'Member')
        if (memberRole) await onAssign(memberRole.id)
      },
      'Rôle Owner retiré : le joueur est maintenant Membre.',
      'Échec du retrait du rôle Owner'
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isEditing ? (
        <>
          <button
            type="button"
            onClick={() => {
              setFeedback(null)
              setDraftRoleId(currentRole.id)
            }}
            disabled={!isSuperUser && isCurrentOwner}
            title={!isSuperUser && isCurrentOwner ? 'Seul un SuperUser peut modifier le rôle d’un Owner' : undefined}
            className="app-btn app-btn--xs app-btn--secondary gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Changer le rôle
          </button>
          {isSuperUser && isCurrentOwner ? (
            <button
              type="button"
              onClick={() => setConfirming('revoke')}
              disabled={submitting}
              className="app-btn app-btn--xs app-btn--danger gap-1.5"
              title="Rétrograder ce joueur en simple Membre du clan"
            >
              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting ? 'Retrait…' : 'Retirer Owner'}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <div className="w-40">
            <ChoiceMenu
              label={`Rôle de ${member.name}`}
              value={String(selectedRoleId)}
              onChange={(value) => setDraftRoleId(Number(value))}
              options={selectableRoles.map((role) => ({ value: String(role.id), label: label(role.name) }))}
            />
          </div>
          <button
            type="button"
            onClick={() => setConfirming('assign')}
            disabled={!hasChanged || submitting}
            className="app-btn app-btn--xs app-btn--primary"
          >
            {submitting ? 'Mise à jour…' : 'Valider'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftRoleId(null)
              setFeedback(null)
            }}
            disabled={submitting}
            className="app-btn app-btn--xs app-btn--secondary"
          >
            Annuler
          </button>
        </>
      )}
      {feedback ? (
        <span className={`text-xs font-semibold ${feedback.tone === 'success' ? 't-pos' : 't-neg'}`} role="status">
          {feedback.message}
        </span>
      ) : null}

      {confirming === 'assign' && selectedRole ? (
        <ConfirmDialog
          icon={ShieldCheck}
          title={`Changer le rôle de ${member.name} ?`}
          confirmLabel="Changer le rôle"
          tone="primary"
          busy={submitting}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(() => onAssign(selectedRole.id), 'Rôle mis à jour.', 'Échec de la mise à jour')}
        >
          {label(currentRole.name)} → {label(selectedRole.name)}.
        </ConfirmDialog>
      ) : null}
      {confirming === 'revoke' ? (
        <ConfirmDialog
          icon={ShieldOff}
          title={`Retirer le rôle Owner de ${member.name} ?`}
          confirmLabel="Retirer Owner"
          tone="danger"
          busy={submitting}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void revokeOwner()}
        >
          Le joueur devient simple Membre du clan et perd l’accès aux paramètres du clan.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
