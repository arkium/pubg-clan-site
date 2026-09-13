import { describe, expect, it } from 'vitest'

import { MAP_ASSET_KEYS, mapAssetUrl, resolveMapAssetKey } from './map-asset'

describe('resolveMapAssetKey', () => {
  it('accepte une clé technique telle quelle', () => {
    expect(resolveMapAssetKey('Savage_Main')).toBe('Savage_Main')
    expect(resolveMapAssetKey('Baltic_Main')).toBe('Baltic_Main')
  })

  it('accepte un nom affiché', () => {
    expect(resolveMapAssetKey('Sanhok')).toBe('Savage_Main')
    expect(resolveMapAssetKey('Miramar')).toBe('Desert_Main')
    expect(resolveMapAssetKey('Taego')).toBe('Tiger_Main')
    expect(resolveMapAssetKey('Rondo')).toBe('Neon_Main')
    expect(resolveMapAssetKey('Deston')).toBe('Kiki_Main')
    expect(resolveMapAssetKey('Vikendi')).toBe('DihorOtok_Main')
  })

  it('replie Erangel et sa variante remastérisée sur le seul asset disponible', () => {
    expect(resolveMapAssetKey('Erangel')).toBe('Baltic_Main')
    expect(resolveMapAssetKey('Erangel_Main')).toBe('Baltic_Main')
    expect(resolveMapAssetKey('Erangel (Remastered)')).toBe('Baltic_Main')
  })

  it('ignore la casse, les espaces et la ponctuation', () => {
    expect(resolveMapAssetKey('  sanhok ')).toBe('Savage_Main')
    expect(resolveMapAssetKey('savage main')).toBe('Savage_Main')
    expect(resolveMapAssetKey('CAMP JACKAL')).toBe('Range_Main')
  })

  it('renvoie null plutôt qu’un chemin invalide', () => {
    expect(resolveMapAssetKey('Carte_Inconnue')).toBeNull()
    expect(resolveMapAssetKey('')).toBeNull()
    expect(resolveMapAssetKey(null)).toBeNull()
    expect(resolveMapAssetKey(undefined)).toBeNull()
  })

  it('couvre toutes les clés d’asset déclarées', () => {
    for (const key of MAP_ASSET_KEYS) {
      expect(resolveMapAssetKey(key)).toBe(key)
    }
  })
})

describe('mapAssetUrl', () => {
  it('construit le chemin webp local', () => {
    expect(mapAssetUrl('Sanhok')).toBe('/maps/pubg/Savage_Main.webp')
    expect(mapAssetUrl('Erangel_Main')).toBe('/maps/pubg/Baltic_Main.webp')
  })

  it('renvoie null quand aucun asset ne correspond', () => {
    expect(mapAssetUrl('Carte_Inconnue')).toBeNull()
  })
})
