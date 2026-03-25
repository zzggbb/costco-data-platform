import { Component, useState } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { UpdateButton } from './components/UpdateButton'
import { MetricsBar } from './components/MetricsBar'
import { ArbitrageTable } from './components/ArbitrageTable'
import { BusinessIntelligence } from './components/BusinessIntelligence'
import { useEtlStore } from './stores/etlStore'
import type { NewItem, RemovedItem } from './stores/etlStore'
import {
  PlusCircleIcon,
  MinusCircleIcon,
  MagnifyingGlassIcon,
  ChartBarSquareIcon,
} from '@heroicons/react/24/outline'

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
  second: '2-digit',
  hour12: false,
})

// ---- Error Boundary ----

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard crash:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-surface-primary flex items-center justify-center p-8">
          <div className="max-w-lg text-center">
            <p className="text-blood-red font-mono text-sm uppercase tracking-widest mb-4">
              Render Error
            </p>
            <p className="text-text-muted font-mono text-xs break-all">
              {this.state.error.message}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---- New Items / Removed Items Panels ----

function NewItemsPanel({ items }: { items: NewItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="rounded border border-border-subtle bg-surface-card p-4">
      <h3 className="font-mono text-xs uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        <PlusCircleIcon className="h-4 w-4 text-neon-green" />
        New Items
        <span className="text-text-dim">({items.length})</span>
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-sm font-mono"
          >
            <span className="text-text-primary truncate max-w-md" title={item.name}>
              {item.name}
            </span>
            <span className="text-neon-green font-tabular ml-4 shrink-0">
              {item.min_price != null ? usd.format(item.min_price) : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RemovedItemsPanel({ items }: { items: RemovedItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="rounded border border-border-subtle bg-surface-card p-4">
      <h3 className="font-mono text-xs uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        <MinusCircleIcon className="h-4 w-4 text-blood-red" />
        Removed Items
        <span className="text-text-dim">({items.length})</span>
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between text-sm font-mono"
          >
            <span className="text-text-muted line-through truncate max-w-md" title={item.name}>
              {item.name}
            </span>
            <span className="text-blood-red font-tabular ml-4 shrink-0">
              {item.last_min_price != null ? usd.format(item.last_min_price) : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Inventory Change Grid (New + Removed side by side) ----

function InventoryChanges() {
  const report = useEtlStore((s) => s.report)

  const newItems = report?.delta?.new_items ?? []
  const removedItems = report?.delta?.removed_items ?? []

  if (newItems.length === 0 && removedItems.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <NewItemsPanel items={newItems} />
      <RemovedItemsPanel items={removedItems} />
    </div>
  )
}

// ---- Footer ----

function Footer() {
  const report = useEtlStore((s) => s.report)

  if (!report?.finished_at) return null

  let formatted: string
  try {
    formatted = dateFmt.format(new Date(report.finished_at))
  } catch {
    formatted = report.finished_at
  }

  return (
    <footer className="border-t border-zinc-800/50 py-4 text-center">
      <p className="font-mono text-xs text-text-dim">
        Last updated: {formatted}
        <span className="mx-2 text-zinc-700">|</span>
        Run: {report.run_id}
        <span className="mx-2 text-zinc-700">|</span>
        {report.duration_s.toFixed(2)}s total
      </p>
    </footer>
  )
}

// ---- Tab Definitions ----

type TabId = 'catalog' | 'intelligence'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'catalog',
    label: 'Explorar Catálogo',
    icon: <MagnifyingGlassIcon className="h-4 w-4" />,
  },
  {
    id: 'intelligence',
    label: 'Business Intelligence',
    icon: <ChartBarSquareIcon className="h-4 w-4" />,
  },
]

// ---- Main App ----

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('catalog')

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface-primary flex flex-col">
        {/* ---- Sticky Header ---- */}
        <header className="sticky top-0 z-50 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <h1 className="font-mono text-sm sm:text-base font-bold uppercase tracking-widest text-text-primary">
              Costco Data ETL
            </h1>
            <UpdateButton />
          </div>
        </header>

        {/* ---- Hero Section ---- */}
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/60 to-surface-primary">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mb-3">
              Costco Data ETL{' '}
              <span className="text-neon-green">&</span>{' '}
              Market Intelligence
            </h2>
            <p className="text-text-muted text-sm sm:text-base max-w-3xl leading-relaxed">
              Motor de extracción sobre más de 1,400 categorías y decenas de miles de productos
              de uno de los mayoristas más grandes del mundo. Explorá el catálogo en vivo o accedé
              a la unidad de Business Intelligence para detectar anomalías de inventario, caídas de
              precio y rotaciones reales en las últimas 24 horas.
            </p>
          </div>
        </section>

        {/* ---- Tab Bar ---- */}
        <nav className="border-b border-zinc-800 bg-surface-primary/80 backdrop-blur-sm sticky top-[57px] z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1">
            {TABS.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 font-mono text-sm uppercase tracking-wider
                    border-b-2 transition-colors cursor-pointer
                    ${
                      active
                        ? 'border-neon-green text-neon-green'
                        : 'border-transparent text-text-dim hover:text-text-muted hover:border-zinc-600'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* ---- Tab Content ---- */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {activeTab === 'catalog' && (
            <>
              <MetricsBar />
              <InventoryChanges />
              <ArbitrageTable />
            </>
          )}

          {activeTab === 'intelligence' && (
            <BusinessIntelligence />
          )}
        </main>

        {/* ---- Footer ---- */}
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6">
          <Footer />
        </div>
      </div>
    </ErrorBoundary>
  )
}
