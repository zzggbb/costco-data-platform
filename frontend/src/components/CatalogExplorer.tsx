import { useState, useEffect, useCallback } from 'react'
import {
  MagnifyingGlassIcon,
  StarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'

// ---- Types ----

interface Product {
  id: string
  name: string
  min_price: number | null
  max_price: number | null
  rating: number | null
  image_url: string | null
  review_count: number | null
}

interface CatalogResponse {
  products: Product[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ---- Formatting ----

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

// ---- Star Rating ----

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-text-dim text-xs">No rating</span>

  const full = Math.floor(rating)
  const hasHalf = rating - full >= 0.3

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        if (i < full) {
          return <StarSolid key={i} className="h-3.5 w-3.5 text-amber-400" />
        }
        if (i === full && hasHalf) {
          return <StarSolid key={i} className="h-3.5 w-3.5 text-amber-400/50" />
        }
        return <StarIcon key={i} className="h-3.5 w-3.5 text-zinc-600" />
      })}
      <span className="ml-1 text-xs font-mono text-text-muted">{rating.toFixed(1)}</span>
    </span>
  )
}

// ---- Product Card ----

function ProductCard({ product }: { product: Product }) {
  const hasPrice = product.min_price != null
  const hasDualPrice =
    hasPrice &&
    product.max_price != null &&
    product.max_price !== product.min_price

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 flex flex-col gap-3 hover:border-zinc-500 transition-colors">
      {/* Image placeholder */}
      {product.image_url ? (
        <div className="w-full aspect-square rounded bg-white/5 overflow-hidden flex items-center justify-center">
          <img
            src={product.image_url}
            alt=""
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="w-full aspect-square rounded bg-surface-elevated flex items-center justify-center">
          <CubeIcon className="h-10 w-10 text-zinc-700" />
        </div>
      )}

      {/* Name */}
      <p
        className="text-sm text-text-primary leading-snug line-clamp-2 min-h-[2.5rem]"
        title={product.name}
      >
        {product.name}
      </p>

      {/* Price */}
      <div className="mt-auto">
        {hasPrice ? (
          <p className="font-mono text-lg font-bold text-text-primary font-tabular">
            {usd.format(product.min_price!)}
            {hasDualPrice && (
              <span className="text-sm text-text-dim font-normal ml-1">
                – {usd.format(product.max_price!)}
              </span>
            )}
          </p>
        ) : (
          <p className="font-mono text-sm text-text-dim">Price unavailable</p>
        )}
      </div>

      {/* Rating + Reviews */}
      <div className="flex items-center justify-between">
        <Stars rating={product.rating} />
        {product.review_count != null && product.review_count > 0 && (
          <span className="text-xs font-mono text-text-dim">
            {product.review_count.toLocaleString()} reviews
          </span>
        )}
      </div>

      {/* ID */}
      <p className="text-[10px] font-mono text-text-dim/60 truncate">
        SKU: {product.id}
      </p>
    </div>
  )
}

// ---- Pagination ----

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null

  const range: (number | '...')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      range.push(i)
    } else if (range[range.length - 1] !== '...') {
      range.push('...')
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      {range.map((item, idx) =>
        item === '...' ? (
          <span key={`dots-${idx}`} className="px-2 text-text-dim font-mono text-sm">
            …
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item as number)}
            className={`min-w-[2rem] h-8 rounded font-mono text-sm transition-colors cursor-pointer ${
              item === page
                ? 'bg-neon-green/15 text-neon-green border border-neon-green/30'
                : 'hover:bg-surface-elevated text-text-muted'
            }`}
          >
            {item}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---- Main Component ----

const PAGE_SIZE = 48

export function CatalogExplorer() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch catalog
  const fetchCatalog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      })
      if (debouncedSearch.trim()) {
        params.set('search', debouncedSearch.trim())
      }

      const res = await fetch(`/api/catalog?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: CatalogResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch])

  useEffect(() => {
    fetchCatalog()
  }, [fetchCatalog])

  return (
    <div className="space-y-5">
      {/* ---- Search Bar ---- */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-dim pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products by name…"
          className="w-full bg-surface-card border border-border-subtle rounded-lg pl-10 pr-4 py-3 font-mono text-sm text-text-primary placeholder-text-dim focus:outline-none focus:border-neon-green/50 focus:ring-1 focus:ring-neon-green/20 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-muted transition-colors cursor-pointer text-sm font-mono"
          >
            Clear
          </button>
        )}
      </div>

      {/* ---- Result Count ---- */}
      {data && !loading && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-text-dim">
            {data.total.toLocaleString()} product{data.total !== 1 ? 's' : ''}
            {debouncedSearch && ` matching "${debouncedSearch}"`}
          </p>
          <p className="font-mono text-xs text-text-dim">
            Page {data.page} of {data.total_pages}
          </p>
        </div>
      )}

      {/* ---- Loading ---- */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <div className="h-8 w-8 border-2 border-text-dim border-t-neon-green rounded-full animate-spin mb-4" />
          <p className="font-mono text-sm">Loading catalog…</p>
        </div>
      )}

      {/* ---- Error ---- */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <p className="font-mono text-sm text-blood-red">{error}</p>
        </div>
      )}

      {/* ---- Product Grid ---- */}
      {!loading && !error && data && (
        <>
          {data.products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-dim">
              <MagnifyingGlassIcon className="h-10 w-10 mb-4 opacity-40" />
              <p className="font-mono text-sm">
                No products found{debouncedSearch ? ` for "${debouncedSearch}"` : ''}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          <Pagination
            page={data.page}
            totalPages={data.total_pages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
