import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { useEtlStore } from '../stores/etlStore'

export function UpdateButton() {
  const isLoading = useEtlStore((s) => s.isLoading)
  const cooldownSeconds = useEtlStore((s) => s.cooldownSeconds)
  const error = useEtlStore((s) => s.error)
  const triggerEtl = useEtlStore((s) => s.triggerEtl)

  const disabled = isLoading || cooldownSeconds > 0

  const label = isLoading
    ? 'Scraping Costco...'
    : cooldownSeconds > 0
      ? `Wait ${cooldownSeconds}s`
      : 'Update Market Data'

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => triggerEtl(true)}
        disabled={disabled}
        className={`
          relative flex items-center gap-2 px-5 py-2.5
          rounded border font-mono text-sm font-medium tracking-wide uppercase
          transition-all duration-200 cursor-pointer
          disabled:cursor-not-allowed
          ${
            isLoading
              ? 'border-neon-green/50 text-neon-green bg-neon-green/5 shadow-[0_0_20px_rgba(0,255,0,0.15)]'
              : cooldownSeconds > 0
                ? 'border-zinc-700 text-zinc-500 bg-zinc-900'
                : 'border-zinc-600 text-zinc-200 bg-zinc-900 hover:border-neon-green hover:text-neon-green hover:shadow-[0_0_16px_rgba(0,255,0,0.2)]'
          }
        `}
      >
        <ArrowPathIcon
          className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
        />
        {label}
      </button>

      {error && (
        <span className="text-xs text-blood-red font-mono max-w-64 text-right truncate">
          {error}
        </span>
      )}
    </div>
  )
}
