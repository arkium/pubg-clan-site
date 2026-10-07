'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import AddMemberPanel from '@/components/clan-settings/AddMemberPanel'
import MembersRolesPanel from '@/components/clan-settings/MembersRolesPanel'
import PendingRequestsPanel from '@/components/clan-settings/PendingRequestsPanel'

/**
 * Gestion des membres d'un clan, en onglets (docs/TODO/administration.md, lot 3b) : `?tab=demandes` (ex-
 * `/clans/[clanId]/members/pending`), `?tab=ajout` (ex-`/members/add`), sinon membres, rôles et invitations.
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function MembersSettingsContent() {
  const params = useParams()
  const tab = useSearchParams().get('tab')
  const clanId = parseClanId(params.clanId)

  if (tab === 'demandes') return <PendingRequestsPanel />
  if (tab === 'ajout' && clanId) return <AddMemberPanel clanId={clanId} />
  return <MembersRolesPanel />
}

export default function ClanMembersSettingsPage() {
  return (
    <Suspense fallback={null}>
      <MembersSettingsContent />
    </Suspense>
  )
}
