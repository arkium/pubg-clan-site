import { NextResponse } from 'next/server'
import { z } from 'zod'

import { resetPasswordWithToken } from '@/lib/auth-service'

const ResetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Token requis'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères'),
})

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown
  const validated = ResetPasswordSchema.safeParse(body)

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.issues[0]?.message ?? 'Requête invalide' },
      { status: 400 }
    )
  }

  try {
    await resetPasswordWithToken({
      token: validated.data.token,
      newPassword: validated.data.newPassword,
    })

    return NextResponse.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès.',
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.error('Reset password error:', error)
    return NextResponse.json({ error: 'Échec de la réinitialisation du mot de passe' }, { status: 500 })
  }
}
