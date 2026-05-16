'use client'

import { useMemo, useState } from 'react'

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
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')

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
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Échec de mise à jour')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
        className="rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Mise à jour...' : 'Changer rôle'}
      </button>
      {feedback ? <span className="text-xs text-gray-600">{feedback}</span> : null}
    </div>
  )
}
