import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RouteMode } from '@/audit/useAuditRoute'

interface ModeTabsProps {
  mode: RouteMode
  findingsCount: number
  recoveryCount: number
  onChange: (mode: RouteMode) => void
}

/**
 * Plain, functional switch between the three lenses on the same ledger.
 * Intentionally not the final spatial capsule — this is structural only.
 */
export function ModeTabs({ mode, findingsCount, recoveryCount, onChange }: ModeTabsProps) {
  return (
    <Tabs value={mode} onValueChange={(value) => onChange(value as RouteMode)}>
      <TabsList aria-label="View">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="findings">Findings{findingsCount > 0 ? ` (${findingsCount})` : ''}</TabsTrigger>
        <TabsTrigger value="recovery">Recovery{recoveryCount > 0 ? ` (${recoveryCount})` : ''}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
