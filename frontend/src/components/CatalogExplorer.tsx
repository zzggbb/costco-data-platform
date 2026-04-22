import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MagnifyingGlassIcon,
  StarIcon,
  CubeIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'

// ---- Types ----

interface Category {
  name: string
  url: string
}

interface Product {
  id: string
  name: string
  min_price: number | null
  max_price: number | null
  rating: number | null
  image_url: string | null
  review_count: number | null
}

interface CategoryMetrics {
  product_count: number
  total_reviews: number
  avg_rating: number | null
  avg_min_price: number | null
  sale_count: number
}

// ---- Formatting ----

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

// ---- Flatten category tree ----

function flattenTree(tree: Record<string, any>): Category[] {
  const result: Category[] = []

  function traverse(node: Record<string, any>) {
    for (const key of Object.keys(node)) {
      const obj = node[key]
      if (obj.url) {
        result.push({ name: key, url: obj.url })
      }
      if (obj.children && Object.keys(obj.children).length > 0) {
        traverse(obj.children)
      }
    }
  }

  traverse(tree)
  return result
}

// ---- Star Rating ----

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-text-dim text-xs">No rating</span>

  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.3

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full) return <StarSolid key={i} className="h-3.5 w-3.5 text-amber-400" />
        if (i === full && hasHalf) return <StarSolid key={i} className="h-3.5 w-3.5 text-amber-400/50" />
        return <StarIcon key={i} className="h-3.5 w-3.5 text-zinc-600" />
      })}
      <span className="ml-1 text-xs font-mono text-text-muted">{rating.toFixed(1)}</span>
    </span>
  )
}

// ---- Product Card ----

