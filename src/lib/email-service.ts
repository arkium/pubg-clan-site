import nodemailer from 'nodemailer'

type EmailPayload = {
  to: string
  subject: string
  text: string
}

export type EmailSendResult = {
  delivered: boolean
  mode: 'smtp' | 'stub'
  to: string
  subject: string
  from: string | null
  messageId?: string
  accepted?: string[]
  rejected?: string[]
  reason?: string
}

let smtpTransport: nodemailer.Transporter | null = null

function readSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim() ?? ''
  const port = Number(process.env.SMTP_PORT ?? '0')
  const user = process.env.SMTP_USER?.trim() ?? ''
  const pass = process.env.SMTP_PASS?.trim() ?? ''
  const from = process.env.SMTP_FROM?.trim() ?? ''
  const secureRaw = process.env.SMTP_SECURE?.trim().toLowerCase() ?? ''

  const allRequiredSet = host.length > 0 && port > 0 && user.length > 0 && pass.length > 0 && from.length > 0

  return {
    allRequiredSet,
    host,
    port,
    user,
    pass,
    from: from.length > 0 ? from : null,
    secure: secureRaw === 'true' || port === 465,
  }
}

function getSmtpTransport(config: ReturnType<typeof readSmtpConfig>) {
  if (smtpTransport) {
    return smtpTransport
  }

  smtpTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  })

  return smtpTransport
}

export async function sendEmail(payload: EmailPayload) {
  const config = readSmtpConfig()

  if (!config.allRequiredSet) {
    console.info('[EmailService] Stub mode (SMTP not fully configured)', {
      to: payload.to,
      subject: payload.subject,
    })
    console.info('[EmailService] Preview body', payload.text)

    return {
      delivered: false,
      mode: 'stub',
      to: payload.to,
      subject: payload.subject,
      from: config.from,
      reason: 'SMTP configuration incomplete',
    } satisfies EmailSendResult
  }

  const fromAddress = config.from
  if (!fromAddress) {
    throw new Error('SMTP_FROM is required when SMTP is enabled')
  }

  const transporter = getSmtpTransport(config)
  const result = await transporter.sendMail({
    from: fromAddress,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
  })

  return {
    delivered: true,
    mode: 'smtp',
    to: payload.to,
    subject: payload.subject,
    from: fromAddress,
    messageId: result.messageId,
    accepted: result.accepted.map((value: unknown) => String(value)),
    rejected: result.rejected.map((value: unknown) => String(value)),
  } satisfies EmailSendResult
}
