'use client'

type FilterOption = {
  value: string
  label: string
}

type FilterDropdownProps = {
  id: string
  label: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

export default function FilterDropdown({
  id,
  label,
  value,
  options,
  onChange,
  className,
  disabled = false,
}: FilterDropdownProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
