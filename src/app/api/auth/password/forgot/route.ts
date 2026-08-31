import { z } from 'zod'

import { requestPasswordReset } from '@/lib/auth-service'

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email('Adresse email invalide'),
})

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown
  const validated = ForgotPasswordSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Requête invalide' },
      { status: 400 }
    )
  }

  try {
    await requestPasswordReset(validated.data.email)

    return Response.json({
      success: true,
      message:
        'Si un compte correspond à cet email, un lien de réinitialisation vient d\'être envoyé.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)

    return Response.json({
      success: true,
      message:
        'Si un compte correspond à cet email, un lien de réinitialisation vient d\'être envoyé.',
    })
  }
}
