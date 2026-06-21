'use client'

import { useEffect, useState } from 'react'

export type StickySectionNavIcon =
  | 'playstyle'
  | 'combat'
  | 'victory'
  | 'support'
  | 'vehicle'
  | 'movement'
  | 'other'
  | 'category'

export type StickySectionNavItem = {
  id: string
  label: string
  icon?: StickySectionNavIcon
}

type StickySectionNavProps = {
  items: StickySectionNavItem[]
  ariaLabel: string
  topClassName?: string
  className?: string
  activeOffset?: number
}

function renderIcon(icon: StickySectionNavIcon) {
  if (icon === 'combat') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M9.25 2a.75.75 0 0 1 .75.75v1.06a6.2 6.2 0 0 1 5.44 5.44h1.06a.75.75 0 0 1 0 1.5h-1.06A6.2 6.2 0 0 1 10 16.19v1.06a.75.75 0 0 1-1.5 0v-1.06A6.2 6.2 0 0 1 3.06 10.75H2a.75.75 0 0 1 0-1.5h1.06A6.2 6.2 0 0 1 8.5 3.81V2.75A.75.75 0 0 1 9.25 2Zm.75 3.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Zm0 2a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5Z" />
      </svg>
    )
  }

  if (icon === 'victory') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M5 2.5A1.5 1.5 0 0 0 3.5 4v1.5A3.5 3.5 0 0 0 7 9h.06A3.98 3.98 0 0 0 9 10.73V13H7.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H11v-2.27A3.98 3.98 0 0 0 12.94 9H13a3.5 3.5 0 0 0 3.5-3.5V4A1.5 1.5 0 0 0 15 2.5H5Zm10 1.5v1.5A2 2 0 0 1 13 7h-.03c.02-.17.03-.33.03-.5V4h2ZM7 6.5c0 .17.01.33.03.5H7a2 2 0 0 1-2-2V4h2v2.5Z" />
      </svg>
    )
  }

  if (icon === 'support') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 3a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 10 3Zm-5.5 8a2.5 2.5 0 0 1 2.5-2.5H8a.75.75 0 0 1 0 1.5H7A1 1 0 0 0 6 11v2.5A1.5 1.5 0 0 0 7.5 15H12a.75.75 0 0 1 0 1.5H7.5A3 3 0 0 1 4.5 13.5V11Zm8.5 4a.75.75 0 0 1 0-1.5h.5a1 1 0 0 0 1-1V10a1.5 1.5 0 0 0-1.5-1.5H12a.75.75 0 0 1 0-1.5h1a3 3 0 0 1 3 3v2.5a2.5 2.5 0 0 1-2.5 2.5H13Z" />
      </svg>
    )
  }

  if (icon === 'vehicle') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5V11a2 2 0 0 1-2 2v1a1 1 0 1 1-2 0v-1H8v1a1 1 0 1 1-2 0v-1a2 2 0 0 1-2-2V6.5ZM6.5 5.5A1 1 0 0 0 5.5 6.5V9h9V6.5a1 1 0 0 0-1-1h-7ZM7 11.25a.75.75 0 1 0 0 1.5h.01a.75.75 0 0 0 0-1.5H7Zm6 0a.75.75 0 1 0 0 1.5h.01a.75.75 0 0 0 0-1.5H13Z" />
      </svg>
    )
  }

  if (icon === 'movement') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M3.47 12.53a.75.75 0 0 1 1.06 0l2.22 2.22 3.72-5.57a.75.75 0 0 1 1.11-.14l2.22 1.98 1.67-2.5a.75.75 0 1 1 1.24.84l-2.14 3.2a.75.75 0 0 1-1.11.15l-2.24-2-3.76 5.63a.75.75 0 0 1-1.15.1l-2.8-2.8a.75.75 0 0 1 0-1.06Z" />
      </svg>
    )
  }

  if (icon === 'other' || icon === 'category') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
        <path d="M10 2.5a.75.75 0 0 1 .75.75v.58a6.26 6.26 0 0 1 2.4 1l.4-.4a.75.75 0 0 1 1.06 1.06l-.4.4a6.26 6.26 0 0 1 1 2.4h.58a.75.75 0 0 1 0 1.5h-.58a6.26 6.26 0 0 1-1 2.4l.4.4a.75.75 0 1 1-1.06 1.06l-.4-.4a6.26 6.26 0 0 1-2.4 1v.58a.75.75 0 0 1-1.5 0v-.58a6.26 6.26 0 0 1-2.4-1l-.4.4a.75.75 0 1 1-1.06-1.06l.4-.4a6.26 6.26 0 0 1-1-2.4h-.58a.75.75 0 0 1 0-1.5h.58a6.26 6.26 0 0 1 1-2.4l-.4-.4a.75.75 0 0 1 1.06-1.06l.4.4a6.26 6.26 0 0 1 2.4-1v-.58A.75.75 0 0 1 10 2.5Zm0 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
      <path d="M10 2.5a.75.75 0 0 1 .75.75v1.62a5.5 5.5 0 0 1 4.38 4.38h1.62a.75.75 0 0 1 0 1.5h-1.62a5.5 5.5 0 0 1-4.38 4.38v1.62a.75.75 0 0 1-1.5 0v-1.62a5.5 5.5 0 0 1-4.38-4.38H3.25a.75.75 0 0 1 0-1.5h1.62a5.5 5.5 0 0 1 4.38-4.38V3.25A.75.75 0 0 1 10 2.5Zm0 3.75a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  )
}

