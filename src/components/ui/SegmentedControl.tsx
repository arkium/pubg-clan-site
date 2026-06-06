type SegmentedOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
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
  const widthClass = fullWidthOnMobile ? 'w-full sm:w-auto' : ''
  const nowrapClass = fullWidthOnMobile && !wrap ? 'sm:flex-nowrap' : ''

  return (
    <div
      className={[
        'app-segmented-control inline-flex rounded border border-gray-200 p-0.5',
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
          className={[
            'app-segmented-control__item font-medium transition-colors',
            sizeClass,
            option.disabled ? 'cursor-not-allowed opacity-45 text-gray-400 hover:bg-transparent' : '',
            option.value === value
              ? 'app-segmented-control__item--active bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100',
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}