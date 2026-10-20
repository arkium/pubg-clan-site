/**
 * Ce que lit un robot qui n'exécute pas le JavaScript, page par page (docs/TODO/geo-seo-propositions.md §2 et §7) :
 * titre, description, robots, canonique, H1, H2, mots visibles, images sans `alt`, présence de `<main>` et types
 * JSON-LD, pour chaque adresse du sitemap. Lecture seule : de simples GET, comme un robot.
 *
 * Usage :
 *   npx tsx scripts/seo-raw-html-audit.ts                                  # https://chickendinner.fr
 *   npx tsx scripts/seo-raw-html-audit.ts --base=http://localhost:3001     # build local
 *   npx tsx scripts/seo-raw-html-audit.ts --path=/a-propos --path=/clans   # quelques pages, sans le sitemap
 *   npx tsx scripts/seo-raw-html-audit.ts --json > audit.json
 *
 * Extraction : src/lib/seo/raw-html-audit.ts (testée par Vitest).
 */
import { auditRawHtml, sitemapUrls, type RawHtmlReport } from '../src/lib/seo/raw-html-audit'

const args = process.argv.slice(2)
const base = (args.find((arg) => arg.startsWith('--base='))?.slice(7) ?? 'https://chickendinner.fr').replace(/\/+$/, '')
const onlyPaths = args.filter((arg) => arg.startsWith('--path=')).map((arg) => arg.slice(7))
const asJson = args.includes('--json')
// Robot sans JavaScript ; un délai entre deux pages pour ne pas charger le serveur de production.
const USER_AGENT = 'chickendinner-seo-audit (sans JavaScript)'
const PAUSE_MS = 300

type Row = { url: string; status: number; report: RawHtmlReport | null }

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' })
  return { status: response.status, text: await response.text() }
}

async function main() {
  const urls = onlyPaths.length
    ? onlyPaths.map((path) => `${base}${path}`)
    : sitemapUrls((await fetchText(`${base}/sitemap.xml`)).text).map((url) => url.replace(/^https?:\/\/[^/]+/, base))

  const rows: Row[] = []
  for (const url of urls) {
    try {
      const { status, text } = await fetchText(url)
      rows.push({ url, status, report: status === 200 ? auditRawHtml(text) : null })
    } catch (error) {
      console.error(`${url} : ${error instanceof Error ? error.message : error}`)
      rows.push({ url, status: 0, report: null })
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS))
  }

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  for (const { url, status, report } of rows) {
    const path = url.slice(base.length) || '/'
    if (!report) {
      console.log(`${path}\n  HTTP ${status}`)
      continue
    }
    const warnings = [
      report.h1.length !== 1 ? `${report.h1.length} H1` : null,
      report.words < 100 ? 'moins de 100 mots' : null,
      report.imagesWithoutAlt > 0 ? `${report.imagesWithoutAlt} image(s) sans alt` : null,
      report.hasMain ? null : 'pas de <main>',
      report.robots?.includes('noindex') ? 'noindex' : null,
    ].filter(Boolean)
    console.log(
      `${path}\n` +
        `  titre : ${report.title ?? '—'}\n` +
        `  H1 : ${report.h1.join(' | ') || '—'} · ${report.h2.length} H2 · ${report.words} mots · JSON-LD : ${report.jsonLdTypes.join(', ') || '—'}` +
        (warnings.length ? `\n  ⚠ ${warnings.join(' · ')}` : '')
    )
  }
  const withoutH1 = rows.filter((row) => row.report && row.report.h1.length === 0).length
  console.log(`\n${rows.length} page(s) · ${withoutH1} sans H1 · ${rows.filter((row) => !row.report).length} en erreur`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
