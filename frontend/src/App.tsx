import { Component, useState, useEffect } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { CatalogExplorer } from './components/CatalogExplorer'
import { BusinessIntelligence } from './components/BusinessIntelligence'
import {
  MagnifyingGlassIcon,
  ChartBarSquareIcon,
  ClockIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'

// ---- Formatting ----

const dateFmt = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
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

// ---- System Status Hook ----

interface SystemStatus {
  last_updated: string | null
  total_products: number
  total_categories: number
}

function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/costco/system/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return status
}

// ---- Tab Definitions ----

type TabId = 'catalog' | 'intelligence'

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
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
  const status = useSystemStatus()

  let formattedUpdate = '—'
  if (status?.last_updated) {
    try {
      formattedUpdate = dateFmt.format(new Date(status.last_updated))
    } catch {
      formattedUpdate = status.last_updated
    }
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface-primary flex flex-col">
        {/* ---- Header ---- */}
        <header className="sticky top-0 z-50 bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <a
              href="/"
              className="font-mono text-sm sm:text-base font-bold uppercase tracking-widest text-text-primary hover:text-neon-green transition-colors flex items-center gap-2"
            >
              <span className="text-text-dim">&larr;</span>
              leonardovila.com
            </a>

            {/* System Status Badge */}
            <div className="flex items-center gap-2 text-text-dim">
              <SignalIcon className="h-3.5 w-3.5 text-neon-green" />
              <span className="font-mono text-[11px] hidden sm:inline">
                {status
                  ? `${status.total_products.toLocaleString()} products · ${status.total_categories.toLocaleString()} categories`
                  : 'Connecting…'}
              </span>
            </div>
          </div>
        </header>

        {/* ---- Hero Section ---- */}
        <section className="border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/60 to-surface-primary">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
            <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mb-3">
              Costco Data ETL{' '}
              <span className="text-neon-green">&amp;</span>{' '}
              Market Intelligence
            </h2>
            <p className="text-text-muted text-sm sm:text-base max-w-3xl leading-relaxed mb-6">
              Motor de extracción sobre más de 1,000 categorías y decenas de miles de productos
              de uno de los mayoristas más grandes del mundo. Explorá el catálogo en vivo o accedé
              a la unidad de Business Intelligence para detectar anomalías de inventario, caídas de
              precio y rotaciones reales en las últimas 24 horas.
            </p>

            {/* Last Update — prominent */}
            <div className="inline-flex items-center gap-2 bg-surface-card border border-border-subtle rounded-lg px-4 py-2.5">
              <ClockIcon className="h-4 w-4 text-neon-green shrink-0" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-text-dim leading-none mb-0.5">
                  Última Actualización del Sistema
                </p>
                <p className="font-mono text-sm text-text-primary font-bold">
                  {formattedUpdate}
                </p>
              </div>
            </div>
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
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          {activeTab === 'catalog' && <CatalogExplorer />}
          {activeTab === 'intelligence' && <BusinessIntelligence />}
        </main>

        {/* ---- Footer ---- */}
        <footer className="border-t border-zinc-800/50 py-4">
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 text-center">
            <p className="font-mono text-xs text-text-dim">
              Interfaz de solo lectura · Datos actualizados diariamente via pipeline ETL automatizado
            </p>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  )
}
