import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Un membre qui change de clan redevient simple Membre, Owner compris (règle du 2026-11-09, `member-clan-roles.ts`).
 *
 * Les permissions réunissent tous les rôles d'un membre sans regarder leur clan : un rôle gardé de l'ancien clan donnait
 * ses droits dans le nouveau. Le contrôle statique repère tout code qui écrit `clanId` sur un `ClanMember` existant et
 * exige qu'il retire les rôles par `clearRolesForClanChange`.
 */

const mocks = vi.hoisted(() => ({ assignDefaultMemberRole: vi.fn() }))
vi.mock('@/lib/role-service', () => ({ assignDefaultMemberRole: mocks.assignDefaultMemberRole }))

import { assignMemberRoleAfterClanChange, clearRolesForClanChange } from '@/lib/member-clan-roles'

const ROOT = path.resolve(__dirname, '../..')

/** `clanMember.update(…)` / `updateMany(…)` dont le `data` porte `clanId` (forme courte comprise). */
const CLAN_CHANGE_WRITE = /clanMember\.update(?:Many)?\(\{\s*where:[^\n]*\n?(?:[^\n]*\n){0,3}?\s*data:\s*\{[^}]*\bclanId\b/

/** Écritures de `clanId` que l'expression ne voit pas : un `data` passé par une variable. */
const INDIRECT_CLAN_CHANGES = ['src/app/api/members/route.ts']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('rôles retirés au changement de clan', () => {
  beforeEach(() => {
    mocks.assignDefaultMemberRole.mockReset()
  })

  it('retire tous les rôles des membres déplacés, et rien sans membre', async () => {
    const deleteMany = vi.fn()
    const tx = { clanMemberRole: { deleteMany } } as never
    await clearRolesForClanChange(tx, [4, 14])
    expect(deleteMany).toHaveBeenCalledWith({ where: { memberId: { in: [4, 14] } } })
    deleteMany.mockClear()
    await clearRolesForClanChange(tx, [])
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('pose le rôle Membre du nouveau clan ; un échec n’interrompt pas l’appelant', async () => {
    await assignMemberRoleAfterClanChange(4, 16)
    expect(mocks.assignDefaultMemberRole).toHaveBeenCalledWith(4, 16)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.assignDefaultMemberRole.mockRejectedValueOnce(new Error('base indisponible'))
    await expect(assignMemberRoleAfterClanChange(4, 16)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('contrôle statique : tout code qui change le clan d’un membre retire ses rôles', () => {
    const writers = sourceFiles(path.join(ROOT, 'src'))
      .map((file) => ({ file: path.relative(ROOT, file).replaceAll('\\', '/'), text: readFileSync(file, 'utf8') }))
      .filter(({ file, text }) => CLAN_CHANGE_WRITE.test(text) || INDIRECT_CLAN_CHANGES.includes(file))

    // Garde-fou de l'expression elle-même : les chemins connus doivent être repérés.
    expect(writers.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        'src/lib/clan-lifecycle/membership-sync.ts',
        'src/lib/clan-lifecycle/pending-promotions.ts',
        'src/lib/clan-lifecycle/revert.ts',
        'src/lib/clan-archive.ts',
        'src/app/api/members/[id]/route.ts',
        'src/app/api/members/route.ts',
        'src/app/api/settings/opponents/track/route.ts',
        'src/app/api/join/route.ts',
      ])
    )

    const missing = writers.filter(({ text }) => !text.includes('clearRolesForClanChange(')).map(({ file }) => file)
    expect(missing, 'changement de clan sans clearRolesForClanChange').toEqual([])
  })
})
