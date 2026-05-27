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
}

export default function RoleAssignment({
  member,
  currentRole,
  availableRoles,
  onAssign,
}: RoleAssignmentProps) {
  const [selectedRoleId, setSelectedRoleId] = useState(currentRole.id)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!isEditing) {
      setSelectedRoleId(currentRole.id)
    }
  }, [currentRole.id, isEditing])

  const hasChanged = useMemo(() => selectedRoleId !== currentRole.id, [currentRole.id, selectedRoleId])

  async function handleAssign() {
    if (!hasChanged || submitting) {
      return
    }

    const selectedRole = availableRoles.find((role) => role.id === selectedRoleId)
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
      setFeedback('')
      await onAssign(selectedRoleId)
      setFeedback('Rôle mis à jour')
      setIsEditing(false)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Échec de mise à jour')
    } finally {
      setSubmitting(false)
    }
  }

  function handleStartEditing() {
    setFeedback('')
    setSelectedRoleId(currentRole.id)
    setIsEditing(true)
  }

  function handleCancel() {
    setSelectedRoleId(currentRole.id)
    setFeedback('')
    setIsEditing(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!isEditing ? (
        <button
          type="button"
          onClick={handleStartEditing}
          className="rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          Changer rôle
        </button>
      ) : (
        <>
          <select
            value={selectedRoleId}
            onChange={(event) => setSelectedRoleId(Number(event.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            disabled={submitting}
          >
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={!hasChanged || submitting}
            className="rounded border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Mise à jour...' : 'Confirmer'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
        </>
      )}
      {feedback ? <span className="text-xs text-gray-600">{feedback}</span> : null}
    </div>
  )
}
