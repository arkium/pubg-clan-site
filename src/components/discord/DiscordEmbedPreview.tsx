'use client'

import { Fragment, type ReactNode } from 'react'

import type { DiscordWebhookPayload } from '@/lib/discord/discord-client'

const INLINE_PATTERN = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g

function isSafeHref(url: string) {
  return /^https?:\/\//i.test(url)
}

/**
 * Rend le sous-ensemble de markdown que produisent nos generateurs d'embed
 * (gras et liens), pour que l'apercu corresponde a ce que Discord affichera.
 * Liens de la charte (`app-link`) : plus de bleu en dur.
 */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  INLINE_PATTERN.lastIndex = 0

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const [, bold, linkLabel, linkUrl] = match

    if (bold !== undefined) {
      nodes.push(
        <strong key={`b-${match.index}`} className="font-semibold text-gray-900">
          {bold}
        </strong>
      )
    } else if (linkLabel !== undefined && linkUrl !== undefined) {
      nodes.push(
        isSafeHref(linkUrl) ? (
          <a
            key={`a-${match.index}`}
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
            className="app-link"
          >
            {linkLabel}
          </a>
        ) : (
          <span key={`a-${match.index}`}>{linkLabel}</span>
        )
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function MultilineText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {renderInlineMarkdown(line)}
        </Fragment>
      ))}
    </>
  )
}

function toCssColor(color: number | undefined) {
  return `#${(color ?? 0x99aab5).toString(16).padStart(6, '0')}`
}

/**
 * Aperçu d'un message Discord, tel que le webhook le publiera. Charte UI (docs/ui/index.html) : surfaces, textes et
 * liens aux jetons du thème (clair et sombre sans `dark:`). Seule couleur propre à Discord, gardée comme signature : le
 * liseré gauche de l'embed, à la couleur que porte le message (`embed.color`, donnée et non teinte de page). Les émojis
 * du texte font partie du message publié : ils restent.
 */
export default function DiscordEmbedPreview({ payload }: { payload: DiscordWebhookPayload }) {
  const embed = payload.embeds[0]

  if (!embed) return null

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="discord-embed-preview">
      {payload.content ? <p className="t-body font-semibold text-gray-900">{payload.content}</p> : null}

      <div
        className="min-w-0 break-words rounded-[8px] border-l-4 bg-[var(--theme-ui-surface)] p-3 shadow-[inset_0_0_0_1px_var(--theme-ui-border)] sm:p-4"
        style={{ borderLeftColor: toCssColor(embed.color) }}
      >
        {embed.title ? (
          <p className="text-[13px] font-bold text-gray-900">
            {embed.url && isSafeHref(embed.url) ? (
              <a href={embed.url} target="_blank" rel="noreferrer" className="app-link">
                {embed.title}
              </a>
            ) : (
              embed.title
            )}
          </p>
        ) : null}

        {embed.description ? (
          <p className="t-body mt-1 text-gray-700">
            <MultilineText text={embed.description} />
          </p>
        ) : null}

        {embed.fields?.length ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            {embed.fields.map((field, index) => (
              <div key={index} className={`min-w-0 ${field.inline ? 'min-w-24' : 'w-full'}`}>
                <p className="text-[13px] font-bold text-gray-900">{field.name}</p>
                <p className="t-body mt-0.5 text-gray-700">
                  <MultilineText text={field.value} />
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {embed.thumbnail ? (
          <p className="t-meta mt-3 break-all italic">Vignette : {embed.thumbnail.url}</p>
        ) : null}

        {embed.footer ? (
          <p className="t-meta t-num mt-3">
            {embed.footer.text}
            {embed.timestamp
              ? ` · ${new Date(embed.timestamp).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`
              : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}
