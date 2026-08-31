import { z } from 'zod'

import { changeUserPassword } from '@/lib/auth-service'
import { getSessionFromRequest } from '@/lib/auth-session'

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Le mot de passe actuel est requis'),
    newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caracteres'),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'Le nouveau mot de passe doit etre different',
    path: ['newPassword'],
  })

export async function PATCH(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json().catch(() => null)) as unknown
    const validated = ChangePasswordSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    await changeUserPassword({
      userId: session.userId,
      currentPassword: validated.data.currentPassword,
      newPassword: validated.data.newPassword,
    })

    return Response.json({
      success: true,
      message: 'Mot de passe mis a jour',
    })
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('Change password error:', error)
    return Response.json({ error: 'Failed to update password' }, { status: 500 })
  }
}