function ProductCard({ product }: { product: Product }) {
  const hasPrice = product.min_price != null
  const hasDualPrice = hasPrice && product.max_price != null && product.max_price !== product.min_price

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-3 flex flex-col gap-2 hover:border-zinc-500 transition-colors">
      {product.image_url ? (
        <div className="w-full aspect-square rounded bg-white/5 overflow-hidden flex items-center justify-center">
          <img src={product.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        </div>
      ) : (
        <div className="w-full aspect-square rounded bg-surface-elevated flex items-center justify-center">
          <CubeIcon className="h-10 w-10 text-zinc-700" />
        </div>
      )}

      <p className="text-sm text-text-primary leading-snug line-clamp-2 min-h-[2.5rem]" title={product.name}>
        {product.name}
      </p>

      <div className="mt-auto">
        {hasPrice ? (
          <p className="font-mono text-lg font-bold text-text-primary font-tabular">
            {usd.format(product.min_price!)}
            {hasDualPrice && (
              <span className="text-sm text-text-dim font-normal ml-1">– {usd.format(product.max_price!)}</span>
            )}
          </p>
        ) : (
          <p className="font-mono text-sm text-text-dim">Price unavailable</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Stars rating={product.rating} />
        {product.review_count != null && product.review_count > 0 && (
          <span className="text-xs font-mono text-text-dim">{product.review_count.toLocaleString()}</span>
        )}
      </div>

      <p className="text-[10px] font-mono text-text-dim/50 truncate">SKU {product.id}</p>
    </div>
  )
}

// ---- Sort logic (toggle-based) ----

type SortField = 'price' | 'rating' | 'reviews'
type SortDir = 'desc' | 'asc'

function sortProducts(products: Product[], field: SortField, dir: SortDir): Product[] {
  const sorted = [...products]
  const mul = dir === 'desc' ? -1 : 1
  switch (field) {
    case 'reviews':
      return sorted.sort((a, b) => mul * ((a.review_count ?? 0) - (b.review_count ?? 0)))
    case 'rating':
      return sorted.sort((a, b) => mul * ((a.rating ?? 0) - (b.rating ?? 0)))
    case 'price':
      return sorted.sort((a, b) => mul * ((a.min_price ?? 0) - (b.min_price ?? 0)))
  }
}

// ---- Sort Toggle Button ----

function SortButton({
  label,
  field,
  activeField,
  activeDir,
  onClick,
}: {
  label: string
  field: SortField
  activeField: SortField
  activeDir: SortDir
  onClick: (field: SortField) => void
}) {
  const isActive = field === activeField

  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-1 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer ${
        isActive
          ? 'bg-neon-green/15 text-neon-green border border-neon-green/30'
          : 'bg-surface-card text-text-muted border border-border-subtle hover:bg-surface-elevated'
      }`}
    >
      {label}
      {isActive && (
        activeDir === 'desc'
          ? <ChevronDownIcon className="h-3 w-3" />
          : <ChevronUpIcon className="h-3 w-3" />
      )}
    </button>
  )
}

// ---- Metrics Bar ----

function MetricsBar({ metrics }: { metrics: CategoryMetrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div className="rounded border border-border-subtle bg-surface-card px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-dim">Productos</p>
        <p className="text-lg font-mono font-bold text-text-primary">{metrics.product_count.toLocaleString()}</p>
      </div>
      <div className="rounded border border-border-subtle bg-surface-card px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-dim">Reviews</p>
        <p className="text-lg font-mono font-bold text-text-primary">{metrics.total_reviews.toLocaleString()}</p>
      </div>
      <div className="rounded border border-border-subtle bg-surface-card px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-dim">Rating Prom.</p>
        <p className="text-lg font-mono font-bold text-amber-400">
          {metrics.avg_rating != null ? metrics.avg_rating.toFixed(1) : '—'}
        </p>
      </div>
      <div className="rounded border border-border-subtle bg-surface-card px-3 py-2 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-dim">Precio Prom.</p>
        <p className="text-lg font-mono font-bold text-neon-green">
          {metrics.avg_min_price != null ? usd.format(metrics.avg_min_price) : '—'}
        </p>
      </div>
    </div>
  )
}

// ---- Pagination ----

const PAGE_SIZE = 24

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded font-mono text-sm bg-surface-card border border-border-subtle hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        Prev
      </button>
      <span className="font-mono text-sm text-text-muted">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded font-mono text-sm bg-surface-card border border-border-subtle hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        Next
      </button>
    </div>
  )
}

// ---- Main Component ----

export function CatalogExplorer() {
  // Category state
  const [categories, setCategories] = useState<Category[]>([])
  const [catLoading, setCatLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [animatedName, setAnimatedName] = useState('Pick any!')
  const inputRef = useRef<HTMLInputElement>(null)

  // Product state
  const [products, setProducts] = useState<Product[]>([])
  const [prodLoading, setProdLoading] = useState(false)
  const [prodError, setProdError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('reviews')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [activeCatName, setActiveCatName] = useState<string | null>(null)

  // Metrics state
  const [metrics, setMetrics] = useState<CategoryMetrics | null>(null)

  // ---- Load products by category ----
  const loadProducts = useCallback(async (cat: Category) => {
    setActiveCatName(cat.name)
    setSearch(cat.name)
    setShowSuggestions(false)
    setProdLoading(true)
    setProdError(null)
    setPage(1)
    setMetrics(null)

    try {
      // Fetch products and metrics in parallel
      const [prodRes, metRes] = await Promise.all([
        fetch(`/api/costco/products/by-category?category_url=${encodeURIComponent(cat.url)}`),
        fetch(`/api/costco/categories/metrics?category_url=${encodeURIComponent(cat.url)}`),
      ])

      if (!prodRes.ok) throw new Error(`HTTP ${prodRes.status}`)
      const prodJson = await prodRes.json()
      setProducts(prodJson.products ?? [])

      if (metRes.ok) {
        const metJson = await metRes.json()
        setMetrics(metJson)
      }
    } catch (err) {
      setProdError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setProdLoading(false)
    }
  }, [])

  // ---- Load categories on mount + auto-load "Home & Kitchen" ----
  useEffect(() => {
    fetch('/api/costco/categories/tree')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.category_tree) {
          const flat = flattenTree(data.category_tree)
          setCategories(flat)

          // Exact match first, then fallback
          const defaultCat =
            flat.find((c) => c.name === 'Home & Kitchen') ??
            flat.find((c) => c.name.toLowerCase() === 'home & kitchen') ??
            flat[0]
          if (defaultCat) {
            loadProducts(defaultCat)
          }
        }
      })
      .catch(() => {})
      .finally(() => setCatLoading(false))
  }, [loadProducts])

  // ---- Animated category rotation ----
  useEffect(() => {
    if (categories.length === 0) return
    const interval = setInterval(() => {
      const rand = categories[Math.floor(Math.random() * categories.length)]
      setAnimatedName(rand.name)
    }, 1200)
    return () => clearInterval(interval)
  }, [categories])

  // ---- Surprise me ----
  const handleSurprise = () => {
    if (categories.length === 0) return
    const rand = categories[Math.floor(Math.random() * categories.length)]
    loadProducts(rand)
  }

  // ---- Explicit search (Buscar button / Enter key) ----
  const handleSearch = () => {
    const q = search.trim().toLowerCase()
    if (!q || categories.length === 0) return
    const exact = categories.find((c) => c.name.toLowerCase() === q)
    const best = exact ?? categories.find((c) => c.name.toLowerCase().includes(q))
    if (best) loadProducts(best)
  }

  // ---- Sort toggle handler ----
  const handleSortClick = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  // ---- Autocomplete matches ----
  const matches = search.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 15)
    : []

  // ---- Sorted & paginated products ----
  const sorted = sortProducts(products, sortField, sortDir)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageSlice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      {/* ---- Animated category name ---- */}
      <div className="text-center">
        <span className="text-neon-green font-mono text-sm transition-all duration-300">
          {animatedName}
        </span>
      </div>

      {/* ---- Search + Actions Row ---- */}
      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        {/* Search group: input + Buscar */}
        <div className="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
          {/* Search input with autocomplete */}
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-dim pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              disabled={catLoading}
              onChange={(e) => {
                setSearch(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  setShowSuggestions(false)
                  handleSearch()
                }
              }}
              placeholder={catLoading ? 'Loading categories…' : 'Search category (e.g. Rings, Appliances…)'}
              className="w-full bg-surface-card border border-border-subtle rounded-lg pl-10 pr-4 py-3 font-mono text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-neon-green/50 focus:ring-1 focus:ring-neon-green/20 transition-colors"
            />

            {/* Autocomplete dropdown */}
            {showSuggestions && matches.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-surface-card border border-border-subtle rounded-lg shadow-xl max-h-64 overflow-y-auto">
                {matches.map((cat) => (
                  <button
                    key={cat.url}
                    onClick={() => loadProducts(cat)}
                    className="w-full text-left px-4 py-2.5 font-mono text-sm text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer border-b border-zinc-800/30 last:border-0"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Buscar button (primary action) */}
          <button
            onClick={handleSearch}
            disabled={catLoading || !search.trim()}
            className="px-5 py-3 rounded-lg font-mono text-sm font-bold bg-neon-green text-black border border-neon-green hover:bg-neon-green/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Buscar
          </button>
        </div>

        {/* Random category group (labeled container) */}
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-text-dim font-mono px-1">
            Selecciona categoría al azar
          </span>
          <button
            onClick={handleSurprise}
            disabled={categories.length === 0}
            className="px-5 py-3 rounded-lg font-mono text-sm font-bold bg-neon-green/15 text-neon-green border border-neon-green/30 hover:bg-neon-green/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
          >
            Sorprendeme!
          </button>
        </div>
      </div>

      {/* ---- Close suggestions on outside click ---- */}
      {showSuggestions && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
      )}

      {/* ---- Metrics Bar ---- */}
      {metrics && !prodLoading && <MetricsBar metrics={metrics} />}

      {/* ---- Product Results Header + Sort ---- */}
      {activeCatName && !prodLoading && products.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="font-mono text-sm text-text-muted">
            <span className="text-text-primary font-bold">{activeCatName}</span>
            <span className="text-text-dim ml-2">({products.length} products)</span>
          </p>

          {/* Sort toggle buttons */}
          <div className="flex items-center gap-1.5">
            <SortButton label="Reviews" field="reviews" activeField={sortField} activeDir={sortDir} onClick={handleSortClick} />
            <SortButton label="Rating" field="rating" activeField={sortField} activeDir={sortDir} onClick={handleSortClick} />
            <SortButton label="Precio" field="price" activeField={sortField} activeDir={sortDir} onClick={handleSortClick} />
          </div>
        </div>
      )}

      {/* Loading */}
      {prodLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <div className="h-8 w-8 border-2 border-text-dim border-t-neon-green rounded-full animate-spin mb-4" />
          <p className="font-mono text-sm">Loading products…</p>
        </div>
      )}

      {/* Error */}
      {prodError && !prodLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-text-dim">
          <p className="font-mono text-sm text-blood-red">{prodError}</p>
        </div>
      )}

      {/* Empty state (no category selected yet) */}
      {!prodLoading && !prodError && !activeCatName && (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <MagnifyingGlassIcon className="h-10 w-10 mb-4 opacity-30" />
          <p className="font-mono text-sm">Select a category or hit Surprise Me</p>
        </div>
      )}

      {/* Empty result */}
      {!prodLoading && !prodError && activeCatName && products.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-dim">
          <p className="font-mono text-sm">No products found in this category</p>
        </div>
      )}

      {/* Product grid */}
      {!prodLoading && !prodError && pageSlice.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {pageSlice.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
