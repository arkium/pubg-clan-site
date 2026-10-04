import { describe, expect, it } from 'vitest'

import type { ObservedSpotView, ResourceMapResponse, ResourcePointView } from './resource-api'
import {
  OBSERVED_MARKER,
  applyCancellation,
  applyConfirmation,
  applyProposal,
  applyReport,
  buildProposalBody,
  buildReportBody,
  cleanComment,
  confirmationLine,
  contributorCountLabel,
  dropZoneSummary,
  familyCounts,
  formatDayMonth,
  formatFullDate,
  formatShortDate,
  kindCounts,
  mapPercent,
  mapStateChip,
  metersFromPercent,
  observationLine,
  observedMarkerStyle,
  familyTopShares,
  pendingLine,
  pointMarkerName,
  recheckNotice,
  reportNextStep,
  reportPreviousStep,
  sharePercent,
  shownFamilies,
  spotMarkerName,
  validatedCountLabel,
  visiblePoints,
  visibleSpots,
} from './resource-view'

function point(overrides: Partial<ResourcePointView> = {}): ResourcePointView {
  return {
    id: 'p1',
    kind: 'fuel',
    x: 2500,
    y: 2500,
    grid: 'C-K',
    state: 'validated',
    mine: false,
    createdBy: { name: 'Vexa', validatedCount: 21 },
    validatedBy: 'Arkium',
    validatedAt: '2026-09-20T10:00:00.000Z',
    lastConfirmedAt: '2026-09-29T18:00:00.000Z',
    confirmations: 4,
    createdAt: '2026-09-18T10:00:00.000Z',
    comment: null,
    reportedByMe: false,
    confirmedByMe: false,
    ...overrides,
  }
}

function spot(overrides: Partial<ObservedSpotView> = {}): ObservedSpotView {
  return { family: 'car', x: 3200, y: 3900, grid: 'D-L', share: 0.62, observations: 48, matches: 48, ...overrides }
}

function response(points: ResourcePointView[], toConfirm = 0): ResourceMapResponse {
  return {
    map: { key: 'Baltic_Main', label: 'Erangel', sizeMeters: 8192 },
    state: { verifiedAt: null, recheckSince: toConfirm ? '2026-10-01T08:00:00.000Z' : null, toConfirm },
    points,
    observed: { analysedMatches: 78, windowDays: 90, computedAt: null, spots: [] },
    counts: { observed: { car: 0, moto: 0, boat: 0, glider: 0, land: 0 }, points: { fuel: 0, garage: 0, dock: 0, secret_room: 0 } },
    viewer: { signedIn: true, isSuperUser: false, validatedCount: 3, queueCount: null },
  }
}

describe('marqueurs observés', () => {
  it('taille et opacité relatives au plus fréquent de la famille, bornées aux deux bouts', () => {
    // Le plus fréquent de sa famille : taille maximale, qu'il soit à 3,5 % (bateau) ou à 24 % (voiture).
    expect(observedMarkerStyle(0.035, 0.035)).toEqual({ size: OBSERVED_MARKER.maxSize, opacity: 1 })
    expect(observedMarkerStyle(0.24, 0.24)).toEqual(observedMarkerStyle(0.035, 0.035))
    // Au seuil relatif (le quart) ou en dessous : taille minimale.
    expect(observedMarkerStyle(0.06, 0.24)).toEqual({ size: OBSERVED_MARKER.minSize, opacity: OBSERVED_MARKER.minOpacity })
    expect(observedMarkerStyle(0.01, 0.24)).toEqual(observedMarkerStyle(0.06, 0.24))
    const middle = observedMarkerStyle(0.15, 0.24)
    expect(middle.size).toBeGreaterThan(OBSERVED_MARKER.minSize)
    expect(middle.size).toBeLessThan(OBSERVED_MARKER.maxSize)
    expect(observedMarkerStyle(Number.NaN, 0.24)).toEqual(observedMarkerStyle(0, 0.24))
  })

  it('plus fréquent par famille parmi les emplacements reçus', () => {
    const top = familyTopShares([
      { family: 'boat', share: 0.01 },
      { family: 'boat', share: 0.035 },
      { family: 'land', share: 0.24 },
    ])
    expect(top.get('boat')).toBe(0.035)
    expect(top.get('land')).toBe(0.24)
  })

  it('pourcentage arrondi et borné', () => {
    expect(sharePercent(0.615)).toBe(62)
    expect(sharePercent(1.4)).toBe(100)
    expect(sharePercent(-1)).toBe(0)
  })
})