export default function StickySectionNav({
  items,
  ariaLabel,
  topClassName = 'top-20',
  className,
  activeOffset = 220,
}: StickySectionNavProps) {
  const [activeSectionId, setActiveSectionId] = useState(items[0]?.id ?? '')

  useEffect(() => {
    const itemIds = items.map((item) => item.id)

    const syncActiveWithHash = () => {
      const nextId = window.location.hash.replace('#', '')
      if (itemIds.includes(nextId)) {
        setActiveSectionId(nextId)
      }
    }

    syncActiveWithHash()
    window.addEventListener('hashchange', syncActiveWithHash)

    return () => {
      window.removeEventListener('hashchange', syncActiveWithHash)
    }
  }, [items])

  useEffect(() => {
    const updateActiveFromScroll = () => {
      const sectionElements = items
        .map((item) => document.getElementById(item.id))
        .filter((node): node is HTMLElement => !!node)

      if (sectionElements.length === 0) {
        return
      }

      let nextActiveId = sectionElements[0].id

      for (const section of sectionElements) {
        const top = section.getBoundingClientRect().top
        if (top <= activeOffset) {
          nextActiveId = section.id
        } else {
          break
        }
      }

      setActiveSectionId(nextActiveId)
    }

    updateActiveFromScroll()
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        updateActiveFromScroll()
      })
    })

    window.addEventListener('scroll', updateActiveFromScroll, { passive: true })
    window.addEventListener('resize', updateActiveFromScroll)

    return () => {
      window.removeEventListener('scroll', updateActiveFromScroll)
      window.removeEventListener('resize', updateActiveFromScroll)
    }
  }, [activeOffset, items])

  if (items.length === 0) {
    return null
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`sticky ${topClassName} z-30 rounded-2xl border border-cyan-300/35 bg-slate-950/35 p-2.5 shadow-[0_10px_30px_rgba(34,211,238,0.22),0_0_0_1px_rgba(59,130,246,0.22)_inset] backdrop-blur-xl ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => setActiveSectionId(item.id)}
            aria-current={activeSectionId === item.id ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap ${
              activeSectionId === item.id
                ? 'bg-cyan-400/20 text-cyan-100'
                : 'bg-white/10 text-slate-200 hover:bg-cyan-400/15 hover:text-cyan-100'
            }`}
          >
            {item.icon ? (
              <span className="inline-flex h-4 w-4 items-center justify-center text-cyan-200 shrink-0" aria-hidden="true">
                {renderIcon(item.icon)}
              </span>
            ) : null}
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
