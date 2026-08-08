const fs = require('fs')

let content = fs.readFileSync('src/lib/cron-jobs.ts', 'utf8')

// Replace only in ClanMember queries
content = content.replace(/prisma\.clanMember\.findMany\(\{\s+where: \{ isActive: true \}/g, "prisma.clanMember.findMany({\n    where: { isActive: true, joinStatus: 'active' }")

content = content.replace(/where: \{ clanId, isActive: true \}/g, "where: { clanId, isActive: true, joinStatus: 'active' }")

content = content.replace(/prisma\.clanMember\.count\(\{\s+where: \{ isActive: true \}/g, "prisma.clanMember.count({\n        where: { isActive: true, joinStatus: 'active' }")

// For notifyReportReady and notifyInviteReminder in sendNotificationsReminders
// activeMembers = await prisma.clanMember.findMany({ where: { isActive: true }, ...
content = content.replace(/const activeMembers = await prisma\.clanMember\.findMany\(\{\s+where: \{ isActive: true \}/g, "const activeMembers = await prisma.clanMember.findMany({\n    where: { isActive: true, joinStatus: 'active' }")

// Let's just do a string replace of the exact lines if we missed any
// We know these lines were: 294, 378, 445, 532, 621, 703, 974

fs.writeFileSync('src/lib/cron-jobs.ts', content, 'utf8')
console.log('cron-jobs patched')
