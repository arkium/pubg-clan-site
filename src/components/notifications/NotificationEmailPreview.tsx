import { Fragment } from 'react'

export type NotificationEmailPreviewData = {
  from: string | null
  subject: string
  text: string
  oneClickUnsubscribe: boolean
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

/** Corps en texte brut, adresses rendues cliquables (elles mènent aux vraies pages du joueur). */
function BodyText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} className="app-link break-all">
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}

/**
 * Aperçu d'un e-mail de notification tel qu'il part : en-têtes De / À / Objet, puis le texte brut construit par
 * `buildNotificationEmail` côté serveur (route GET des préférences) — aucun texte n'est réécrit ici.
 */
export function NotificationEmailPreview({ preview, to }: { preview: NotificationEmailPreviewData; to: string | null }) {
  return (
    <div className="app-panel-muted overflow-hidden" data-testid="email-preview">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-gray-200 px-3.5 py-3 text-[13px]">
        <dt className="t-label">De</dt>
        <dd className="truncate text-gray-700">{preview.from ?? 'chickendinner.fr'}</dd>
        <dt className="t-label">À</dt>
        <dd className="truncate text-gray-700">{to ?? 'ton adresse e-mail'}</dd>
        <dt className="t-label">Objet</dt>
        <dd className="font-semibold text-gray-900">{preview.subject}</dd>
      </dl>
      <p className="whitespace-pre-wrap break-words px-3.5 py-3 text-[13px] leading-relaxed text-gray-700">
        <BodyText text={preview.text} />
      </p>
    </div>
  )
}
