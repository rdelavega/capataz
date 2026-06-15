import { useEffect, useState } from 'react'
import type { OverviewResponse } from '../api/client'
import { fetchOverview } from '../api/client'
import { BranchCard } from '../components/BranchCard'

const POLL_INTERVAL_MS = 30_000

export function Dashboard() {
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  async function load() {
    try {
      const overview = await fetchOverview()
      setData(overview)
      setLastUpdated(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  const dateLabel = data
    ? new Date(data.date + 'T12:00:00').toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : ''

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Capataz</h1>
          <p className="text-sm text-gray-500 capitalize">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {error && <span className="text-red-500">{error}</span>}
          {lastUpdated && !error && (
            <span>
              Actualizado{' '}
              {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            className="rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>
      </header>

      {!data && !error && (
        <div className="flex justify-center py-20 text-gray-400">Cargando...</div>
      )}

      {data && (
        <div className="space-y-4">
          {data.branches.length === 0 ? (
            <p className="text-center text-gray-500 py-10">No hay sucursales configuradas.</p>
          ) : (
            data.branches.map((branch) => <BranchCard key={branch.id} branch={branch} />)
          )}
        </div>
      )}
    </div>
  )
}
