import { useEffect, useState } from 'react'
import type { BranchOption, WorkerDetail, WorkersResponse } from '../api/client'
import { createWorker, deactivateWorker, fetchBranches, fetchWorkers } from '../api/client'

const EVENT_LABEL: Record<string, string> = {
  checkin: 'Check-in', photo: 'Foto', audio: 'Audio',
  location: 'Ubic.', text: 'Mensaje', unknown: 'Mensaje',
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// ─── Modal: Agregar trabajador ────────────────────────────────────────────────

interface AddWorkerModalProps {
  branches: BranchOption[]
  onClose: () => void
  onSaved: () => void
}

function AddWorkerModal({ branches, onClose, onSaved }: AddWorkerModalProps) {
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('+521')
  const [branchId, setBranch] = useState(branches[0]?.id ?? '')
  const [title, setTitle]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createWorker({
        name,
        phone_number: phone,
        branch_id: branchId,
        title: title.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A2622]/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md mx-4 border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[6px_6px_0_0_#2A2622]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-6 py-4">
          <h2 className="hl-sm text-[#2A2622]">Agregar trabajador</h2>
          <button
            onClick={onClose}
            className="label flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] hover:bg-[#2A2622] hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label mb-1 block text-[#58423B]">Nombre completo *</label>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Juan López"
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]"
            />
          </div>

          <div>
            <label className="label mb-1 block text-[#58423B]">Teléfono WhatsApp *</label>
            <input
              required
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+5215512345001"
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]"
            />
            <p className="mono mt-1 text-xs text-[#8C7169]">
              Formato E.164 — +521 para móviles México
            </p>
          </div>

          <div>
            <label className="label mb-1 block text-[#58423B]">Sucursal *</label>
            <select
              required
              value={branchId}
              onChange={e => setBranch(e.target.value)}
              className="label w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label mb-1 block text-[#58423B]">Puesto / Título</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Albañil, Electricista, Supervisora..."
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]"
            />
          </div>

          {error && (
            <p className="mono text-sm text-[#A32D2D]">Error — {error}</p>
          )}

          <div className="flex justify-end gap-3 border-t-2 border-[#E0C0B6] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="label border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-[3px_3px_0_0_#2A2622] hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 transition-all"
            >
              {saving ? 'Guardando...' : '+ Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tabla de trabajadores por sucursal ───────────────────────────────────────

function WorkerRow({
  worker,
  onDeactivate,
}: {
  worker: WorkerDetail
  onDeactivate: (id: string) => void
}) {
  return (
    <tr className="border-b border-[#E0C0B6] hover:bg-[#FDF2E4] transition-colors">
      <td className="px-5 py-3">
        <span className="hl-sm text-[#2A2622]">{worker.name}</span>
        {worker.title && (
          <p className="label mt-0.5 text-[#58423B]">{worker.title}</p>
        )}
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
      <td className="px-4 py-3">
        {worker.last_event ? (
          <span className="mono text-[#58423B]">
            {EVENT_LABEL[worker.last_event.type] ?? 'Mensaje'} · {fmtDateTime(worker.last_event.received_at)}
          </span>
        ) : (
          <span className="mono text-[#8C7169]">Sin contacto</span>
        )}
      </td>
      <td className="px-4 py-3">
        {worker.active && (
          <button
            onClick={() => {
              if (confirm(`¿Dar de baja a ${worker.name}? Podrás ver el historial pero ya no aparecerá en el panel.`)) {
                onDeactivate(worker.id)
              }
            }}
            className="label border border-[#A32D2D] px-2 py-1 text-xs text-[#A32D2D] hover:bg-[#A32D2D] hover:text-white transition-colors"
          >
            Dar de baja
          </button>
        )}
      </td>
    </tr>
  )
}

function BranchGroup({
  name,
  workers,
  onDeactivate,
}: {
  name: string
  workers: WorkerDetail[]
  onDeactivate: (id: string) => void
}) {
  const active = workers.filter(w => w.active).length
  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
        <h2 className="hl-md text-[#2A2622]">{name}</h2>
        <span className="label text-[#8C7169]">
          {active} {active === 1 ? 'trabajador activo' : 'trabajadores activos'}
        </span>
      </div>

      <div className="overflow-x-auto border-2 border-[#2A2622] bg-[#FFF8F3]">
        <table className="w-full min-w-[780px]">
          <thead>
            <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
              {['Nombre', 'Sucursal', 'Teléfono', 'Estado', 'Mensajes hoy', 'Último contacto', ''].map((h, i) => (
                <th
                  key={i}
                  className="label px-4 py-2 text-left text-[#58423B] first:pl-5"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <WorkerRow key={w.id} worker={w} onDeactivate={onDeactivate} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function Equipo() {
  const [data, setData]               = useState<WorkersResponse | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal]     = useState(false)
  const [branches, setBranches]       = useState<BranchOption[]>([])

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

  async function openModal() {
    if (branches.length === 0) {
      try {
        const res = await fetchBranches()
        setBranches(res.branches)
      } catch {
        setError('No se pudieron cargar las sucursales')
        return
      }
    }
    setShowModal(true)
  }

  async function handleDeactivate(id: string) {
    try {
      await deactivateWorker(id)
      await load()
    } catch {
      setError('No se pudo dar de baja al trabajador')
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

  const totalActive   = data ? data.workers.filter(w => w.active).length : 0
  const totalInactive = data ? data.workers.filter(w => !w.active).length : 0

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-8 py-4 shadow-[4px_4px_0_0_#2A2622]">
        <h1 className="hl-md text-[#2A2622]">Equipo</h1>

        {data && (
          <>
            <span className="label text-[#8C7169]">{totalActive} activos</span>
            {totalInactive > 0 && (
              <button
                onClick={() => setShowInactive(p => !p)}
                className="label border-2 border-[#2A2622] px-3 py-1 text-[#58423B] hover:bg-[#ECE1D3] transition-colors"
              >
                {showInactive ? 'Ocultar inactivos' : `Ver ${totalInactive} inactivos`}
              </button>
            )}
          </>
        )}

        <div className="ml-auto flex gap-3">
          <button
            onClick={openModal}
            className="label border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-[3px_3px_0_0_#2A2622] hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
          >
            + Agregar trabajador
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 transition-all"
          >
            {loading ? 'Cargando...' : '↻'}
          </button>
        </div>
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
          <BranchGroup
            key={name}
            name={name}
            workers={workers}
            onDeactivate={handleDeactivate}
          />
        ))}
      </main>

      {showModal && branches.length > 0 && (
        <AddWorkerModal
          branches={branches}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
