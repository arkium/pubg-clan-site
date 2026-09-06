import path from 'node:path'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5 MB

export type SupportedImageFormat = {
  ext: 'jpg' | 'png' | 'webp'
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
}

/**
 * Détecte le type réel de l'image à partir de sa signature binaire (magic bytes).
 * Évite les faux-positifs et les échecs dus aux navigateurs Windows ne transmettant
 * pas le bon MIME type (ex: MIME vide ou application/octet-stream pour WebP).
 */
export function detectImageMagicBytes(buffer: Buffer): SupportedImageFormat | null {
  if (buffer.length < 12) {
    return null
  }

  // JPEG : FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' }
  }

  // WebP : RIFF .... WEBP
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
  const isWebp =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50

  if (isRiff && isWebp) {
    return { ext: 'webp', mime: 'image/webp' }
  }

  return null
}

export type ValidationResult =
  | { valid: true; format: SupportedImageFormat }
  | { valid: false; error: string }

/**
 * Valide un fichier image téléversé : taille, magic bytes et extension.
 */
export function validateImageUpload(
  fileName: string,
  buffer: Buffer,
  maxBytes: number = MAX_UPLOAD_BYTES
): ValidationResult {
  if (buffer.length === 0) {
    return { valid: false, error: 'Le fichier est vide' }
  }

  if (buffer.length > maxBytes) {
    const sizeMo = (buffer.length / (1024 * 1024)).toFixed(1)
    const maxMo = (maxBytes / (1024 * 1024)).toFixed(0)
    return {
      valid: false,
      error: `Le fichier est trop volumineux (${sizeMo} Mo). La taille maximale autorisée est de ${maxMo} Mo.`,
    }
  }

  const detected = detectImageMagicBytes(buffer)
  if (!detected) {
    return {
      valid: false,
      error: 'Format d’image non reconnu ou corrompu. Formats acceptés : JPG, PNG, WEBP.',
    }
  }

  return { valid: true, format: detected }
}

export type UploadDirs = {
  primaryDir: string
  mirrorDir: string | null
}

/**
 * Résout les répertoires d'upload pour assurer la persistance :
 * - En mode standard : écrit dans <projectRoot>/public/uploads/<subDir>
 * - En mode Next standalone : écrit dans <projectRoot>/public/uploads/<subDir> (pour survivre aux builds)
 *   ET dans .next/standalone/public/uploads/<subDir> pour disponibilité immédiate.
 */
export function resolveUploadDirectories(subDir: string = 'clans'): UploadDirs {
  const cwd = process.cwd()
  const isStandalone = cwd.includes(path.join('.next', 'standalone'))

  if (isStandalone) {
    // cwd = /home/.../apps/pubg-clan-site/.next/standalone
    const standaloneDir = path.join(cwd, 'public', 'uploads', subDir)
    const projectRoot = path.resolve(cwd, '..', '..')
    const persistentDir = path.join(projectRoot, 'public', 'uploads', subDir)

    return {
      primaryDir: persistentDir,
      mirrorDir: standaloneDir,
    }
  }

  const projectDir = path.join(cwd, 'public', 'uploads', subDir)
  const standaloneMirror = path.join(cwd, '.next', 'standalone', 'public', 'uploads', subDir)

  return {
    primaryDir: projectDir,
    mirrorDir: standaloneMirror,
  }
}
