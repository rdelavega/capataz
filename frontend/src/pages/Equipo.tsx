import { ChevronRight, ExternalLink, MapPin, MapPinOff, RefreshCw, Search, Star, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BranchOption, CrewData, WorkerDetail, WorkersResponse } from '../api/client'
import { createBranch, createWorker, fetchBranches, fetchCrews, fetchWorkers, updateBranch } from '../api/client'
import { CrewsBoard } from '../components/Crews'
import { AttendanceStrip, StripLegend } from '../components/Attendance'
import { LocationChip, TodayStatus } from '../components/TodayStatus'
import { useWorkerDrawer } from '../components/WorkerDrawer'
import { EVENT_LABEL, fmtHace, initials } from '../lib/format'
import { usePolling } from '../lib/usePolling'


// ─── Modal: Agregar trabajador ────────────────────────────────────────────────

interface AddWorkerModalProps {
  branches: BranchOption[]
  crews: CrewData[]
  onClose: () => void
  onSaved: () => void
}

function AddWorkerModal({ branches, crews, onClose, onSaved }: AddWorkerModalProps) {
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('+521')
  const [branchId, setBranch] = useState(branches[0]?.id ?? '')
  const [title, setTitle]     = useState('')
  const [crewId, setCrewId]   = useState('')
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
        crew_id: crewId || undefined,
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
          ><X size={14} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label mb-1 block text-[#58423B]">Nombre completo *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="Juan López"
              className="text-sm w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]">Teléfono WhatsApp *</label>
            <input required value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+5215512345001"
              className="mono w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
            <p className="mt-1 text-xs text-[#8C7169]">+521 para móviles México</p>
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
              className="text-sm w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
          </div>

          {crews.length > 0 && (
            <div>
              <label htmlFor="new-worker-crew" className="label mb-1 block text-[#58423B]">Cuadrilla</label>
              <select id="new-worker-crew" value={crewId} onChange={e => setCrewId(e.target.value)}
                className="label w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]">
                <option value="">Sin cuadrilla</option>
                {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-[#A32D2D]">Error — {error}</p>}

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

// ─── Modal: Agregar sucursal ──────────────────────────────────────────────────

const LOCATION_HELP =
  'En Google Maps busca la obra (o deja presionado el punto exacto), toca Compartir y pega aquí el link. ' +
  'También sirven coordenadas: 21.0190, -89.6237.'

function AddBranchModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName]   = useState('')
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createBranch(name.trim(), location.trim())
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
      <div className="w-full max-w-sm mx-4 border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[6px_6px_0_0_#2A2622]">
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-6 py-4">
          <h2 className="hl-sm text-[#2A2622]">Agregar sucursal</h2>
          <button
            onClick={onClose}
            className="label flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] hover:bg-[#2A2622] hover:text-white transition-colors"
          ><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="label mb-1 block text-[#58423B]">Nombre *</label>
            <input required value={name} onChange={e => setName(e.target.value)}
              placeholder="Obra Norte, Sucursal Centro..."
              autoFocus
              className="text-sm w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]" htmlFor="branch-location">Ubicación (para verificar llegadas)</label>
            <input id="branch-location" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              className="text-sm w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
            <p className="mt-1 text-xs text-[#8C7169]">{LOCATION_HELP} Puedes dejarlo para después.</p>
          </div>
          {error && <p className="text-sm text-[#A32D2D]">Error — {error}</p>}
          <div className="flex justify-end gap-3 border-t-2 border-[#E0C0B6] pt-4">
            <button type="button" onClick={onClose}
              className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="label border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-[3px_3px_0_0_#2A2622] hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 transition-all">
              {saving ? 'Guardando...' : '+ Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Ubicación de la obra ──────────────────────────────────────────────

function BranchLocationModal({ branch, onClose, onSaved }: { branch: BranchOption; onClose: () => void; onSaved: () => void }) {
  const [location, setLocation] = useState('')
  const [radius, setRadius]     = useState(String(branch.geofence_m))
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function save(data: Parameters<typeof updateBranch>[1]) {
    setSaving(true)
    setError(null)
    try {
      await updateBranch(branch.id, data)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const geofence_m = Number(radius) || null
    save(location.trim() ? { location: location.trim(), geofence_m } : { geofence_m })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A2622]/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md mx-4 border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[6px_6px_0_0_#2A2622]">
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-6 py-4">
          <h2 className="hl-sm text-[#2A2622]">Ubicación de {branch.name}</h2>
          <button
            onClick={onClose}
            className="label flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] hover:bg-[#2A2622] hover:text-white transition-colors"
            aria-label="Cerrar"
          ><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-xs text-[#58423B]">
            Cuando alguien manda "presente", el bot le pide su ubicación y la compara con esta.
            Si checa a más de {radius || branch.geofence_m} m, te sale aviso. Solo se guarda la distancia, nunca dónde estaba.
          </p>
          {branch.has_location && branch.maps_url && (
            <p className="text-xs">
              Ubicación actual:{' '}
              <a href={branch.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#D85A30] underline underline-offset-2">ver en el mapa <ExternalLink size={12} aria-hidden="true" /></a>
            </p>
          )}
          <div>
            <label className="label mb-1 block text-[#58423B]" htmlFor="loc-link">
              {branch.has_location ? 'Cambiar por' : 'Link de Google Maps o coordenadas'}
            </label>
            <input id="loc-link" value={location} onChange={e => setLocation(e.target.value)} autoFocus
              required={!branch.has_location}
              placeholder="https://maps.app.goo.gl/…"
              className="text-sm w-full border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
            <p className="mt-1 text-xs text-[#8C7169]">{LOCATION_HELP}</p>
          </div>
          <div>
            <label className="label mb-1 block text-[#58423B]" htmlFor="loc-radius">Radio (metros)</label>
            <input id="loc-radius" type="number" min={50} max={5000} step={50} value={radius} onChange={e => setRadius(e.target.value)}
              className="mono w-32 border-2 border-[#2A2622] bg-white px-3 py-2 text-[#2A2622] outline-none focus:border-[#D85A30]" />
            <p className="mt-1 text-xs text-[#8C7169]">Súbelo si la obra es grande o el GPS falla seguido ahí.</p>
          </div>
          {error && <p className="text-sm text-[#A32D2D]">Error — {error}</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t-2 border-[#E0C0B6] pt-4">
            {branch.has_location && (
              <button type="button" disabled={saving} onClick={() => save({ location: null })}
                className="label mr-auto border-2 border-[#A32D2D] px-4 py-2 text-[#A32D2D] hover:bg-[#A32D2D] hover:text-white disabled:opacity-40 transition-colors">
                Quitar ubicación
              </button>
            )}
            <button type="button" onClick={onClose}
              className="label border-2 border-[#2A2622] px-4 py-2 text-[#58423B] hover:bg-[#ECE1D3] transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="label border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2 text-white shadow-[3px_3px_0_0_#2A2622] hover:bg-[#A5360D] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 transition-all">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Lista ────────────────────────────────────────────────────────────────────

type Filter = 'todos' | 'faltan' | 'tarde' | 'atrasos' | 'bajas'

const FILTERS: { key: Filter; label: string; test: (w: WorkerDetail) => boolean; alert?: boolean }[] = [
  { key: 'todos',   label: 'Todos',       test: w => w.active },
  { key: 'faltan',  label: 'Faltan hoy',  test: w => w.active && (w.today_status === null || w.today_status === 'ausente'), alert: true },
  { key: 'tarde',   label: 'Tarde hoy',   test: w => w.active && w.today_status === 'tarde', alert: true },
  { key: 'atrasos', label: 'Con atrasos', test: w => w.active && w.overdue_jobs > 0, alert: true },
  { key: 'bajas',   label: 'Dados de baja', test: w => !w.active },
]

const STRIPE: Record<string, string> = {
  presente: 'bg-[#639922]', tarde: 'bg-[#BA7517]', ausente: 'bg-[#A32D2D]', none: 'bg-[#E0C0B6]',
}

function WorkerRow({ w, onOpen }: { w: WorkerDetail; onOpen: () => void }) {
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="cursor-pointer border-b border-[#E0C0B6] transition-colors hover:bg-[#FBEBDD] focus-visible:bg-[#FBEBDD]"
    >
      <td className={`w-1.5 p-0 ${STRIPE[w.today_status ?? 'none']}`} aria-hidden="true" />
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-[#2A2622] bg-[#ECE1D3] font-headline text-xs font-semibold">
            {initials(w.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{w.name}</p>
            <p className="truncate text-xs text-[#8C7169]">{w.title ?? 'Sin puesto'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        {w.active ? (
          <div className="flex flex-wrap gap-1">
            <TodayStatus status={w.today_status} checkinAt={w.checkin_at} />
            <LocationChip location={w.location} ownBranch={w.branch_name} />
          </div>
        ) : <span className="chip chip-gray">Baja</span>}
      </td>
      <td className="hidden px-3 py-2 text-sm xl:table-cell">
        {w.crew_name ?? <span className="text-[#8C7169]">—</span>}
        {w.is_lead && (
          <span className="flex items-center gap-1 text-xs font-semibold text-[#A5360D]">
            <Star size={11} className="fill-current" aria-hidden="true" /> Encargado
          </span>
        )}
      </td>
      <td className="hidden px-3 py-2 text-xs text-[#58423B] md:table-cell">
        {w.last_event ? `${fmtHace(w.last_event.received_at)} · ${(EVENT_LABEL[w.last_event.type] ?? 'mensaje').toLowerCase()}` : 'nunca ha escrito'}
      </td>
      <td className="hidden px-3 py-2 text-xs tabular-nums sm:table-cell">
        {w.active_jobs}
        {w.overdue_jobs > 0 && <span className="font-bold text-[#A32D2D]"> · {w.overdue_jobs} atrasada{w.overdue_jobs > 1 ? 's' : ''}</span>}
      </td>
      <td className="hidden px-3 py-2 lg:table-cell"
        title={w.attendance_pct !== null ? `Vino ${w.attendance_pct}% de los días que le tocaba trabajar` : undefined}>
        <div className="flex items-center gap-2.5">
          <AttendanceStrip codes={w.attendance_30d} />
          <span className={`mono text-xs tabular-nums ${w.attendance_pct !== null && w.attendance_pct < 90 ? 'font-bold text-[#BA7517]' : ''}`}>
            {w.attendance_pct !== null ? `${w.attendance_pct}%` : '—'}
          </span>
        </div>
      </td>
      <td className="px-2 text-[#8C7169]"><ChevronRight size={16} aria-hidden="true" /></td>
    </tr>
  )
}

function BranchLocationButton({ branch, onClick }: { branch?: BranchOption; onClick: (b: BranchOption) => void }) {
  if (!branch) return null
  return branch.has_location ? (
    <button onClick={() => onClick(branch)} className="ml-auto inline-flex items-center gap-1 text-xs text-[#58423B] hover:text-[#D85A30]"
      title="Los check-ins se comparan con esta ubicación">
      <MapPin size={12} aria-hidden="true" /> Ubicación fijada · cambiar
    </button>
  ) : (
    <button onClick={() => onClick(branch)} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#A5360D] underline underline-offset-2 hover:text-[#D85A30]"
      title="Sin ubicación no se puede verificar que lleguen a la obra">
      <MapPinOff size={12} aria-hidden="true" /> Fijar ubicación de la obra
    </button>
  )
}

function groupSummary(ws: WorkerDetail[]): string {
  const active = ws.filter(w => w.active)
  const here = active.filter(w => w.today_status === 'presente' || w.today_status === 'tarde').length
  const overdue = active.reduce((n, w) => n + w.overdue_jobs, 0)
  const parts = [`${active.length} ${active.length === 1 ? 'persona' : 'personas'}`, `${here} llegaron`]
  if (overdue) parts.push(`${overdue} tarea${overdue > 1 ? 's' : ''} atrasada${overdue > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function Equipo() {
  const [data, setData]       = useState<WorkersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [query, setQuery]     = useState('')
  const [filter, setFilter]   = useState<Filter>('todos')
  const [showModal, setShowModal]             = useState(false)
  const [showBranchModal, setShowBranchModal] = useState(false)
  const [branches, setBranches]               = useState<BranchOption[]>([])
  const [crews, setCrews]                     = useState<CrewData[]>([])
  const [tab, setTab]                         = useState<'personas' | 'cuadrillas'>('personas')
  const [locating, setLocating]               = useState<BranchOption | null>(null)
  const { openWorker, version, bump } = useWorkerDrawer()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [w, c, b] = await Promise.all([fetchWorkers(), fetchCrews(), fetchBranches()])
      setData(w)
      setCrews(c.crews)
      setBranches(b.branches)
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, version])
  usePolling(useCallback(() => { load(true) }, [load]))

  function openModal() {
    if (branches.length === 0) {
      setError('Primero crea una obra o sucursal con "+ Sucursal".')
      return
    }
    setShowModal(true)
  }

  const workers = useMemo(() => data?.workers ?? [], [data])
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(f => [f.key, workers.filter(f.test).length])) as Record<Filter, number>,
    [workers],
  )

  const visible = useMemo(() => {
    const test = FILTERS.find(f => f.key === filter)!.test
    const q = query.trim().toLowerCase()
    const digits = q.replace(/\D/g, '')
    return workers.filter(w =>
      test(w) && (!q || w.name.toLowerCase().includes(q) || (digits.length >= 3 && w.phone_number.includes(digits)))
    )
  }, [workers, filter, query])

  const groups = useMemo(() => {
    const map = new Map<string, WorkerDetail[]>()
    for (const w of visible) {
      const key = w.branch_name ?? 'Sin sucursal'
      map.set(key, [...(map.get(key) ?? []), w])
    }
    return [...map.entries()]
  }, [visible])

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3 shadow-[4px_4px_0_0_#2A2622] md:gap-4 md:px-8 md:py-4">
        <div>
          <h1 className="hl-md text-[#2A2622]">Equipo</h1>
          {data && <p className="label text-[#8C7169]">{counts.todos} activos</p>}
        </div>
        <div className="ml-auto flex gap-2 md:gap-3">
          <button onClick={() => setShowBranchModal(true)} className="btn">+ Sucursal</button>
          <button onClick={openModal} className="btn btn-primary">+ Trabajador</button>
          <button onClick={() => load()} disabled={loading} className="btn" aria-label="Actualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="space-y-4 px-4 py-5 md:px-8 md:py-6">
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">Error — </span>
            <span className="text-sm text-[#A32D2D]">{error}</span>
          </div>
        )}

        <div className="flex gap-0 border-b-2 border-[#2A2622]" role="tablist" aria-label="Vista del equipo">
          {(['personas', 'cuadrillas'] as const).map(t => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`hl-sm -mb-0.5 border-2 border-b-0 px-4 py-2 text-[15px] ${tab === t ? 'border-[#2A2622] bg-[#FFF8F3]' : 'border-transparent text-[#8C7169] hover:text-[#2A2622]'}`}
            >
              {t === 'personas' ? `Personas · ${counts.todos}` : `Cuadrillas · ${crews.length}`}
            </button>
          ))}
        </div>

        {tab === 'cuadrillas' && data && (
          <CrewsBoard crews={crews} branches={branches} workers={data.workers} onChanged={() => { load(); bump() }} />
        )}

        {tab === 'personas' && (<>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-[220px] flex-1 items-center gap-2 border-2 border-[#2A2622] bg-[#FFF8F3] px-3 py-2 focus-within:border-[#D85A30]">
            <Search size={14} className="text-[#8C7169]" aria-hidden="true" />
            <span className="sr-only">Buscar trabajador</span>
            <input
              id="team-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#8C7169]"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar equipo">
            {FILTERS.filter(f => f.key !== 'bajas' || counts.bajas > 0).map(f => {
              const on = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={on}
                  className={`label border-2 border-[#2A2622] px-2.5 py-1.5 transition-colors ${on ? 'bg-[#2A2622] text-white' : 'bg-[#FFF8F3] text-[#2A2622] hover:bg-[#ECE1D3]'}`}
                >
                  {f.label}{' '}
                  <span className={f.alert && counts[f.key] > 0 ? (on ? 'text-[#FFB59E]' : 'text-[#A32D2D]') : ''}>{counts[f.key]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {loading && !data && <div className="h-64 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />}

        {data && visible.length === 0 && (
          <div className="border-2 border-[#E0C0B6] bg-[#FFF8F3] px-6 py-12 text-center">
            <p className="hl-sm text-[#8C7169]">
              {workers.length === 0 ? 'Todavía no hay trabajadores' : filter === 'faltan' ? 'Hoy no falta nadie' : 'Nadie coincide'}
            </p>
            {workers.length === 0 && <p className="mt-1 text-xs text-[#8C7169]">Agrega al primero con el botón de arriba.</p>}
          </div>
        )}

        {groups.length > 0 && <StripLegend className="hidden lg:flex" />}
        {groups.length > 0 && (
          <div className="overflow-x-auto border-2 border-[#2A2622] bg-[#FFF8F3]">
            <table className="w-full min-w-[340px] border-collapse">
              <thead>
                <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
                  <th className="w-1.5 p-0"><span className="sr-only">Estado</span></th>
                  <th className="label px-3 py-2 text-left text-[#58423B]">Trabajador</th>
                  <th className="label px-3 py-2 text-left text-[#58423B]">Hoy</th>
                  <th className="label hidden px-3 py-2 text-left text-[#58423B] xl:table-cell">Cuadrilla</th>
                  <th className="label hidden px-3 py-2 text-left text-[#58423B] md:table-cell">Último reporte</th>
                  <th className="label hidden px-3 py-2 text-left text-[#58423B] sm:table-cell">Tareas</th>
                  <th className="label hidden px-3 py-2 text-left text-[#58423B] lg:table-cell">Asistencia (30 días)</th>
                  <th className="w-6"><span className="sr-only">Abrir</span></th>
                </tr>
              </thead>
              {groups.map(([name, ws]) => (
                <tbody key={name}>
                  <tr className="border-y-2 border-[#2A2622] bg-[#E5DFD3]">
                    <td colSpan={8} className="px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-headline text-sm font-semibold uppercase tracking-wide">{name}</span>
                        <span className="text-xs text-[#58423B]">{groupSummary(ws)}</span>
                        <BranchLocationButton branch={branches.find(b => b.name === name)} onClick={setLocating} />
                      </div>
                    </td>
                  </tr>
                  {ws.map(w => <WorkerRow key={w.id} w={w} onOpen={() => openWorker(w.id)} />)}
                </tbody>
              ))}
            </table>
          </div>
        )}
        </>)}
      </main>

      {showModal && branches.length > 0 && (
        <AddWorkerModal branches={branches} crews={crews} onClose={() => setShowModal(false)} onSaved={load} />
      )}
      {locating && (
        <BranchLocationModal branch={locating} onClose={() => setLocating(null)} onSaved={load} />
      )}
      {showBranchModal && (
        <AddBranchModal onClose={() => setShowBranchModal(false)} onSaved={() => { setBranches([]); load() }} />
      )}
    </div>
  )
}
