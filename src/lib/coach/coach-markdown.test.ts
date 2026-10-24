import { describe, expect, it } from 'vitest'

import { coachPlainText, parseCoachInlines, parseCoachMarkdown } from '@/lib/coach/coach-markdown'

describe('mise en forme des réponses du Coach IA', () => {
  it('lit le Markdown minimal du modèle : titre, puces, gras, recommandation', () => {
    const text = [
      '### Analyse de la phase 5',
      '',
      '* **Isolement :** Menez69 à **145 m** du reste de l’escouade.',
      '- Dégâts subis : **420** en 6 s.',
      '',
      'Recommandation : engager le repli dès la zone 4.',
    ].join('\n')
    expect(parseCoachMarkdown(text)).toEqual([
      { type: 'heading', text: 'Analyse de la phase 5' },
      {
        type: 'list',
        items: [
          [{ bold: true, text: 'Isolement :' }, { bold: false, text: ' Menez69 à ' }, { bold: true, text: '145 m' }, { bold: false, text: ' du reste de l’escouade.' }],
          [{ bold: false, text: 'Dégâts subis : ' }, { bold: true, text: '420' }, { bold: false, text: ' en 6 s.' }],
        ],
      },
      { type: 'reco', inlines: [{ bold: false, text: 'Recommandation : engager le repli dès la zone 4.' }] },
    ])
  })

  it('accepte un titre en gras seul, une recommandation en puce et des paragraphes', () => {
    const blocks = parseCoachMarkdown('**Bilan face au clan VPR**\nVous les avez affrontés **9** fois.\nUne ligne de plus.\n\n- **Recommandation :** évite les plaines.')
    expect(blocks[0]).toEqual({ type: 'heading', text: 'Bilan face au clan VPR' })
    expect(blocks[1]).toMatchObject({ type: 'paragraph' })
    expect((blocks[1] as { inlines: Array<{ text: string }> }).inlines.map((inline) => inline.text).join('')).toBe('Vous les avez affrontés 9 fois. Une ligne de plus.')
    expect(blocks[2]).toEqual({ type: 'reco', inlines: [{ bold: false, text: 'Recommandation : évite les plaines.' }] })
  })

  it('ne casse pas sur un astérisque orphelin ni sur du HTML', () => {
    expect(parseCoachInlines('5 * 3 = 15 et <b>rien</b>')).toEqual([{ bold: false, text: '5 * 3 = 15 et <b>rien</b>' }])
    expect(parseCoachMarkdown('')).toEqual([])
  })

  it('rend un texte brut pour le presse-papiers', () => {
    expect(coachPlainText('## Titre\n- **420** dégâts')).toBe('Titre\n- 420 dégâts')
  })
})
