import { NextResponse } from 'next/server'

import { getInternalApiBaseUrl } from '@/lib/internal-api'
import { prisma } from '@/lib/prisma'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function readErrorMessage(response: Response) {
  try {
    const body = await response.json()

    if (typeof body?.error === 'string') {
      return body.error
    }

    if (typeof body?.message === 'string') {
      return body.message
    }
  } catch {
    // Ignore invalid JSON responses.
  }

  return `${response.status} ${response.statusText}`.trim()
}

async function syncMemberMatches(baseUrl: string, memberId: number, memberName: string) {
  const memberMatchesResponse = await fetch(`${baseUrl}/api/members/${memberId}/matches`, {
    cache: 'no-store',
  })

  if (!memberMatchesResponse.ok) {
    throw new Error(await readErrorMessage(memberMatchesResponse))
  }

  const memberMatchesPayload = (await memberMatchesResponse.json()) as {
    playerId?: string
    shard?: string
    recentApiMatchIds?: string[]
  }

  const playerId = typeof memberMatchesPayload.playerId === 'string' ? memberMatchesPayload.playerId : null
  const shard = typeof memberMatchesPayload.shard === 'string' ? memberMatchesPayload.shard : null
  const recentApiMatchIds = Array.isArray(memberMatchesPayload.recentApiMatchIds)
    ? memberMatchesPayload.recentApiMatchIds.filter((matchId): matchId is string => typeof matchId === 'string')
    : []

  if (!playerId || !shard) {
    throw new Error(`Missing sync context for member "${memberName}" (${memberId})`)
  }

  console.info(
    `[Clan Sync] Member "${memberName}" (${memberId}) has ${recentApiMatchIds.length} new matches to import`
  )

  for (const matchId of recentApiMatchIds) {
    const importResponse = await fetch(`${baseUrl}/api/matches/${matchId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        memberId,
        shard,
        playerId,
      }),
    })

    if (!importResponse.ok) {
      throw new Error(await readErrorMessage(importResponse))
    }
  }

  console.info(
    `[Clan Sync] Member "${memberName}" (${memberId}) imported ${recentApiMatchIds.length} matches`
  )

  return {
    memberId,
    memberName,
    importedMatches: recentApiMatchIds.length,
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: {
        id: true,
        name: true,
        members: {
          where: { isActive: true },
          select: {
            id: true,
            displayName: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const startedAt = new Date()
    const baseUrl = getInternalApiBaseUrl()
    const memberResults: Array<{
      memberId: number
      memberName: string
      importedMatches: number
      error?: string
    }> = []

    console.info(
      `[Clan Sync] Starting clan sync for "${clan.name}" (${clan.id}) at ${startedAt.toISOString()}`
    )

    for (const member of clan.members) {
      try {
        const result = await syncMemberMatches(baseUrl, member.id, member.displayName)
        memberResults.push(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown sync error'
        memberResults.push({
          memberId: member.id,
          memberName: member.displayName,
          importedMatches: 0,
          error: message,
        })
        console.error(
          `[Clan Sync] Failed to sync member "${member.displayName}" (${member.id})`,
          error
        )
      }
    }

    const finishedAt = new Date()
    const importedMatches = memberResults.reduce(
      (total, memberResult) => total + memberResult.importedMatches,
      0
    )
    const membersWithErrors = memberResults.filter((memberResult) => memberResult.error)
    const responsePayload = {
      clanId: clan.id,
      clanName: clan.name,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      membersProcessed: clan.members.length,
      importedMatches,
      memberResults,
    }

    console.info(
      `[Clan Sync] Finished clan sync for "${clan.name}" (${clan.id}) at ${finishedAt.toISOString()} - members: ${clan.members.length}, imported matches: ${importedMatches}, errors: ${membersWithErrors.length}`
    )

    if (membersWithErrors.length > 0) {
      return NextResponse.json(responsePayload, { status: 500 })
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('[Clan Sync] Unexpected clan sync failure', error)
    return NextResponse.json(
      { error: 'Failed to synchronize clan matches' },
      { status: 500 }
    )
  }
}
