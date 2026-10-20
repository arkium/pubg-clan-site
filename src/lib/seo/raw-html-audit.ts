/**
 * Ce que lit un robot qui n'exécute pas le JavaScript (docs/TODO/geo-seo-propositions.md §2 et §7) : extraction d'une
 * page HTML brute, sans analyseur ni dépendance. Pur, testé ; le script `scripts/seo-raw-html-audit.ts` l'applique à
 * chaque page du sitemap.
 *
 * Une image en `alt=""` n'est pas une erreur (décision 0.6 : image décorative) ; seul un `alt` absent compte.
 */

export type RawHtmlReport = {
  title: string | null
  description: string | null
  robots: string | null
  canonical: string | null
  h1: string[]
  h2: string[]
  /** Mots visibles du `<body>`, hors scripts, styles et modèles. */
  words: number
  imagesWithoutAlt: number
  hasMain: boolean
  jsonLdTypes: string[]
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', rsquo: '’', laquo: '«', raquo: '»' }

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

function textOf(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return match ? decodeEntities(match[2] ?? match[3] ?? '') : null
}

function metaContent(html: string, key: 'name' | 'property', value: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attribute(tag, key)?.toLowerCase() === value) return attribute(tag, 'content')
  }
  return null
}

function headings(html: string, level: 1 | 2) {
  return [...html.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}>`, 'gi'))].map((match) => textOf(match[1])).filter(Boolean)
}

function jsonLdTypes(html: string) {
  const types: string[] = []
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1])
      const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data]
      for (const node of nodes) if (typeof node?.['@type'] === 'string') types.push(node['@type'])
    } catch {
      types.push('(JSON invalide)')
    }
  }
  return types
}

export function auditRawHtml(html: string): RawHtmlReport {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? html
  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  const visible = body.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
  const canonicalTag = (head.match(/<link\b[^>]*>/gi) ?? []).find((tag) => attribute(tag, 'rel')?.toLowerCase() === 'canonical')

  return {
    title: head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) ? textOf(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)![1]) : null,
    description: metaContent(head, 'name', 'description'),
    robots: metaContent(head, 'name', 'robots'),
    canonical: canonicalTag ? attribute(canonicalTag, 'href') : null,
    h1: headings(visible, 1),
    h2: headings(visible, 2),
    words: textOf(visible).split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length,
    imagesWithoutAlt: (visible.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => attribute(tag, 'alt') === null).length,
    hasMain: /<main\b/i.test(visible),
    jsonLdTypes: jsonLdTypes(html),
  }
}

/** Adresses d'un sitemap XML. */
export function sitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => decodeEntities(match[1]))
}
