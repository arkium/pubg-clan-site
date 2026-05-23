type EmailPayload = {
  to: string
  subject: string
  text: string
}

export async function sendEmail(payload: EmailPayload) {
  // This project currently uses a log-based delivery stub.
  // Plug your provider here (SendGrid, Resend, SES, etc.) when ready.
  console.info('[EmailService] Queued email', {
    to: payload.to,
    subject: payload.subject,
  })

  console.info('[EmailService] Preview body', payload.text)
}
