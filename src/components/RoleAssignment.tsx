'use client'

import { useEffect, useMemo, useState } from 'react'

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

export default function RoleAssignment({
  member,
  currentRole,
  availableRoles,
  onAssign,
  onRevokeOwner,
  isSuperUser = false,
}: RoleAssignmentProps) {
  const [selectedRoleId, setSelectedRoleId] = useState(currentRole.id)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  const selectableRoles = useMemo(() => {
    if (isSuperUser) {
      return availableRoles
    }
    return availableRoles.filter((role) => role.name !== 'Owner')
  }, [availableRoles, isSuperUser])

  useEffect(() => {
    if (!isEditing) {
      setSelectedRoleId(currentRole.id)
    }
  }, [currentRole.id, isEditing])

  const hasChanged = useMemo(() => selectedRoleId !== currentRole.id, [currentRole.id, selectedRoleId])
  const isCurrentOwner = currentRole.name === 'Owner'

  async function handleAssign() {
    if (!hasChanged || submitting) {
      return
    }

    const selectedRole = selectableRoles.find((role) => role.id === selectedRoleId)
    if (!selectedRole) {
      return
    }

    const confirmed = window.confirm(
      `Confirmer le changement de rôle pour ${member.name} : ${currentRole.name} → ${selectedRole.name} ?`
    )
    if (!confirmed) {
      return
    }

    try {
      setSubmitting(true)
      setFeedback(null)
      await onAssign(selectedRoleId)
      setFeedback({ message: 'Rôle mis à jour', tone: 'success' })
      setIsEditing(false)
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Échec de mise à jour',
        tone: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDirectRevokeOwner() {
    if (submitting) return

    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir révoquer le rôle Owner pour ${member.name} ? Le membre deviendra simple Membre.`
    )
    if (!confirmed) return

    try {
      setSubmitting(true)
      setFeedback(null)
      if (onRevokeOwner) {
        await onRevokeOwner()
      } else {
        const memberRole = availableRoles.find((r) => r.name === 'Member')
        if (memberRole) {
          await onAssign(memberRole.id)
        }
      }
      setFeedback({ message: 'Rôle Owner révoqué (passé Membre)', tone: 'success' })
      setIsEditing(false)
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : 'Échec de la révocation',
        tone: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEditing() {
    setFeedback(null)
    setSelectedRoleId(currentRole.id)
    setIsEditing(true)
  }

  function handleCancel() {
    setSelectedRoleId(currentRole.id)
    setFeedback(null)
    setIsEditing(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isEditing ? (
        <>
          <button
            type="button"
            onClick={handleStartEditing}
            disabled={!isSuperUser && isCurrentOwner}
            title={!isSuperUser && isCurrentOwner ? "Seul un SuperUser peut modifier le rôle d'un Owner" : undefined}
            className="app-btn app-btn--xs app-btn--secondary"
          >
            Changer rôle
          </button>
          {isSuperUser && isCurrentOwner ? (
            <button
              type="button"
              onClick={() => void handleDirectRevokeOwner()}
              disabled={submitting}
              className="app-btn app-btn--xs app-btn--danger"
              title="Rétrograder ce membre en simple Membre du clan"
            >
              {submitting ? 'Révocation...' : 'Révoquer Owner'}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <select
            value={selectedRoleId}
            onChange={(event) => setSelectedRoleId(Number(event.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            disabled={submitting}
          >
            {selectableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={!hasChanged || submitting}
            className="app-btn app-btn--xs app-btn--primary"
          >
            {submitting ? 'Mise à jour...' : 'Confirmer'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="app-btn app-btn--xs app-btn--secondary"
          >
            Annuler
          </button>
        </>
      )}
      {feedback ? (
        <span
          className={`text-xs font-medium ${
            feedback.tone === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  )
}
