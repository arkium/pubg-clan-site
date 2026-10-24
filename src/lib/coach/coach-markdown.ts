/**
 * Mise en forme des réponses du Coach IA (docs/TODO/chatbot-ia.md §6) : le modèle écrit un Markdown minimal — titre,
 * puces, gras, recommandation finale. Analyse pure en blocs, sans HTML : le composant construit les éléments lui-même,
 * donc rien de ce que renvoie le modèle n'est interprété comme du balisage.
 */

export type CoachInline = { bold: boolean; text: string }

export type CoachBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; inlines: CoachInline[] }
  | { type: 'list'; items: CoachInline[][] }
  | { type: 'reco'; inlines: CoachInline[] }

const RECO = /^\s*(?:[-*•]\s*)?(?:💡\s*)?\**\s*(recommandation|conseil)\b/i

/** Découpe les `**gras**` ; un astérisque orphelin reste du texte. */
export function parseCoachInlines(text: string): CoachInline[] {
  const inlines: CoachInline[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) inlines.push({ bold: false, text: text.slice(last, index) })
    inlines.push({ bold: true, text: match[1] })
    last = index + match[0].length
  }
  if (last < text.length) inlines.push({ bold: false, text: text.slice(last) })
  return inlines.length > 0 ? inlines : [{ bold: false, text: '' }]
}

function stripListMarker(line: string) {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
}

/** La recommandation s'affiche dans son propre encadré : plus de puce, d'ampoule ni de gras à l'intérieur. */
function stripRecoMarker(line: string) {
  return stripListMarker(line).replace(/💡\s*/, '').replace(/\*\*/g, '').replace(/\s*:\s*/, ' : ').trim()
}

export function parseCoachMarkdown(text: string): CoachBlock[] {
  const blocks: CoachBlock[] = []
  let list: CoachInline[][] | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inlines: parseCoachInlines(paragraph.join(' ')) })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push({ type: 'list', items: list })
      list = null
    }
  }

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: heading[1].replace(/\*\*/g, '').trim() })
      continue
    }
    if (RECO.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'reco', inlines: parseCoachInlines(stripRecoMarker(line)) })
      continue
    }
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) {
      flushParagraph()
      list ??= []
      list.push(parseCoachInlines(stripListMarker(line)))
      continue
    }
    // Un titre en gras seul sur sa ligne (« **Analyse de la phase 5** ») vaut un titre.
    const boldTitle = /^\*\*([^*]+)\*\*\s*:?\s*$/.exec(line)
    if (boldTitle && paragraph.length === 0) {
      flushList()
      blocks.push({ type: 'heading', text: boldTitle[1].trim() })
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return blocks
}

/** Texte brut d'une réponse, pour le bouton Copier : sans astérisques ni dièses. */
export function coachPlainText(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
}
