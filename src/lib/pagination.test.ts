import { describe, expect, it } from 'vitest'

import { getCronRunsPerDay } from './cron-frequency'
import { paginate, paginationItems } from './pagination'

describe('pagination', () => {
  it('numéros affichés : première, dernière, courante et voisines', () => {
    expect(paginationItems(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(paginationItems(1, 1)).toEqual([1])
  })

  it('ramène la page dans les bornes et découpe la liste', () => {
    const list = Array.from({ length: 19 }, (_, index) => index + 1)
    expect(paginate(list, 3, 8)).toEqual({ current: 3, pageCount: 3, start: 16, visible: [17, 18, 19] })
    // Une liste raccourcie (changement de période) ne laisse pas une page vide.
    expect(paginate(list.slice(0, 5), 3, 8)).toMatchObject({ current: 1, visible: [1, 2, 3, 4, 5] })
    expect(paginate([], 1, 8)).toMatchObject({ current: 1, pageCount: 1, visible: [] })
  })
})

describe('fréquence d’un cron', () => {
  it('compte les exécutions quotidiennes d’une expression simple', () => {
    expect(getCronRunsPerDay('0 4 * * *')).toBe(1)
    expect(getCronRunsPerDay('15 * * * *')).toBe(24)
    expect(getCronRunsPerDay('0 */6 * * *')).toBe(4)
    expect(getCronRunsPerDay('0 8 * * 1')).toBeNull()
  })
})
