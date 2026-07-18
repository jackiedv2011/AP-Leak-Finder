import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-ink text-white',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-hairline text-foreground',
        recoverable: 'border-transparent bg-recoverable/10 text-recoverable',
        review: 'border-transparent bg-review/10 text-review',
        opportunity: 'border-transparent bg-opportunity/10 text-opportunity',
        high: 'border-transparent bg-destructive/10 text-destructive',
        medium: 'border-transparent bg-review/10 text-review',
        low: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