describe('repère', () => {
  it('mètres ↔ pourcentages, bornés à la carte', () => {
    expect(mapPercent(8192, { x: 4096, y: 2048 })).toEqual({ left: 50, top: 25 })
    expect(mapPercent(4096, { x: 5000, y: -10 })).toEqual({ left: 100, top: 0 })
    expect(metersFromPercent(8192, 50, 25)).toEqual({ x: 4096, y: 2048 })
    expect(metersFromPercent(8192, 120, -5)).toEqual({ x: 8192, y: 0 })
  })
})

describe('couches et drop zones', () => {
  const spots = [spot(), spot({ family: 'boat', x: 7000, y: 7000, grid: 'H-P' }), spot({ family: 'moto', x: 3300, y: 3950 })]
  const points = [point({ x: 3000, y: 3500 }), point({ id: 'p2', kind: 'dock', x: 7100, y: 7050 }), point({ id: 'p3', kind: 'garage', x: 3000, y: 4000 })]
  const near = { centers: [{ x: 3200, y: 3900 }], radius: 800 }

  it('une couche décochée disparaît de la carte', () => {
    const filter = { hiddenFamilies: ['boat'] as const, hiddenKinds: ['garage'] as const, near: null }
    expect(visibleSpots(spots, filter).map((entry) => entry.family)).toEqual(['car', 'moto'])
    expect(visiblePoints(points, filter).map((entry) => entry.id)).toEqual(['p1', 'p2'])
  })

  it('autour des drop zones : seuls les marqueurs à 800 m des centres restent, et les nombres suivent', () => {
    const filter = { hiddenFamilies: [], hiddenKinds: [], near }
    expect(visibleSpots(spots, filter).map((entry) => entry.family)).toEqual(['car', 'moto'])
    expect(visiblePoints(points, filter).map((entry) => entry.id)).toEqual(['p1', 'p3'])
    expect(familyCounts(spots, near)).toEqual({ car: 1, moto: 1, boat: 0, glider: 0, land: 0 })
    expect(familyCounts(spots, null)).toEqual({ car: 1, moto: 1, boat: 1, glider: 0, land: 0 })
    expect(kindCounts(points, near)).toEqual({ fuel: 1, garage: 1, dock: 0, secret_room: 0 })
    // Sans centre, le filtre ne retire rien.
    expect(visiblePoints(points, { hiddenFamilies: [], hiddenKinds: [], near: { centers: [], radius: 800 } })).toHaveLength(3)
  })

  it('« Voitures ou motos » n’est proposée que si elle a des emplacements', () => {
    expect(shownFamilies(spots)).toEqual(['car', 'moto', 'boat', 'glider'])
    expect(shownFamilies([...spots, spot({ family: 'land' })])).toEqual(['car', 'moto', 'boat', 'glider', 'land'])
  })

  it('sous-ligne de l’interrupteur', () => {
    expect(dropZoneSummary([{ name: 'Pochinki' }, { name: 'School' }, { name: 'Georgopol' }], 800)).toBe('Pochinki, School, Georgopol · 800 m')
  })
})

