import { useEffect, useRef, useState } from 'react'
import type { OverviewResponse } from '../api/client'
import { fetchOverview } from '../api/client'
import { BranchCard } from '../components/BranchCard'

const POLL_MS = 30_000

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function summaryStats(data: OverviewResponse) {
  let total = 0, presentes = 0
  for (const b of data.branches) {
    for (const w of b.workers) {
      total++
      if (w.today_status === 'presente') presentes++
    }
  }
  return { total, presentes }
}

export function Dashboard() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const mountedRef = useRef(true)

  async function load(manual = false) {
    if (manual) setSpinning(true)
    setLoading(true)
    try {
      const result = await fetchOverview()
      if (mountedRef.current) { setData(result); setError(null) }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      if (mountedRef.current) { setLoading(false); setSpinning(false) }
    }
  }

  useEffect(() => {
    mountedRef.current = true
    load()
    const id = setInterval(() => load(), POLL_MS)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [])

  const stats = data ? summaryStats(data) : null

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3.5 sm:px-8">
          {/* Wordmark */}
          <div className="flex items-center gap-2.5 mr-auto">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect width="20" height="20" rx="5" fill="var(--color-primary)" />
              <path d="M5 10.5 L8.5 14 L15 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-sm font-semibold tracking-tight text-[var(--color-ink)]">Capataz</span>
            {data && (
              <span className="hidden text-xs text-[var(--color-muted)] sm:inline capitalize">
                · {fmtDate(data.date)}
              </span>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-[var(--color-muted)]">
              <span className="tabular-nums font-medium text-[var(--color-ink)]">{stats.presentes}</span>
              <span>de</span>
              <span className="tabular-nums font-medium text-[var(--color-ink)]">{stats.total}</span>
              <span>presentes</span>
            </div>
          )}

          {/* Refresh */}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition-colors duration-100 hover:bg-[var(--color-surface)] disabled:opacity-40"
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              className={spinning ? 'animate-spin' : ''}
              style={{ transition: 'none' }}
              aria-hidden="true"
            >
              <path d="M10.5 6a4.5 4.5 0 1 1-1.32-3.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9.18 1.5 L9.18 3.5 L11.18 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Actualizar
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {/* Mobile date */}
        {data && (
          <p className="mb-4 text-xs text-[var(--color-muted)] capitalize sm:hidden">
            {fmtDate(data.date)}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
            No se pudo cargar: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {!data && !error && (
          <div className="grid gap-4 xl:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
            ))}
          </div>
        )}

        {/* Branches */}
        {data && data.branches.length === 0 && (
          <p className="py-16 text-center text-sm text-[var(--color-muted)]">
            No hay sucursales configuradas.
          </p>
        )}

        {data && data.branches.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
