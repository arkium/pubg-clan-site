import * as React from 'react'
import { Skeleton } from '../Skeleton'

interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number
}

export function TableSkeleton({ className, rows = 5, ...props }: TableSkeletonProps) {
  return (
    <div className={`app-panel overflow-hidden ${className ?? ''}`} {...props}>
      <div className="border-b border-[var(--theme-ui-border)] bg-[var(--theme-ui-bg-muted)] p-4">
        <Skeleton className="h-4 w-1/4" />
      </div>
      <div className="divide-y divide-[var(--theme-ui-border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}
