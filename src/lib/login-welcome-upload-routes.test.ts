import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  getActorMemberId: vi.fn(),
  requirePermission: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({
  getActorMemberId: mocks.getActorMemberId,
  requirePermission: mocks.requirePermission,
}))

import { POST as uploadHandler } from '../app/api/clans/[clanId]/settings/login-welcome/upload/route'
import { GET as getUploadedImage } from '../app/uploads/clans/[fileName]/route'

describe('login-welcome upload routes integration', () => {
  beforeEach(() => {
    mocks.getActorMemberId.mockReset()
    mocks.requirePermission.mockReset()
  })

  afterEach(async () => {
    // Nettoyer les fichiers de test créés dans public/uploads/clans
    try {
      const testDir = path.join(process.cwd(), 'public', 'uploads', 'clans')
      const files = await fs.readdir(testDir)
      for (const f of files) {
        if (f.startsWith('clan-999-') || f.startsWith('test-')) {
          await fs.unlink(path.join(testDir, f)).catch(() => {})
        }
      }
    } catch {
      // Ignorer si le dossier n'existe pas
    }
  })

  it('rejette avec 400 si l’ID de clan est invalide', async () => {
    const request = new Request('http://localhost/api/clans/invalid/settings/login-welcome/upload', {
      method: 'POST',
    })
    const response = await uploadHandler(request, { params: Promise.resolve({ clanId: 'invalid' }) })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toContain('Identifiant de clan invalide')
  })

  it('rejette avec 401 si aucun membre actif dans la session', async () => {
    mocks.getActorMemberId.mockResolvedValue(null)

    const request = new Request('http://localhost/api/clans/7/settings/login-welcome/upload', {
      method: 'POST',
    })
    const response = await uploadHandler(request, { params: Promise.resolve({ clanId: '7' }) })

    expect(response.status).toBe(401)
  })

  it('rejette avec 403 si la permission manage_settings est refusée', async () => {
    mocks.getActorMemberId.mockResolvedValue(47)
    mocks.requirePermission.mockReturnValue(async () => Response.json({ error: 'Forbidden' }, { status: 403 }))

    const request = new Request('http://localhost/api/clans/7/settings/login-welcome/upload', {
      method: 'POST',
    })
    const response = await uploadHandler(request, { params: Promise.resolve({ clanId: '7' }) })

    expect(response.status).toBe(403)
  })

  it('accepte et sauvegarde une image JPEG valide, puis permet sa lecture via la route GET', async () => {
    mocks.getActorMemberId.mockResolvedValue(47)
    mocks.requirePermission.mockReturnValue(async () => null)

    const jpegBytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]
    const fakeBlob = new Blob([new Uint8Array(jpegBytes)], { type: 'image/jpeg' })

    const formData = new FormData()
    formData.append('file', fakeBlob, 'test-banner.jpg')

    const request = new Request('http://localhost/api/clans/999/settings/login-welcome/upload', {
      method: 'POST',
      body: formData,
    })

    const response = await uploadHandler(request, { params: Promise.resolve({ clanId: '999' }) })
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.imageUrl).toMatch(/^\/uploads\/clans\/clan-999-\d+\.jpg$/)

    // Tester la route GET servant cette image
    const fileName = path.basename(json.imageUrl)
    const getRequest = new Request(`http://localhost/uploads/clans/${fileName}`, { method: 'GET' })
    const getResponse = await getUploadedImage(getRequest, { params: Promise.resolve({ fileName }) })

    expect(getResponse.status).toBe(200)
    expect(getResponse.headers.get('Content-Type')).toBe('image/jpeg')
    expect(getResponse.headers.get('Cache-Control')).toContain('public')

    const arrayBuf = await getResponse.arrayBuffer()
    expect(new Uint8Array(arrayBuf).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]))
  })

  it('GET /uploads/clans/[fileName] renvoie 404 pour un fichier inexistant ou path traversal', async () => {
    const malicious = await getUploadedImage(new Request('http://localhost/uploads/clans/..%2F..%2Fetc%2Fpasswd'), {
      params: Promise.resolve({ fileName: '../../etc/passwd' }),
    })
    expect(malicious.status).toBe(404)

    const missing = await getUploadedImage(new Request('http://localhost/uploads/clans/missing-image.jpg'), {
      params: Promise.resolve({ fileName: 'missing-image.jpg' }),
    })
    expect(missing.status).toBe(404)
  })
})
