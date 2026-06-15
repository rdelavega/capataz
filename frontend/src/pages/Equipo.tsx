import { useEffect, useState } from 'react'
import type { WorkerDetail, WorkersResponse } from '../api/client'
import { fetchWorkers } from '../api/client'

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

const EVENT_LABEL: Record<string, string> = {
  checkin: 'Check-in', photo: 'Foto', audio: 'Audio',
  location: 'Ubic.', text: 'Mensaje', unknown: 'Mensaje',
}

function WorkerRow({ worker }: { worker: WorkerDetail }) {
  return (
    <tr className="border-b border-[#E0C0B6] hover:bg-[#FDF2E4] transition-colors">
      <td className="px-5 py-3">
        <span className="hl-sm text-[#2A2622]">{worker.name}</span>
      </td>
      <td className="px-4 py-3">
        <span className="label text-[#58423B]">{worker.branch_name ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="mono text-[#2A2622]">{worker.phone_number}</span>
      </td>
      <td className="px-4 py-3">
        {worker.active
          ? <span className="chip chip-green">Activo</span>
          : <span className="chip chip-gray">Inactivo</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="mono tabular-nums text-[#2A2622]">{worker.events_today}</span>
      </td>
      <td className="px-5 py-3">
        {worker.last_event ? (
          <span className="mono text-[#58423B]">
            {EVENT_LABEL[worker.last_event.type] ?? 'Mensaje'} · {fmtDateTime(worker.last_event.received_at)}
          </span>
        ) : (
          <span className="mono text-[#8C7169]">Sin contacto</span>
        )}
      </td>
    </tr>
  )
}

function BranchGroup({ name, workers }: { name: string; workers: WorkerDetail[] }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
        <h2 className="hl-md text-[#2A2622]">{name}</h2>
        <span className="label text-[#8C7169]">{workers.length} {workers.length === 1 ? 'trabajador' : 'trabajadores'}</span>
      </div>

      <div className="overflow-x-auto border-2 border-[#2A2622] bg-[#FFF8F3]">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
              {['Nombre', 'Sucursal', 'Teléfono', 'Estado', 'Mensajes hoy', 'Último contacto'].map(h => (
                <th key={h} className="label px-4 py-2 text-left text-[#58423B] first:pl-5 last:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map(w => <WorkerRow key={w.id} worker={w} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Equipo() {
  const [data, setData] = useState<WorkersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setData(await fetchWorkers())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = data
    ? data.workers.filter(w => showInactive || w.active)
    : []

  const byBranch = filtered.reduce<Record<string, WorkerDetail[]>>((acc, w) => {
    const key = w.branch_name ?? 'Sin sucursal'
    ;(acc[key] ??= []).push(w)
    return acc
  }, {})

  const totalActive = data ? data.workers.filter(w => w.active).length : 0
  const totalInactive = data ? data.workers.filter(w => !w.active).length : 0

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-8 py-4 shadow-[4px_4px_0_0_#2A2622]">
        <h1 className="hl-md text-[#2A2622]">Equipo</h1>
        {data && (
          <div className="flex items-center gap-4">
            <span className="label text-[#8C7169]">{totalActive} activos</span>
            {totalInactive > 0 && (
              <button
                onClick={() => setShowInactive(p => !p)}
                className="label border-2 border-[#2A2622] px-3 py-1 text-[#58423B] hover:bg-[#ECE1D3] transition-colors"
              >
                {showInactive ? 'Ocultar inactivos' : `Ver ${totalInactive} inactivos`}
              </button>
            )}
          </div>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="label ml-auto border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-hard-sm hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 transition-all"
        >
          {loading ? 'Cargando...' : '↻ Actualizar'}
        </button>
      </header>

      <main className="px-8 py-6 space-y-8">
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">Error — </span>
            <span className="mono text-[#A32D2D]">{error}</span>
          </div>
        )}

        {loading && !data && (
          <div className="h-64 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
        )}

        {data && filtered.length === 0 && (
          <div className="border-2 border-[#E0C0B6] bg-[#FFF8F3] px-6 py-12 text-center">
            <p className="hl-sm text-[#8C7169]">Sin trabajadores</p>
          </div>
        )}

        {Object.entries(byBranch).map(([name, workers]) => (
          <BranchGroup key={name} name={name} workers={workers} />
        ))}
      </main>
    </div>
  )
}
