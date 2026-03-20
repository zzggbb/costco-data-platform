import { useState } from 'react'
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
} from '@tremor/react'
import { ChevronUpIcon, ChevronDownIcon, ArrowPathIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useEtlStore } from '../stores/etlStore'
import type { PriceDrop, PriceIncrease } from '../stores/etlStore'

// ---- Formatting ----

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

function fmtPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function truncate(text: string, max = 80): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

// ---- Sorting ----

type SortKey = 'name' | 'old_price' | 'new_price' | 'delta' | 'delta_pct'
type SortDir = 'asc' | 'desc'

function sortRows<T extends PriceDrop | PriceIncrease>(
  rows: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  return [...rows].sort((a, b) => {
    const av = key === 'name' ? a.name.toLowerCase() : a[key]
    const bv = key === 'name' ? b.name.toLowerCase() : b[key]
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ? 1 : -1
    return 0
  })
}

// ---- Sort Header ----

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}

function SortHeader({ label, sortKey, currentKey, currentDir, onSort, align = 'left' }: SortHeaderProps) {
  const active = currentKey === sortKey
  return (
    <TableHeaderCell
      className={`cursor-pointer select-none hover:text-text-primary transition-colors ${
        align === 'right' ? 'text-right' : ''
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          currentDir === 'asc'
            ? <ChevronUpIcon className="h-3 w-3" />
            : <ChevronDownIcon className="h-3 w-3" />
        )}
      </span>
    </TableHeaderCell>
  )
}

// ---- Price Change Table (reused for drops and increases) ----

interface PriceTableProps {
  rows: (PriceDrop | PriceIncrease)[]
  variant: 'drop' | 'increase'
}

function PriceTable({ rows, variant }: PriceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('delta')
  const [sortDir, setSortDir] = useState<SortDir>(variant === 'drop' ? 'asc' : 'desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const sorted = sortRows(rows, sortKey, sortDir)

  const badgeColor = variant === 'drop' ? 'text-neon-green bg-neon-green/10' : 'text-blood-red bg-blood-red/10'
  const stripedEven = 'bg-surface-card'
  const stripedOdd = 'bg-surface-primary'

  return (
    <div className="overflow-x-auto rounded border border-border-subtle">
      <Table>
        <TableHead>
          <TableRow className="border-b border-border-subtle bg-surface-elevated">
            <SortHeader label="Product" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Old Price" sortKey="old_price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            <SortHeader label="New Price" sortKey="new_price" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            <SortHeader label="Savings" sortKey="delta" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            <SortHeader label="%" sortKey="delta_pct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} align="right" />
            <TableHeaderCell className="text-right">ID</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((row, i) => (
            <TableRow
              key={row.id}
              className={`border-b border-zinc-800/50 transition-colors hover:bg-surface-elevated ${
                i % 2 === 0 ? stripedEven : stripedOdd
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
              <TableCell className="text-right font-mono text-xs text-text-dim">
                {row.id}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---- Main Component ----

export function ArbitrageTable() {
  const report = useEtlStore((s) => s.report)
  const [showIncreases, setShowIncreases] = useState(false)

  const priceDrops = report?.delta?.price_drops ?? []
  const priceIncreases = report?.delta?.price_increases ?? []

  // ---- Empty state ----
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-dim">
        <ArrowPathIcon className="h-8 w-8 mb-3 opacity-40" />
        <p className="font-mono text-sm">No data yet — hit Update Market Data to capture delta</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- Price Drops (the money table) ---- */}
      <div>
        <h2 className="font-mono text-sm uppercase tracking-widest text-neon-green mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-neon-green" />
          Price Drops
          <span className="text-text-dim font-normal">({priceDrops.length})</span>
        </h2>

        {priceDrops.length > 0 ? (
          <PriceTable rows={priceDrops} variant="drop" />
        ) : (
          <div className="rounded border border-border-subtle bg-surface-card py-10 text-center">
            <p className="text-text-dim font-mono text-sm">No price drops detected in this run</p>
          </div>
        )}
      </div>

      {/* ---- Price Increases (collapsible) ---- */}
      {priceIncreases.length > 0 && (
        <div>
          <button
            onClick={() => setShowIncreases((v) => !v)}
            className="font-mono text-sm uppercase tracking-widest text-blood-red mb-3 flex items-center gap-2 cursor-pointer hover:text-blood-red/80 transition-colors"
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform duration-200 ${showIncreases ? 'rotate-90' : ''}`}
            />
            Price Increases
            <span className="text-text-dim font-normal">({priceIncreases.length})</span>
          </button>

          {showIncreases && <PriceTable rows={priceIncreases} variant="increase" />}
        </div>
      )}
    </div>
  )
}
