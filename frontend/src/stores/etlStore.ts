import { create } from 'zustand'

// ---- Backend response types (exact match to POST /run-etl JSON) ----

export interface PriceDrop {
  id: string
  name: string
  old_price: number
  new_price: number
  delta: number
  delta_pct: number
}

export interface PriceIncrease {
  id: string
  name: string
  old_price: number
  new_price: number
  delta: number
  delta_pct: number
}

export interface NewItem {
  id: string
  name: string
  min_price: number | null
}

export interface RemovedItem {
  id: string
  name: string
  last_min_price: number | null
}

export interface DeltaSummary {
  previous_count: number
  current_count: number
  new_count: number
  removed_count: number
  price_drop_count: number
  price_increase_count: number
  unchanged_count: number
}

export interface Delta {
  new_items: NewItem[]
  removed_items: RemovedItem[]
  price_drops: PriceDrop[]
  price_increases: PriceIncrease[]
  summary: DeltaSummary
}

export interface StageInfo {
  status: string
  duration_s: number
  [key: string]: unknown
}

export interface EtlReport {
  run_id: string
  run_name: string
  started_at: string
  finished_at: string
  duration_s: number
  status: string
  stages: {
    scrape_catalog: StageInfo & {
      total_raw?: number
      total_unique?: number
      duplicates?: number
    }
    category_structuring: StageInfo & {
      total_categories_before?: number
      total_categories_after?: number
      pruned_categories?: number
      survival_ratio?: number
    }
    storage: StageInfo
    [key: string]: StageInfo
  }
  delta: Delta
}

// ---- Store ----

const COOLDOWN_SECONDS = 20
const REQUEST_TIMEOUT_MS = 90_000

interface EtlState {
  report: EtlReport | null
  isLoading: boolean
  error: string | null
  cooldownSeconds: number
  triggerEtl: (demo?: boolean) => Promise<void>
}

let cooldownInterval: ReturnType<typeof setInterval> | null = null

export const useEtlStore = create<EtlState>()((set, get) => ({
  report: null,
  isLoading: false,
  error: null,
  cooldownSeconds: 0,

  triggerEtl: async (demo = true) => {
    const state = get()
    if (state.isLoading || state.cooldownSeconds > 0) return

    set({ isLoading: true, error: null })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(`/api/run-etl?demo=${demo}`, {
        method: 'POST',
        signal: controller.signal,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(body.detail || `HTTP ${res.status}`)
      }

      const report: EtlReport = await res.json()
      set({ report, error: null })

      // Start cooldown
      set({ cooldownSeconds: COOLDOWN_SECONDS })

      if (cooldownInterval) clearInterval(cooldownInterval)
      cooldownInterval = setInterval(() => {
        const current = get().cooldownSeconds
        if (current <= 1) {
          if (cooldownInterval) clearInterval(cooldownInterval)
          cooldownInterval = null
          set({ cooldownSeconds: 0 })
        } else {
          set({ cooldownSeconds: current - 1 })
        }
      }, 1000)
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Pipeline timed out — no response after 90s'
          : err instanceof Error
            ? err.message
            : 'Unknown error'
      set({ error: message })
    } finally {
      clearTimeout(timeout)
      set({ isLoading: false })
    }
  },
}))
