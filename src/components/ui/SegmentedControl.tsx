import type { ReactNode } from 'react'

type SegmentedOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
  /** Icône facultative, avant le libellé (lucide, 14 px). */
  icon?: ReactNode
}

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'xs' | 'sm'
  wrap?: boolean
  fullWidthOnMobile?: boolean
  className?: string
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'xs',
  wrap = false,
  fullWidthOnMobile = false,
  className,
}: SegmentedControlProps<T>) {
  const sizeClass = size === 'sm' ? 'app-segmented-control__item--sm' : 'app-segmented-control__item--xs'
  const wrapClass = wrap ? 'flex-wrap' : ''
  // Le cadre épouse ses boutons (jamais de vide à droite) : pleine largeur partagée sur mobile, ajusté ensuite.
  const widthClass = fullWidthOnMobile ? 'w-full sm:w-fit' : ''
  const itemWidthClass = fullWidthOnMobile ? 'flex-1 sm:flex-none' : ''
  const nowrapClass = fullWidthOnMobile && !wrap ? 'sm:flex-nowrap' : ''

  return (
    <div
      className={[
        // Piste, rayons et état actif : globals.css (.app-segmented-control), sur l'accent du thème.
        'app-segmented-control inline-flex border border-gray-200',
        wrapClass,
        widthClass,
        nowrapClass,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            if (!option.disabled) {
              onChange(option.value)
            }
          }}
          disabled={option.disabled}
          aria-pressed={option.value === value}
          // Bouton flex centré : une icône ne le rend pas plus haut qu'un bouton texte (même hauteur de rail partout).
          className={[
            'app-segmented-control__item inline-flex items-center justify-center gap-1.5 font-medium transition-colors',
            sizeClass,
            itemWidthClass,
            option.disabled ? 'cursor-not-allowed opacity-45 text-gray-400 hover:bg-transparent' : '',
            option.value === value ? 'app-segmented-control__item--active' : '',
          ].join(' ')}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}