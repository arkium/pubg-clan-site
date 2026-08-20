import * as React from 'react'
import { Skeleton } from '../Skeleton'

export function CardSkeleton({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`app-panel p-6 space-y-4 ${className ?? ''}`}>
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
