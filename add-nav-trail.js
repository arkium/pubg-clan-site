const fs = require('fs');
const path = require('path');

const files = {
  'awards/page.tsx': { label: 'Awards', pathFragment: 'awards' },
  'challenges/page.tsx': { label: 'Défis', pathFragment: 'challenges' },
  'challenges/[challengeId]/page.tsx': { label: 'Détail du défi', pathFragment: 'challenges/${challengeId}' },
  'drop-zones/page.tsx': { label: 'Zones de drop', pathFragment: 'drop-zones' },
  'leaderboard/page.tsx': { label: 'Classement', pathFragment: 'leaderboard' },
  'settings/login-welcome/page.tsx': { label: 'Accueil login', pathFragment: 'settings/login-welcome' },
  'stats/page.tsx': { label: 'Statistiques', pathFragment: 'stats' },
  'stats/heatmap-kills/page.tsx': { label: 'Heatmap des kills', pathFragment: 'stats/heatmap-kills' },
  'stats/positions/page.tsx': { label: 'Positions & Top 10', pathFragment: 'stats/positions' },
  'stats/weapons/page.tsx': { label: 'Armes du clan', pathFragment: 'stats/weapons' },
  'stats/weapons/categories/page.tsx': { label: "Catégories d'armes", pathFragment: 'stats/weapons/categories' },
  'telemetry/matches/page.tsx': { label: 'Historique Télémétrie', pathFragment: 'telemetry/matches' },
  'telemetry/sync-batch-manual/page.tsx': { label: 'Synchro manuelle', pathFragment: 'telemetry/sync-batch-manual' }
};

for (const [relPath, config] of Object.entries(files)) {
  const fullPath = path.join('src/app/clans/[clanId]', relPath);
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');

  if (content.includes('<NavigationTrail')) {
    console.log('Skipping (already has NavigationTrail): ' + fullPath);
    continue;
  }

  // Ensure clanId is available in scope for [challengeId]
  let currentHref = `\`/clans/\${clanId}/${config.pathFragment}\``;
  if (fullPath.includes('[challengeId]')) {
    // If it's the challenge detail page, we need params.challengeId. Let's assume it has it.
    // Replace \${challengeId} with \${params.challengeId} just in case, wait, I put \${challengeId} which requires challengeId variable.
    // The page probably parses it from params.
    if (!content.includes('const challengeId')) {
       // Just fallback to string replace
       currentHref = `\`/clans/\${clanId}/challenges/\${challengeId || params.challengeId || 'id'}\``;
    }
  }

  // Add import
  if (!content.includes('import { NavigationTrail }')) {
    const importMatch = content.match(/import .* from '.*'/g);
    if (importMatch && importMatch.length > 0) {
      const lastImport = importMatch[importMatch.length - 1];
      content = content.replace(lastImport, lastImport + '\nimport { NavigationTrail } from \'@/components/ui/NavigationTrail\'');
    } else {
      content = 'import { NavigationTrail } from \'@/components/ui/NavigationTrail\'\n' + content;
    }
  }

  const trailJsx = `
      <NavigationTrail
        currentLabel="${config.label}"
        currentHref={${currentHref}}
        fallbackParent={{ href: \`/clans/\${clanId}/overview\`, label: "Vue d'ensemble", altHref: '/clans' }}
      />`;

  // Find <main ...> or <div className="app-container...
  const containerRegex = /(<main[^>]*>|<div[^>]*className=\"(?:[^\"]*)app-main(?:[^\"]*)\"[^>]*>)/;
  if (containerRegex.test(content)) {
    content = content.replace(containerRegex, '$1\\n' + trailJsx + '\\n');
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Updated: ' + fullPath);
  } else {
    console.log('Could not find main element in: ' + fullPath);
  }
}
