const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('d:/Sources/pubg-clan-site/src');
let modifiedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('NextResponse')) {
    if (file.endsWith('proxy.ts')) continue;
    
    let modified = false;
    
    if (/NextResponse\.json\(/g.test(content)) {
        content = content.replace(/NextResponse\.json\(/g, 'Response.json(');
        modified = true;
    }
    
    if (/NextResponse\.redirect\(/g.test(content)) {
        content = content.replace(/NextResponse\.redirect\(/g, 'Response.redirect(');
        modified = true;
    }
    
    if (/NextResponse\.next\(/g.test(content)) {
        content = content.replace(/NextResponse\.next\(/g, 'Response.next(');
        modified = true;
    }
    
    if (modified) {
        content = content.replace(/import\s*\{\s*NextResponse\s*(?:,\s*NextRequest\s*)?\}\s*from\s*['"]next\/server['"]/g, 'import { NextRequest } from \'next/server\'');
        content = content.replace(/import\s*\{\s*NextRequest\s*,\s*NextResponse\s*\}\s*from\s*['"]next\/server['"]/g, 'import { NextRequest } from \'next/server\'');
        content = content.replace(/import\s*\{\s*NextResponse\s*\}\s*from\s*['"]next\/server['"]\s*\r?\n/g, '');
        
        fs.writeFileSync(file, content);
        modifiedCount++;
    }
  }
}
console.log('Modified ' + modifiedCount + ' files.');