describe('dates et état de la carte (heure de Paris)', () => {
  it('formats courts', () => {
    expect(formatDayMonth('2026-10-01T08:00:00.000Z')).toBe('1/10')
    // 23:30 UTC le 30/09 = 01:30 à Paris le 1/10.
    expect(formatDayMonth('2026-09-30T23:30:00.000Z')).toBe('1/10')
    expect(formatFullDate('2026-09-28T10:00:00.000Z')).toBe('28/09/2026')
    expect(formatShortDate('2026-09-29T18:00:00.000Z')).toBe('29 sept.')
  })

  it('puce d’état : à revérifier l’emporte sur vérifiée', () => {
    expect(mapStateChip({ verifiedAt: '2026-09-28T10:00:00.000Z', recheckSince: null, toConfirm: 0 })).toEqual({ tone: 'pos', text: 'Vérifiée le 28/09/2026' })
    expect(mapStateChip({ verifiedAt: '2026-09-28T10:00:00.000Z', recheckSince: '2026-10-01T08:00:00.000Z', toConfirm: 9 })).toEqual({
      tone: 'warn',
      text: 'À revérifier depuis le 1/10',
    })
    expect(mapStateChip({ verifiedAt: null, recheckSince: null, toConfirm: 0 })).toBeNull()
  })

  it('bandeau d’information d’une carte à revérifier', () => {
    expect(recheckNotice({ verifiedAt: null, recheckSince: '2026-10-01T08:00:00.000Z', toConfirm: 9 })).toBe(
      'Mise à jour PUBG du 1/10 : 9 points saisis à confirmer. Si tu passes devant, ouvre le point et clique « Toujours là ».'
    )
    expect(recheckNotice({ verifiedAt: null, recheckSince: '2026-10-01T08:00:00.000Z', toConfirm: 1 })).toContain(': 1 point saisi à confirmer.')
    expect(recheckNotice({ verifiedAt: null, recheckSince: '2026-10-01T08:00:00.000Z', toConfirm: 0 })).toBe('Mise à jour PUBG du 1/10 : tous les points saisis sont confirmés.')
    expect(recheckNotice({ verifiedAt: '2026-09-28T10:00:00.000Z', recheckSince: null, toConfirm: 0 })).toBeNull()
  })
})

describe('textes de la fiche', () => {
  it('noms accessibles des marqueurs : type et repère, puis l’état', () => {
    expect(pointMarkerName(point())).toBe('Station-service, grille C-K')
    expect(pointMarkerName(point({ state: 'to_confirm' }))).toBe('Station-service, grille C-K, à confirmer')
    expect(pointMarkerName(point({ state: 'pending', mine: true, kind: 'secret_room' }))).toBe('Salle secrète, grille C-K, ta proposition en attente')
    expect(pointMarkerName(point({ state: 'pending' }))).toBe('Station-service, grille C-K, en attente')
    expect(spotMarkerName(spot())).toBe('Voiture, grille D-L, observé dans 62 % des parties')
  })

  it('confirmation : date et nombre, orange quand le point est à confirmer', () => {
    expect(confirmationLine(point())).toEqual({ tone: 'default', text: 'Confirmé 29 sept. · 4 confirmations' })
    expect(confirmationLine(point({ confirmations: 1 }))).toEqual({ tone: 'default', text: 'Confirmé 29 sept. · 1 confirmation' })
    expect(confirmationLine(point({ lastConfirmedAt: null, confirmations: 0 }))).toEqual({ tone: 'default', text: 'Pas encore confirmé' })
    expect(confirmationLine(point({ state: 'to_confirm' }))).toEqual({ tone: 'warn', text: 'Confirmé : pas encore depuis la mise à jour' })
  })

  it('point en attente : pas de double point après un mois abrégé', () => {
    expect(pendingLine(point({ mine: true, createdAt: '2026-10-03T16:00:00.000Z' }))).toBe(
      'Ta proposition du 3 oct. Visible seulement par toi et les superusers jusqu’à sa validation.'
    )
    expect(pendingLine(point({ mine: true, createdAt: '2026-05-03T16:00:00.000Z' }))).toBe(
      'Ta proposition du 3 mai. Visible seulement par toi et les superusers jusqu’à sa validation.'
    )
    expect(pendingLine(point({ createdAt: '2026-10-03T16:00:00.000Z' }))).toBe('Proposé par Vexa le 3 oct., en attente de validation.')
  })

  it('observations et compteurs de contributeur', () => {
    expect(observationLine(spot(), 78)).toBe('48 observations sur 78 parties analysées. Mis à jour chaque nuit.')
    expect(observationLine(spot({ observations: 1 }), 1)).toBe('1 observation sur 1 partie analysée. Mis à jour chaque nuit.')
    expect(contributorCountLabel(21)).toBe('21 points validés')
    expect(contributorCountLabel(1)).toBe('1 point validé')
    expect(validatedCountLabel(12)).toBe('Tu as 12 points validés')
    expect(validatedCountLabel(0)).toBe('Pas encore de point validé')
  })
})

