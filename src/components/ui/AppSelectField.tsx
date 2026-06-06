type AppSelectFieldOption = {
  value: string
  label: string
}

type AppSelectFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: AppSelectFieldOption[]
  className?: string
  selectClassName?: string
}

export default function AppSelectField({
  id,
  label,
  value,
  onChange,
  options,
  className,
  selectClassName,
}: AppSelectFieldProps) {
  return (
    <label className={['block text-sm text-slate-700 min-w-0', className ?? ''].join(' ').trim()} htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={[
          'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm',
          selectClassName ?? '',
        ]
          .join(' ')
          .trim()}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
