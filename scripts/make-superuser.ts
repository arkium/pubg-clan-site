#!/usr/bin/env node

/**
 * CLI pour gérer les comptes SuperUser
 *
 * Usages:
 *   npm run make-superuser -- --grant email@example.com
 *   npm run make-superuser -- --revoke email@example.com
 *   npm run make-superuser -- --list
 */

import 'dotenv/config'
import { prisma } from '@/lib/prisma'

const args = process.argv.slice(2)
const grantIndex = args.indexOf('--grant')
const revokeIndex = args.indexOf('--revoke')
const listFlag = args.includes('--list')

async function grantSuperUser(email: string) {
  const user = await prisma.userAccount.findUnique({ where: { email } })
  if (!user) {
    console.error(`Erreur : aucun compte trouvé pour ${email}`)
    process.exit(1)
  }
  if (user.isSuperUser) {
    console.log(`${email} est déjà SuperUser.`)
    return
  }
  await prisma.userAccount.update({ where: { email }, data: { isSuperUser: true } })
  console.log(`✓ ${email} est maintenant SuperUser.`)
}

async function revokeSuperUser(email: string) {
  const user = await prisma.userAccount.findUnique({ where: { email } })
  if (!user) {
    console.error(`Erreur : aucun compte trouvé pour ${email}`)
    process.exit(1)
  }
  if (!user.isSuperUser) {
    console.log(`${email} n'est pas SuperUser.`)
    return
  }
  await prisma.userAccount.update({ where: { email }, data: { isSuperUser: false } })
  console.log(`✓ Statut SuperUser révoqué pour ${email}.`)
}

async function listSuperUsers() {
  const users = await prisma.userAccount.findMany({
    where: { isSuperUser: true },
    select: { id: true, email: true, displayName: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  if (users.length === 0) {
    console.log('Aucun SuperUser configuré.')
    return
  }
  console.log(`\n${users.length} SuperUser(s) :\n`)
  for (const u of users) {
    console.log(`  [${u.id}] ${u.email}  (${u.displayName ?? 'sans nom'})  statut: ${u.status}`)
  }
  console.log('')
}

async function main() {
  if (listFlag) {
    await listSuperUsers()
    return
  }

  if (grantIndex !== -1) {
    const email = args[grantIndex + 1]
    if (!email) {
      console.error('Usage : --grant email@example.com')
      process.exit(1)
    }
    await grantSuperUser(email)
    return
  }

  if (revokeIndex !== -1) {
    const email = args[revokeIndex + 1]
    if (!email) {
      console.error('Usage : --revoke email@example.com')
      process.exit(1)
    }
    await revokeSuperUser(email)
    return
  }

  console.log('Usage :')
  console.log('  npm run make-superuser -- --grant email@example.com')
  console.log('  npm run make-superuser -- --revoke email@example.com')
  console.log('  npm run make-superuser -- --list')
  process.exit(1)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
