import * as React from 'react'

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/60 dark:bg-slate-800/60 ${className ?? ''}`}
      {...props}
    />
  )
}

export { Skeleton }
