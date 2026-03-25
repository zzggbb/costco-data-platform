import { useState, useEffect } from 'react'
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react'
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  PlusCircleIcon,
  MinusCircleIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

// ---- Types (mirror backend delta shape) ----

interface PriceChange {
  id: string
  name: string
  old_price: number
  new_price: number
  delta: number
  delta_pct: number
}

interface NewItem {
  id: string
  name: string
  min_price: number | null
}

interface RemovedItem {
  id: string
  name: string
  last_min_price: number | null
}

interface DeltaSummary {
  previous_count: number
  current_count: number
  new_count: number
  removed_count: number
  price_drop_count: number
  price_increase_count: number
  unchanged_count: number
}

interface ArbitrageData {
  new_items: NewItem[]
  removed_items: RemovedItem[]
  price_drops: PriceChange[]
  price_increases: PriceChange[]
  summary: DeltaSummary
}

// ---- Formatting ----

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function fmtPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function truncate(text: string, max = 72): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

// ---- Summary Cards ----

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  accent?: string
}

function StatCard({ label, value, icon, accent = 'text-text-primary' }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-text-dim">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-widest">{label}</span>
      </div>
      <p className={`text-3xl font-mono font-bold font-tabular ${accent}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

// ---- Collapsible Section ----

interface SectionProps {
  title: string
  count: number
  icon: React.ReactNode
  accentColor: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, count, icon, accentColor, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (count === 0) return null

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-surface-elevated/50 transition-colors ${accentColor}`}
      >
        {icon}
        <span className="font-mono text-sm uppercase tracking-widest font-bold">{title}</span>
        <span className="text-text-dim font-mono text-sm font-normal">({count})</span>
        <ChevronRightIcon
          className={`h-4 w-4 ml-auto transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <div className="border-t border-border-subtle">{children}</div>}
    </div>
  )
}

// ---- Price Change Table ----

function PriceChangeTable({ rows, variant }: { rows: PriceChange[]; variant: 'drop' | 'increase' }) {
  const badgeColor = variant === 'drop' ? 'text-neon-green bg-neon-green/10' : 'text-blood-red bg-blood-red/10'

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHead>
          <TableRow className="border-b border-border-subtle bg-surface-elevated/50">
            <TableHeaderCell>Product</TableHeaderCell>
            <TableHeaderCell className="text-right">Previous</TableHeaderCell>
            <TableHeaderCell className="text-right">Current</TableHeaderCell>
            <TableHeaderCell className="text-right">Delta</TableHeaderCell>
            <TableHeaderCell className="text-right">%</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={row.id}
              className={`border-b border-zinc-800/40 transition-colors hover:bg-surface-elevated ${
                i % 2 === 0 ? 'bg-surface-card' : 'bg-surface-primary'
              }`}
            >
              <TableCell className="max-w-xs">
                <span className="font-mono text-sm text-text-primary" title={row.name}>
                  {truncate(row.name)}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-text-muted font-tabular">
                {usd.format(row.old_price)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-text-primary font-tabular">
                {usd.format(row.new_price)}
              </TableCell>
              <TableCell className="text-right">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold font-tabular ${badgeColor}`}>
                  {usd.format(row.delta)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold font-tabular ${badgeColor}`}>
                  {fmtPct(row.delta_pct)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---- Inventory List (new / removed) ----

function InventoryList({ items, variant }: { items: (NewItem | RemovedItem)[]; variant: 'new' | 'removed' }) {
  const isNew = variant === 'new'

  return (
    <div className="divide-y divide-zinc-800/40">
      {items.map((item) => {
        const price = isNew ? (item as NewItem).min_price : (item as RemovedItem).last_min_price
        return (
          <div key={item.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-surface-elevated/50 transition-colors">
            <span
              className={`font-mono text-sm truncate max-w-lg ${
                isNew ? 'text-text-primary' : 'text-text-muted line-through'
              }`}
              title={item.name}
            >
              {item.name}
            </span>
            <span className={`font-mono text-sm font-tabular ml-4 shrink-0 ${isNew ? 'text-neon-green' : 'text-blood-red'}`}>
              {price != null ? usd.format(price) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---- Main BI Dashboard ----

export function BusinessIntelligence() {
  const [data, setData] = useState<ArbitrageData | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchArbitrage() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/arbitrage/latest')
        if (!res.ok) {
          if (res.status === 404) {
            setError('No arbitrage data available yet. Run the ETL pipeline first to generate a delta report.')
            return
          }
          throw new Error(`HTTP ${res.status}`)
        }
        const json = await res.json()
        if (!cancelled) {
          setData(json.data)
          setUpdatedAt(json.updated_at)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load arbitrage data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchArbitrage()
    return () => { cancelled = true }
  }, [])

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-dim">
        <div className="h-8 w-8 border-2 border-text-dim border-t-neon-green rounded-full animate-spin mb-4" />
        <p className="font-mono text-sm">Loading intelligence report…</p>
      </div>
    )
  }

  // ---- Error / Empty ----
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-text-dim">
        <ExclamationTriangleIcon className="h-10 w-10 mb-4 text-yellow-500/60" />
        <p className="font-mono text-sm max-w-md text-center">{error || 'No data available'}</p>
      </div>
    )
  }

  const { summary, price_drops, price_increases, new_items, removed_items } = data

  const netChange = summary.current_count - summary.previous_count
  const netLabel = netChange >= 0 ? `+${netChange}` : String(netChange)

  let formattedDate = '—'
  if (updatedAt) {
    try {
      formattedDate = dateFmt.format(new Date(updatedAt))
    } catch {
      formattedDate = updatedAt
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Timestamp ---- */}
      <div className="flex items-center gap-2 text-text-dim font-mono text-xs">
        <ClockIcon className="h-3.5 w-3.5" />
        <span>Report generated: {formattedDate}</span>
      </div>

      {/* ---- KPI Grid ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Catalog Size"
          value={summary.current_count}
          icon={<ChartBarIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Net Change"
          value={netLabel}
          icon={netChange >= 0 ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <ArrowTrendingDownIcon className="h-4 w-4" />}
          accent={netChange >= 0 ? 'text-neon-green' : 'text-blood-red'}
        />
        <StatCard
          label="Price Drops"
          value={summary.price_drop_count}
          icon={<ArrowTrendingDownIcon className="h-4 w-4" />}
          accent="text-neon-green"
        />
        <StatCard
          label="Price Increases"
          value={summary.price_increase_count}
          icon={<ArrowTrendingUpIcon className="h-4 w-4" />}
          accent="text-blood-red"
        />
      </div>

      {/* ---- Secondary Stats ---- */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border-subtle bg-surface-card px-5 py-3 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-dim mb-1">New SKUs</p>
          <p className="text-xl font-mono font-bold font-tabular text-text-primary">{summary.new_count}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-card px-5 py-3 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-dim mb-1">Removed</p>
          <p className="text-xl font-mono font-bold font-tabular text-blood-red">{summary.removed_count}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-card px-5 py-3 text-center">
          <p className="font-mono text-[11px] uppercase tracking-widest text-text-dim mb-1">Unchanged</p>
          <p className="text-xl font-mono font-bold font-tabular text-text-muted">{summary.unchanged_count}</p>
        </div>
      </div>

      {/* ---- Price Drops (flagship section — always open) ---- */}
      <CollapsibleSection
        title="Price Drops"
        count={price_drops.length}
        icon={<ArrowTrendingDownIcon className="h-5 w-5" />}
        accentColor="text-neon-green"
        defaultOpen={true}
      >
        <PriceChangeTable rows={price_drops} variant="drop" />
      </CollapsibleSection>

      {/* ---- Price Increases ---- */}
      <CollapsibleSection
        title="Price Increases"
        count={price_increases.length}
        icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
        accentColor="text-blood-red"
      >
        <PriceChangeTable rows={price_increases} variant="increase" />
      </CollapsibleSection>

      {/* ---- New Items ---- */}
      <CollapsibleSection
        title="New Items"
        count={new_items.length}
        icon={<PlusCircleIcon className="h-5 w-5" />}
        accentColor="text-sky-400"
      >
        <InventoryList items={new_items} variant="new" />
      </CollapsibleSection>

      {/* ---- Removed Items ---- */}
      <CollapsibleSection
        title="Removed Items"
        count={removed_items.length}
        icon={<MinusCircleIcon className="h-5 w-5" />}
        accentColor="text-orange-400"
      >
        <InventoryList items={removed_items} variant="removed" />
      </CollapsibleSection>
    </div>
  )
}
