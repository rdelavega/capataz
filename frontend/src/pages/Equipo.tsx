import { useEffect, useRef, useState } from 'react'
import type { BranchOption, WorkerDetail, WorkersResponse } from '../api/client'
import {
  createWorker, deactivateWorker, fetchBranches,
  fetchWorkers, updateWorkerTitle,
} from '../api/client'

const EVENT_LABEL: Record<string, string> = {
  checkin: 'Check-in', photo: 'Foto', audio: 'Audio',
  location: 'Ubic.', text: 'Mensaje', unknown: 'Mensaje',
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// ─── Celda de puesto con edición inline ──────────────────────────────────────

function TitleCell({
  workerId,
  initialTitle,
  onSaved,
}: {
  workerId: string
  initialTitle: string | null
  onSaved: (title: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(initialTitle ?? '')
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const inputRef              = useRef<HTMLInputElement>(null)

  function startEdit() {
    setValue(initialTitle ?? '')
    setErr(null)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setErr(null)
    const newTitle = value.trim() || null
    try {
      await updateWorkerTitle(workerId, newTitle)
      onSaved(newTitle)
      setEditing(false)
    } catch (e) {
      console.error('PATCH /workers error:', e)
      setErr(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); save() }
    if (e.key === 'Escape') { setValue(initialTitle ?? ''); setEditing(false); setErr(null) }
  }

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={onKeyDown}
          disabled={saving}
          placeholder="Sin puesto"
          className="mono w-full border-2 border-[#D85A30] bg-white px-2 py-0.5 text-[#2A2622] outline-none disabled:opacity-50"
        />
        {err && <p className="mono mt-0.5 text-xs text-[#A32D2D]">{err}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={startEdit}
      title="Clic para editar"
      className="group flex w-full items-center gap-1.5 text-left"
    >
      <span className="label text-[#2A2622] group-hover:text-[#D85A30] transition-colors">
        {initialTitle ?? <span className="text-[#8C7169]">Sin puesto</span>}
      </span>
      <span className="opacity-0 group-hover:opacity-100 text-[#8C7169] transition-opacity text-xs" aria-hidden>
        ✎
      </span>
    </button>
  )
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
        name, phone_number: phone, branch_id: branchId,
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
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-6 py-4">
          <h2 className="hl-sm text-[#2A2622]">Agregar trabajador</h2>
          <button
            onClick={onClose}
            className="label flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] hover:bg-[#2A2622] hover:text-white transition-colors"
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label mb-1 block text-[#58423B]">Nombre completo *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="Juan López"
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]">Teléfono WhatsApp *</label>
            <input required value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+5215512345001"
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
            <p className="mono mt-1 text-xs text-[#8C7169]">+521 para móviles México</p>
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]">Sucursal *</label>
            <select required value={branchId} onChange={e => setBranch(e.target.value)}
              className="label w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]">Puesto / Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Albañil, Electricista, Supervisora..."
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
          </div>

          {error && <p className="mono text-sm text-[#A32D2D]">Error — {error}</p>}

          <div className="flex justify-end gap-3 border-t-2 border-[#E0C0B6] pt-4">
            <button type="button" onClick={onClose}
              className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="label border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-[3px_3px_0_0_#2A2622] hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 transition-all">
              {saving ? 'Guardando...' : '+ Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Fila de trabajador ───────────────────────────────────────────────────────

function WorkerRow({
  worker,
  onTitleSaved,
  onDeactivate,
}: {
  worker: WorkerDetail
  onTitleSaved: (id: string, title: string | null) => void
  onDeactivate: (id: string) => void
}) {
  return (
    <tr className="border-b border-[#E0C0B6] hover:bg-[#FDF2E4] transition-colors">
      <td className="px-5 py-3">
        <span className="hl-sm text-[#2A2622]">{worker.name}</span>
      </td>
      <td className="px-4 py-2.5 min-w-[140px]">
        <TitleCell
          workerId={worker.id}
          initialTitle={worker.title}
          onSaved={title => onTitleSaved(worker.id, title)}
        />
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
              if (confirm(`¿Dar de baja a ${worker.name}?`)) onDeactivate(worker.id)
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
  name, workers, onTitleSaved, onDeactivate,
}: {
  name: string
  workers: WorkerDetail[]
  onTitleSaved: (id: string, title: string | null) => void
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
              {['Nombre', 'Puesto', 'Teléfono', 'Estado', 'Mensajes hoy', 'Último contacto', ''].map((h, i) => (
                <th key={i} className="label px-4 py-2 text-left text-[#58423B] first:pl-5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map(w => (
              <WorkerRow
                key={w.id}
                worker={w}
                onTitleSaved={onTitleSaved}
                onDeactivate={onDeactivate}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function Equipo() {
  const [data, setData]                 = useState<WorkersResponse | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal]       = useState(false)
  const [branches, setBranches]         = useState<BranchOption[]>([])

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

  function handleTitleSaved(id: string, title: string | null) {
    setData(prev => {
      if (!prev) return prev
      return { workers: prev.workers.map(w => w.id === id ? { ...w, title } : w) }
    })
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

  const filtered = data ? data.workers.filter(w => showInactive || w.active) : []

  const byBranch = filtered.reduce<Record<string, WorkerDetail[]>>((acc, w) => {
    const key = w.branch_name ?? 'Sin sucursal'
    ;(acc[key] ??= []).push(w)
    return acc
  }, {})

  const totalActive   = data ? data.workers.filter(w => w.active).length : 0
  const totalInactive = data ? data.workers.filter(w => !w.active).length : 0

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
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
            className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] disabled:opacity-40 transition-colors"
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
            onTitleSaved={handleTitleSaved}
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
