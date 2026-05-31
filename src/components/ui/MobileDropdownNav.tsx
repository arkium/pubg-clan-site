'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type MobileDropdownNavItem = {
  key: string
  label: string
  href?: string
  onSelect?: () => void
  active?: boolean
  icon?: ReactNode
}

export type MobileDropdownNavVariant = 'default' | 'compact' | 'minimal' | 'danger'

type MobileDropdownNavProps = {
  id: string
  label: string
  currentLabel: string
  items: MobileDropdownNavItem[]
  leftIcon?: ReactNode
  variant?: MobileDropdownNavVariant
  visibilityClass?: string
  className?: string
}

export default function MobileDropdownNav({
  id,
  label,
  currentLabel,
  items,
  leftIcon,
  variant = 'default',
  visibilityClass = 'md:hidden',
  className,
}: MobileDropdownNavProps) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const activeItem = items.find((item) => item.active) ?? items[0]
  const triggerIcon = activeItem?.icon ?? leftIcon

  useEffect(() => {
    if (!open) {
      return
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (!dropdownRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div
      key={currentLabel}
      className={`mobile-dropdown-nav mobile-dropdown-nav--${variant} member-section-nav ${visibilityClass}${className ? ` ${className}` : ''}`}
    >
      <p className="member-section-nav-mobile-label block text-[11px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </p>

      <div className="member-section-nav-mobile-dropdown mt-2" ref={dropdownRef}>
        <button
          id={id}
          type="button"
          className="member-section-nav-mobile-trigger"
          aria-expanded={open}
          aria-controls={`${id}-menu`}
          onClick={() => setOpen((current) => !current)}
        >
          {triggerIcon ? (
            <span className="member-section-nav-mobile-icon" aria-hidden="true">
              {triggerIcon}
            </span>
          ) : null}

          <span className="member-section-nav-mobile-current">{currentLabel}</span>

          <span className={`member-section-nav-mobile-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
              <path
                d="m5.5 7.5 4.5 5 4.5-5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        {open ? (
          <div id={`${id}-menu`} className="member-section-nav-mobile-menu" role="menu">
            {items.map((item) => {
              const itemClass = `member-section-nav-mobile-item${item.active ? ' member-section-nav-mobile-item-active' : ''}`

              if (item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    role="menuitem"
                    className={itemClass}
                    onClick={() => {
                      item.onSelect?.()
                      setOpen(false)
                    }}
                  >
                    {item.label}
                  </Link>
                )
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    item.onSelect?.()
                    setOpen(false)
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
