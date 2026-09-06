import { describe, expect, it } from 'vitest'
import {
  detectImageMagicBytes,
  resolveUploadDirectories,
  validateImageUpload,
} from './upload-image-validator'

describe('upload-image-validator', () => {
  describe('detectImageMagicBytes', () => {
    it('détecte correctement un JPEG via ses magic bytes (FF D8 FF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
      const result = detectImageMagicBytes(jpegBuffer)

      expect(result).toEqual({ ext: 'jpg', mime: 'image/jpeg' })
    })

    it('détecte correctement un PNG via ses magic bytes (89 50 4E 47 ...)', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
      const result = detectImageMagicBytes(pngBuffer)

      expect(result).toEqual({ ext: 'png', mime: 'image/png' })
    })

    it('détecte correctement un WebP via ses magic bytes (RIFF ... WEBP)', () => {
      // 'RIFF' = 0x52, 0x49, 0x46, 0x46 + 4 octets de taille + 'WEBP' = 0x57, 0x45, 0x42, 0x50
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ])
      const result = detectImageMagicBytes(webpBuffer)

      expect(result).toEqual({ ext: 'webp', mime: 'image/webp' })
    })

    it('renvoie null pour un buffer trop court', () => {
      const shortBuffer = Buffer.from([0xff, 0xd8, 0xff])
      expect(detectImageMagicBytes(shortBuffer)).toBeNull()
    })

    it('renvoie null pour un fichier texte ou non image', () => {
      const textBuffer = Buffer.from('Ceci est un fichier texte ordinaire qui ne contient aucune signature image.')
      expect(detectImageMagicBytes(textBuffer)).toBeNull()
    })

    it('renvoie null pour un PDF', () => {
      const pdfBuffer = Buffer.from('%PDF-1.5 fake content header here 1234')
      expect(detectImageMagicBytes(pdfBuffer)).toBeNull()
    })
  })

  describe('validateImageUpload', () => {
    it('accepte un fichier JPEG valide', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
      const validation = validateImageUpload('mon-image.jpg', buffer)

      expect(validation.valid).toBe(true)
      if (validation.valid) {
        expect(validation.format.ext).toBe('jpg')
        expect(validation.format.mime).toBe('image/jpeg')
      }
    })

    it('accepte un WebP même si son nom porte une extension erronée', () => {
      const webpBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46,
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
      ])
      const validation = validateImageUpload('unknown-file.bin', webpBuffer)

      expect(validation.valid).toBe(true)
      if (validation.valid) {
        expect(validation.format.ext).toBe('webp')
      }
    })

    it('rejette un fichier vide', () => {
      const emptyBuffer = Buffer.alloc(0)
      const validation = validateImageUpload('vide.jpg', emptyBuffer)

      expect(validation.valid).toBe(false)
      if (!validation.valid) {
        expect(validation.error).toContain('vide')
      }
    })

    it('rejette un fichier dépassant la taille maximale autorisée (5 Mo)', () => {
      const fakeHeader = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]
      const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 10)
      Buffer.from(fakeHeader).copy(oversizedBuffer)

      const validation = validateImageUpload('trop-gros.jpg', oversizedBuffer)

      expect(validation.valid).toBe(false)
      if (!validation.valid) {
        expect(validation.error).toContain('trop volumineux')
      }
    })

    it('rejette un format non supporté avec un message d’erreur clair', () => {
      const invalidBuffer = Buffer.from('<html><body>Fake payload</body></html>')
      const validation = validateImageUpload('fake.jpg', invalidBuffer)

      expect(validation.valid).toBe(false)
      if (!validation.valid) {
        expect(validation.error).toContain('JPG, PNG, WEBP')
      }
    })
  })

  describe('resolveUploadDirectories', () => {
    it('renvoie un chemin valide contenant public/uploads/clans', () => {
      const dirs = resolveUploadDirectories('clans')
      expect(dirs.primaryDir).toContain('uploads')
      expect(dirs.primaryDir).toContain('clans')
    })
  })

  describe('matcher regex proxy.ts pour les assets statiques et uploads', () => {
    // Matcher regex du proxy excluant api, static, et dossiers d'assets statiques dont uploads
    const matcherRegex = /^\/((?!api|_next\/static|_next\/image|favicon\.ico|robots\.txt|sitemap\.xml|maps|icons|avatars|uploads).+)/
    const isStaticAsset = (path: string) => /\.(?:jpg|jpeg|png|webp|svg|gif|ico)$/i.test(path)

    it('n’intercepte PAS les requêtes /uploads/clans/...', () => {
      expect(matcherRegex.test('/uploads/clans/clan-7-12345.jpg')).toBe(false)
    })

    it('n’intercepte PAS les maps, icons ou avatars', () => {
      expect(matcherRegex.test('/maps/pubg/Baltic_Main.webp')).toBe(false)
      expect(matcherRegex.test('/icons/pubg/test.png')).toBe(false)
      expect(matcherRegex.test('/avatars/user.svg')).toBe(false)
    })

    it('permet le passage des images avec extension même dans /clans/...', () => {
      expect(isStaticAsset('/clans/fralliancebe.jpg')).toBe(true)
      expect(isStaticAsset('/login-welcome.jpg')).toBe(true)
    })

    it('intercepte bien les pages nécessitant protection', () => {
      expect(matcherRegex.test('/account')).toBe(true)
      expect(matcherRegex.test('/clans/7/settings/login-welcome')).toBe(true)
      expect(matcherRegex.test('/clans/7/overview')).toBe(true)
    })
  })
})
