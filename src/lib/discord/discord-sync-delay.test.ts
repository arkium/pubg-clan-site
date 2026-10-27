import { describe, expect, it } from 'vitest'

import { describeTop1Delay } from './discord-sync-delay'

/** Délai annoncé d'une alerte Top 1 sur la page Discord, d'après la fréquence de la synchronisation des parties. */
describe('describeTop1Delay', () => {
  it('toutes les 30 minutes : jusqu’à 45 minutes après la partie', () => {
    expect(describeTop1Delay('*/30 * * * *')).toEqual({
      everyMinutes: 30,
      text: 'Pas en direct : l’alerte part quand le site relit les parties du clan auprès de PUBG, toutes les 30 minutes. Compte en général jusqu’à 45 minutes après la fin de la partie.',
    })
  })

  it('toutes les heures, toutes les 4 heures', () => {
    expect(describeTop1Delay('0 * * * *')).toMatchObject({ everyMinutes: 60 })
    expect(describeTop1Delay('0 * * * *').text).toContain('toutes les heures. Compte en général jusqu’à 1 h 15')
    expect(describeTop1Delay('0 */4 * * *').text).toContain('toutes les 4 heures. Compte en général jusqu’à 4 h 15')
    expect(describeTop1Delay('*/15 * * * *').text).toContain('toutes les 15 minutes. Compte en général jusqu’à 30 minutes')
  })

  it('une expression qui n’est pas une fréquence simple : pas de chiffre inventé', () => {
    expect(describeTop1Delay('0 2 * * 1')).toEqual({ everyMinutes: null, text: expect.stringContaining('plusieurs heures') })
    expect(describeTop1Delay(null).everyMinutes).toBeNull()
  })
})
