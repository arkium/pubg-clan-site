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
        <strong key={`b-${match.index}`} className="font-semibold">
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
            className="text-blue-500 hover:underline"
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

export default function DiscordEmbedPreview({ payload }: { payload: DiscordWebhookPayload }) {
  const embed = payload.embeds[0]

  if (!embed) return null

  return (
    <div className="space-y-2">
      {payload.content ? (
        <p className="text-sm font-semibold text-indigo-500">{payload.content}</p>
      ) : null}

      <div
        className="rounded-lg border-l-4 bg-gray-50 p-4 dark:bg-slate-900/60"
        style={{ borderLeftColor: toCssColor(embed.color) }}
      >
        {embed.title ? (
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {embed.url && isSafeHref(embed.url) ? (
              <a href={embed.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                {embed.title}
              </a>
            ) : (
              embed.title
            )}
          </p>
        ) : null}

        {embed.description ? (
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            <MultilineText text={embed.description} />
          </p>
        ) : null}

        {embed.fields?.length ? (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
            {embed.fields.map((field, index) => (
              <div key={index} className={field.inline ? 'min-w-24' : 'w-full'}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300">
                  {field.name}
                </p>
                <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
                  <MultilineText text={field.value} />
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {embed.thumbnail ? (
          <p className="mt-3 text-xs italic text-gray-500 dark:text-gray-400">
            Vignette : {embed.thumbnail.url}
          </p>
        ) : null}

        {embed.footer ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
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
