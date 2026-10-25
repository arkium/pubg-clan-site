import 'dotenv/config'

import { redactCoachText } from '../src/lib/coach/coach-guard'
import { prisma } from '../src/lib/prisma'

/**
 * Masque les adresses e-mail et les liens déjà enregistrés dans les questions et les titres de fil du Coach IA, comme
 * `redactCoachText` le fait depuis le 2026-10-25 avant tout enregistrement (docs/TODO/chatbot-ia.md §6). ÉCRIT dans
 * la base de DATABASE_URL avec `--apply` ; sans lui, simulation.
 *
 *   npx tsx --conditions=react-server scripts/redact-coach-pii.ts            # simulation
 *   npx tsx --conditions=react-server scripts/redact-coach-pii.ts --apply    # masquage
 */

async function main() {
  const apply = process.argv.includes('--apply')
  const suspicious = (field: 'content' | 'title') => ({ OR: ['@', 'http', 'www.', 'mailto:'].map((needle) => ({ [field]: { contains: needle } })) })

  const [messages, conversations] = await Promise.all([
    prisma.coachMessage.findMany({ where: { role: 'user', ...suspicious('content') }, select: { id: true, conversationId: true, content: true } }),
    prisma.coachConversation.findMany({ where: suspicious('title'), select: { id: true, title: true } }),
  ])
  const messageChanges = messages.map((row) => ({ ...row, redacted: redactCoachText(row.content) })).filter((row) => row.redacted !== row.content)
  const titleChanges = conversations.map((row) => ({ ...row, redacted: redactCoachText(row.title) })).filter((row) => row.redacted !== row.title)

  for (const row of messageChanges) console.log(`Question ${row.id} (fil ${row.conversationId}) :\n  ${row.redacted}`)
  for (const row of titleChanges) console.log(`Titre du fil ${row.id} :\n  ${row.redacted}`)
  console.log(`${apply ? 'Masqués' : 'À masquer (simulation, rien n’est écrit)'} : ${messageChanges.length} question(s), ${titleChanges.length} titre(s)`)
  if (!apply) {
    if (messageChanges.length + titleChanges.length > 0) console.log('Relancer avec --apply pour masquer.')
    return
  }
  await prisma.$transaction([
    ...messageChanges.map((row) => prisma.coachMessage.update({ where: { id: row.id }, data: { content: row.redacted } })),
    ...titleChanges.map((row) => prisma.coachConversation.update({ where: { id: row.id }, data: { title: row.redacted } })),
  ])
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