describe('parcours et corps des envois', () => {
  it('« N’existe plus » saute l’étape 2, dans les deux sens', () => {
    expect(reportNextStep(1, 'missing')).toBe(3)
    expect(reportPreviousStep(3, 'missing')).toBe(1)
    expect(reportNextStep(1, 'misplaced')).toBe(2)
    expect(reportNextStep(2, 'wrong_kind')).toBe(3)
    expect(reportPreviousStep(3, 'wrong_kind')).toBe(2)
    expect(reportPreviousStep(2, 'misplaced')).toBe(1)
  })

  it('commentaire nettoyé et borné', () => {
    expect(cleanComment('   ')).toBeUndefined()
    expect(cleanComment('  Détruite  ')).toBe('Détruite')
    expect(cleanComment('x'.repeat(400))).toHaveLength(280)
  })

  it('signalement : seuls les champs du motif partent', () => {
    expect(buildReportBody({ reason: 'missing', position: { x: 1, y: 2 }, proposedKind: 'dock', comment: ' ' })).toEqual({ kind: 'missing' })
    expect(buildReportBody({ reason: 'misplaced', position: { x: 3100, y: 4200 }, proposedKind: null, comment: 'Plus au nord' })).toEqual({
      kind: 'misplaced',
      x: 3100,
      y: 4200,
      comment: 'Plus au nord',
    })
    expect(buildReportBody({ reason: 'wrong_kind', position: null, proposedKind: 'garage', comment: '' })).toEqual({ kind: 'wrong_kind', proposedKind: 'garage' })
  })

  it('proposition : carte, type, position, commentaire facultatif', () => {
    expect(buildProposalBody({ map: 'Baltic_Main', kind: 'secret_room', position: { x: 10, y: 20 }, comment: '' })).toEqual({
      map: 'Baltic_Main',
      kind: 'secret_room',
      x: 10,
      y: 20,
    })
    expect(buildProposalBody({ map: 'Baltic_Main', kind: 'fuel', position: { x: 10, y: 20 }, comment: ' Derrière la ferme ' }).comment).toBe('Derrière la ferme')
  })
})

describe('mise à jour locale après une action', () => {
  it('« Toujours là » sur un point à confirmer : point remplacé, carte décomptée', () => {
    const data = response([point({ state: 'to_confirm' }), point({ id: 'p2', state: 'to_confirm' })], 2)
    const next = applyConfirmation(data, point({ confirmedByMe: true, confirmations: 5 }))
    expect(next.points[0]).toMatchObject({ state: 'validated', confirmedByMe: true, confirmations: 5 })
    expect(next.state.toConfirm).toBe(1)
    // Un point déjà validé ne décompte rien.
    expect(applyConfirmation(response([point()], 0), point({ confirmedByMe: true })).state.toConfirm).toBe(0)
  })

  it('proposition, annulation et signalement', () => {
    const pending = point({ id: 'new', state: 'pending', mine: true })
    const proposed = applyProposal(response([point()]), pending, 4)
    expect(proposed.points.map((entry) => entry.id)).toEqual(['p1', 'new'])
    expect(proposed.viewer.validatedCount).toBe(4)
    expect(applyCancellation(proposed, 'new').points.map((entry) => entry.id)).toEqual(['p1'])
    const reported = applyReport(response([point()]), 'p1', 12)
    expect(reported.points[0].reportedByMe).toBe(true)
    expect(reported.viewer.validatedCount).toBe(12)
  })
})
