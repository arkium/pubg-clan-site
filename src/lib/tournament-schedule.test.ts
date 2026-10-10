import { describe, expect, it } from 'vitest'

import {
  TournamentInputError,
  formatTournamentPeriod,
  hasScheduledTime,
  parisLocalToUtc,
  tournamentDayParts,
  tournamentInstant,
  tournamentLocalParts,
  tournamentWindowEnd,
} from '@/lib/tournament-schedule'
import { resolveTournamentPhase } from '@/lib/tournament-mode-display'
import { normalizeTournamentTitle, tournamentTitleProblem } from '@/lib/tournament-title'

describe('horaires d’un tournoi (heure de Paris)', () => {
  it('convertit l’heure de Paris en UTC, été comme hiver', () => {
    // Heure d'été jusqu'au 25 octobre 2026 (UTC+2), heure d'hiver ensuite (UTC+1).
    expect(parisLocalToUtc('2026-10-10', '21:00').toISOString()).toBe('2026-10-10T19:00:00.000Z')
    expect(parisLocalToUtc('2026-12-12', '21:00').toISOString()).toBe('2026-12-12T20:00:00.000Z')
  })

  it('soirée de 21 h à 3 h du matin le lendemain', () => {
    const start = tournamentInstant('2026-10-10', '21:00')
    const end = tournamentInstant('2026-10-11', '03:00')
    expect(start.toISOString()).toBe('2026-10-10T19:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-11T01:00:00.000Z')
    // La fenêtre s'arrête à l'heure dite, pas en fin de journée.
    expect(tournamentWindowEnd(end).toISOString()).toBe('2026-10-11T01:00:00.000Z')
    expect(formatTournamentPeriod(start, end)).toBe('10 oct. 21:00 → 11 oct. 03:00')
  })

  it('sans heure, garde la journée entière d’avant (fin du dernier jour comprise)', () => {
    const end = tournamentInstant('2026-10-11')
    expect(hasScheduledTime(end)).toBe(false)
    expect(tournamentWindowEnd(end).toISOString()).toBe('2026-10-11T23:59:59.999Z')
    expect(tournamentLocalParts(end)).toEqual({ date: '2026-10-11', time: null })
    expect(formatTournamentPeriod('2026-10-10T00:00:00.000Z', end)).toBe('10 oct. → 11 oct.')
    expect(formatTournamentPeriod(end, end)).toBe('11 oct.')
  })

  it('une heure qui tombe pile sur minuit UTC ne passe jamais pour une journée entière', () => {
    // 2 h du matin à Paris en été = minuit UTC.
    const instant = tournamentInstant('2026-10-10', '02:00')
    expect(hasScheduledTime(instant)).toBe(true)
    expect(instant.toISOString()).toBe('2026-10-10T00:00:00.001Z')
    expect(tournamentLocalParts(instant)).toEqual({ date: '2026-10-10', time: '02:00' })
    expect(tournamentWindowEnd(instant).toISOString()).toBe('2026-10-10T00:00:00.001Z')
  })

  it('relit le jour et l’heure de Paris pour le formulaire, même après minuit', () => {
    expect(tournamentLocalParts('2026-10-11T01:00:00.000Z')).toEqual({ date: '2026-10-11', time: '03:00' })
    expect(tournamentLocalParts('2026-10-10T19:00:00.000Z')).toEqual({ date: '2026-10-10', time: '21:00' })
  })

  it('même jour : l’heure de fin seule', () => {
    expect(formatTournamentPeriod(tournamentInstant('2026-10-10', '21:00'), tournamentInstant('2026-10-10', '23:30'))).toBe(
      '10 oct. 21:00 → 23:30'
    )
  })

  it('pavé de date d’une carte, avec l’heure si elle est précisée', () => {
    expect(tournamentDayParts(tournamentInstant('2026-10-10', '21:00'))).toEqual({ weekday: 'SAM', day: '10', month: 'OCT', time: '21:00' })
    expect(tournamentDayParts('2026-10-10T00:00:00.000Z')).toEqual({ weekday: 'SAM', day: '10', month: 'OCT', time: null })
  })

  it('refuse une heure mal formée', () => {
    expect(() => tournamentInstant('2026-10-10', '25:00')).toThrow(TournamentInputError)
    expect(() => tournamentInstant('2026-10-10', '9h')).toThrow(TournamentInputError)
  })

  it('le tournoi n’est plus « en direct » après l’heure de fin', () => {
    const tournament = {
      status: 'active',
      startDate: tournamentInstant('2026-10-10', '21:00'),
      endDate: tournamentInstant('2026-10-11', '03:00'),
    }
    expect(resolveTournamentPhase(tournament, new Date('2026-10-10T18:59:00.000Z'))).toBe('upcoming')
    expect(resolveTournamentPhase(tournament, new Date('2026-10-10T23:00:00.000Z'))).toBe('live')
    expect(resolveTournamentPhase(tournament, new Date('2026-10-11T01:30:00.000Z'))).toBe('finished')
  })
})

describe('titre d’un tournoi (affiché sur la vitrine)', () => {
  it('accepte un titre ordinaire', () => {
    expect(tournamentTitleProblem('Tournoi [FR] 10/10/26')).toBeNull()
    expect(normalizeTournamentTitle('  Coupe d’automne  ')).toBe('Coupe d’automne')
  })

  it('refuse liens et adresses de site', () => {
    for (const title of ['Inscription sur https://exemple.com', 'www.monclan.fr cup', 'Rejoins discord.gg/abc', 'Cup monclan.fr']) {
      expect(tournamentTitleProblem(title)).toContain('lien')
    }
  })

  it('refuse les balises HTML et les scripts', () => {
    expect(tournamentTitleProblem('<script>alert(1)</script>')).toContain('balise')
    expect(tournamentTitleProblem('Cup <b>gras</b>')).toContain('balise')
  })

  it('refuse un titre vide ou trop long', () => {
    expect(tournamentTitleProblem('   ')).toContain('obligatoire')
    expect(tournamentTitleProblem('x'.repeat(81))).toContain('80')
    expect(() => normalizeTournamentTitle('<i>x</i>')).toThrow(TournamentInputError)
  })
})
