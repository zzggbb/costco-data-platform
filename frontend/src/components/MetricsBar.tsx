import { useEtlStore } from '../stores/etlStore'

interface MetricCardProps {
  title: string
  value: string
  color: 'default' | 'green' | 'red'
  hasData: boolean
}

function MetricCard({ title, value, color, hasData }: MetricCardProps) {
  const valueColor =
    color === 'green'
      ? 'text-neon-green'
      : color === 'red'
        ? 'text-blood-red'
        : 'text-text-primary'

  return (
    <div className="rounded border border-border-subtle bg-surface-card px-4 py-3">
      <p className="text-xs font-mono uppercase tracking-wider text-text-dim mb-1">
        {title}
      </p>
      <p
        className={`text-2xl font-mono font-tabular font-bold transition-colors duration-300 ${
          hasData ? valueColor : 'text-zinc-600'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function MetricsBar() {
  const report = useEtlStore((s) => s.report)

  const summary = report?.delta?.summary
  const scrapeDuration = report?.stages?.scrape_catalog?.duration_s
  const hasData = !!summary

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <MetricCard
        title="Total Products"
        value={hasData ? summary.current_count.toLocaleString() : '--'}
        color="default"
        hasData={hasData}
      />
      <MetricCard
        title="Price Drops"
        value={hasData ? String(summary.price_drop_count) : '--'}
        color="green"
        hasData={hasData}
      />
      <MetricCard
        title="New Items"
        value={hasData ? String(summary.new_count) : '--'}
        color="default"
        hasData={hasData}
      />
      <MetricCard
        title="Removed"
        value={hasData ? String(summary.removed_count) : '--'}
        color="red"
        hasData={hasData}
      />
      <MetricCard
        title="Scrape Time"
        value={
          scrapeDuration != null ? `${scrapeDuration.toFixed(1)}s` : '--'
        }
        color="default"
        hasData={hasData}
      />
    </div>
  )
}
