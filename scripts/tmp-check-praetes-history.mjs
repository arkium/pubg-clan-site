import fs from 'fs'
import path from 'path'

const PRAETES_ID = 'account.175645e4e90f4cbd8bfc877af5c2dcec'
const CLAN_MEMBER_IDS = new Set([
  'account.06a8fbda55254295ad3bac2ee8b7a2f7',
  'account.2f5ea0be728846f29b196cc9b36b6da5',
  'account.ef9c1887fdd249928da08770a48640aa',
  'account.501d2a56e5fd44fa9c72e1e73b25586f',
  'account.ca3ba3cf5e5d478cb0e91c10090ff718',
  'account.e5e9d2a77a4542e4b26bf6d504029de0',
  'account.298a2b6eaa5a4b9d9f24c63aeb78b723',
  'account.1aa0246aaa454256acb4e5cd54e2ef99',
  'account.79e88bfd3c5c4267a2d6daeec89534ba',
  'account.ecc59a15ef00415aa5fd72a155d425a3',
  'account.4878a647b0974b0eb2f53e58aae53623',
  'account.5577f280630e4209a818a876dd40769a',
  'account.cf8c8266b7754c10a90440048fbcf67e',
  'account.ccda617e49cc47c196701c3ac912acd7',
  'account.0fe1b220c1f54c058dc3684f00bef200',
  'account.804c2b9a1bc84614b730ddc692c738c4',
  'account.308628a1e7984960996e8ae7470c30c0',
  'account.a99d84d6422a40f3b6b80d26f90707ed',
  'account.74234a733e46400db9e7ed8af5247e80',
  'account.d4b5bee7bcfd43d5afe7715b35147fe7',
])

const dir = '.telemetry-captured'
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

let matchesWithPraetes = 0
let matchesAsTeammate = 0
let matchesAsOpponent = 0
const teammateDetails = []

for (const file of files) {
  let data
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  } catch {
    continue
  }

  const matchStart = data.find((e) => e._T === 'LogMatchStart')
  if (!matchStart) continue

  const teamByAccount = new Map()
  for (const entry of matchStart.characters ?? []) {
    const accId = entry.character?.accountId
    if (accId) teamByAccount.set(accId, entry.character.teamId)
  }

  if (!teamByAccount.has(PRAETES_ID)) continue

  matchesWithPraetes += 1
  const praetesTeam = teamByAccount.get(PRAETES_ID)

  let wasTeammate = false
  for (const memberId of CLAN_MEMBER_IDS) {
    if (teamByAccount.has(memberId) && teamByAccount.get(memberId) === praetesTeam) {
      wasTeammate = true
      break
    }
  }

  if (wasTeammate) {
    matchesAsTeammate += 1
    teammateDetails.push(file)
  } else if ([...CLAN_MEMBER_IDS].some((id) => teamByAccount.has(id))) {
    matchesAsOpponent += 1
  }
}

console.log('Matches with Praetes present (captured files only):', matchesWithPraetes)
console.log('  - as teammate (same roster as a clan member):', matchesAsTeammate)
console.log('  - as opponent (different roster):', matchesAsOpponent)
console.log('Teammate match files:', teammateDetails)
