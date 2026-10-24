'use client'

import { Lightbulb } from 'lucide-react'
import { useMemo } from 'react'

import { parseCoachMarkdown, type CoachInline } from '@/lib/coach/coach-markdown'

/** Rendu d'une réponse du Coach IA : blocs construits à partir du texte, jamais de HTML injecté. */

function Inlines({ inlines }: { inlines: CoachInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => (inline.bold ? <b key={index}>{inline.text}</b> : <span key={index}>{inline.text}</span>))}
    </>
  )
}

export default function CoachMarkdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseCoachMarkdown(text), [text])
  if (blocks.length === 0) return null
  return (
    <div className="coach-markdown">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <p key={index} className="coach-answer-title">
                {block.text}
              </p>
            )
          case 'list':
            return (
              <ul key={index} className="coach-points">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inlines inlines={item} />
                  </li>
                ))}
              </ul>
            )
          case 'reco':
            return (
              <div key={index} className="coach-reco">
                <Lightbulb className="coach-ico" aria-hidden="true" />
                <div>
                  <Inlines inlines={block.inlines} />
                </div>
              </div>
            )
          case 'paragraph':
            return (
              <p key={index} className="m-0">
                <Inlines inlines={block.inlines} />
              </p>
            )
        }
      })}
    </div>
  )
}
