import { useEffect, useState } from 'react'
import type { BranchOption, JobData, WorkerDetail } from '../api/client'
import {
  createJob, deleteJob, fetchBranches,
  fetchJobs, fetchWorkers, updateJob,
} from '../api/client'

const STATUS_CFG: Record<string, { chip: string; label: string }> = {
  pendiente:   { chip: 'chip chip-gray',  label: 'Pendiente'   },
  en_progreso: { chip: 'chip chip-amber', label: 'En progreso' },
  completado:  { chip: 'chip chip-green', label: 'Completado'  },
  atrasado:    { chip: 'chip chip-red',   label: 'Atrasado'    },
}

const FILTER_OPTIONS = [
  { value: '',           label: 'Todas'       },
  { value: 'pendiente',  label: 'Pendientes'  },
  { value: 'en_progreso',label: 'En progreso' },
  { value: 'atrasado',   label: 'Atrasadas'   },
  { value: 'completado', label: 'Completadas' },
]

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// ─── Select de status inline ──────────────────────────────────────────────────

function StatusSelect({ jobId, current, onChanged }: {
  jobId: string
  current: string
  onChanged: (status: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const cfg = STATUS_CFG[current] ?? STATUS_CFG.pendiente

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setSaving(true)
    try {
      await updateJob(jobId, { status: next })
      onChanged(next)
    } catch (err) {
      console.error('PATCH /jobs error:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <span className={cfg.chip}>{cfg.label}</span>
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        title="Cambiar estado"
      >
        {Object.entries(STATUS_CFG).map(([val, { label }]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Modal nueva tarea ────────────────────────────────────────────────────────

function NewJobModal({ workers, onClose, onCreated }: {
  workers: WorkerDetail[]
  onClose: () => void
  onCreated: (job: JobData) => void
}) {
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [workerId, setWorkerId] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setErr(null)
    try {
      const res = await createJob({
        title: title.trim(),
        description: desc.trim() || undefined,
        worker_id: workerId || undefined,
        due_date: dueDate || undefined,
      })
      const jobs = await fetchJobs()
      const created = jobs.jobs.find(j => j.id === res.id)
      if (created) onCreated(created)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A2622]/60">
      <div className="w-full max-w-md border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">
        <div className="border-b-2 border-[#2A2622] bg-[#D85A30] px-5 py-3 flex items-center justify-between">
          <h2 className="hl-sm text-white">Nueva tarea</h2>
          <button onClick={onClose} className="label text-white hover:opacity-70">✕</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="label text-[#58423B]">Título *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ej. Instalar tuberías sección B"
              className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 label focus:outline-none focus:border-[#D85A30]"
              required
            />
          </div>

          <div>
            <label className="label text-[#58423B]">Descripción</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={2}
              className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 label focus:outline-none focus:border-[#D85A30] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-[#58423B]">Asignar a</label>
              <select
                value={workerId}
                onChange={e => setWorkerId(e.target.value)}
                className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 label focus:outline-none focus:border-[#D85A30]"
              >
                <option value="">Sin asignar</option>
                {workers.filter(w => w.active).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-[#58423B]">Fecha límite</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 label focus:outline-none focus:border-[#D85A30]"
              />
            </div>
          </div>

          {err && <p className="label text-[#A32D2D]">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 border-2 border-[#2A2622] bg-[#D85A30] py-2 label text-white shadow-hard-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:bg-[#A5360D] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : 'Crear tarea'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="border-2 border-[#2A2622] px-4 py-2 label text-[#2A2622] hover:bg-[#ECE1D3]"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function Tareas() {
  const [jobs, setJobs]         = useState<JobData[]>([])
  const [workers, setWorkers]   = useState<WorkerDetail[]>([])
  const [filter, setFilter]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function load(status = filter) {
    setLoading(true)
    setErr(null)
    try {
      const [jobsRes, workersRes] = await Promise.all([
        fetchJobs(status || undefined),
        fetchWorkers(),
      ])
      setJobs(jobsRes.jobs)
      setWorkers(workersRes.workers)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleFilter(val: string) {
    setFilter(val)
    load(val)
  }

  function handleStatusChange(jobId: string, status: string) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: status as JobData['status'] } : j))
  }

  async function handleDelete(jobId: string) {
    if (!confirm('¿Eliminar esta tarea?')) return
    try {
      await deleteJob(jobId)
      setJobs(prev => prev.filter(j => j.id !== jobId))
    } catch (e) {
      console.error('DELETE /jobs error:', e)
    }
  }

  const counts = {
    pendiente:   jobs.filter(j => j.status === 'pendiente').length,
    en_progreso: jobs.filter(j => j.status === 'en_progreso').length,
    atrasado:    jobs.filter(j => j.status === 'atrasado').length,
    completado:  jobs.filter(j => j.status === 'completado').length,
  }

  return (
    <div className="min-h-screen bg-[#F2EDE4] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="hl-lg text-[#2A2622]">Tareas</h1>
          <p className="label text-[#8C7169] mt-0.5">
            {jobs.length} tarea{jobs.length !== 1 ? 's' : ''}
            {filter ? ` · ${FILTER_OPTIONS.find(f => f.value === filter)?.label}` : ' en total'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="border-2 border-[#2A2622] bg-[#D85A30] px-4 py-2.5 label text-white shadow-hard-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:bg-[#A5360D]"
        >
          + Nueva tarea
        </button>
      </div>

      {/* Resumen rápido */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        {[
          { key: 'pendiente',   label: 'Pendientes',   color: '#8C7169' },
          { key: 'en_progreso', label: 'En progreso',  color: '#BA7517' },
          { key: 'atrasado',    label: 'Atrasadas',    color: '#A32D2D' },
          { key: 'completado',  label: 'Completadas',  color: '#639922' },
        ].map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => handleFilter(filter === key ? '' : key)}
            className={[
              'border-2 border-[#2A2622] bg-[#FFF8F3] p-3 text-left transition-colors',
              filter === key ? 'bg-[#ECE1D3] shadow-hard-sm' : 'hover:bg-[#ECE1D3]',
            ].join(' ')}
          >
            <p className="mono text-2xl font-bold" style={{ color }}>
              {counts[key as keyof typeof counts]}
            </p>
            <p className="label text-[#58423B]">{label}</p>
          </button>
        ))}
      </div>

      {/* Filtro */}
      <div className="mb-4 flex gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleFilter(opt.value)}
            className={[
              'border-2 px-3 py-1 label transition-colors',
              filter === opt.value
                ? 'border-[#2A2622] bg-[#2A2622] text-white'
                : 'border-[#2A2622] text-[#2A2622] hover:bg-[#ECE1D3]',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="label text-[#8C7169] py-12 text-center">Cargando…</p>
      ) : err ? (
        <p className="label text-[#A32D2D] py-12 text-center">{err}</p>
      ) : jobs.length === 0 ? (
        <div className="border-2 border-dashed border-[#D0C5BB] py-16 text-center">
          <p className="hl-sm text-[#8C7169]">Sin tareas</p>
          <p className="label text-[#8C7169] mt-1">
            {filter ? 'No hay tareas con ese estado.' : 'Crea la primera tarea con el botón de arriba.'}
          </p>
        </div>
      ) : (
        <div className="border-2 border-[#2A2622] bg-[#FFF8F3] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
                <th className="label text-left px-4 py-2.5 text-[#2A2622]">Tarea</th>
                <th className="label text-left px-4 py-2.5 text-[#2A2622]">Estado</th>
                <th className="label text-left px-4 py-2.5 text-[#2A2622]">Asignado</th>
                <th className="label text-left px-4 py-2.5 text-[#2A2622]">Sucursal</th>
                <th className="label text-left px-4 py-2.5 text-[#2A2622]">Vence</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job, i) => (
                <tr
                  key={job.id}
                  className={[
                    'border-b border-[#E0C0B6] last:border-0',
                    i % 2 === 1 ? 'bg-[#F9F4EE]' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 max-w-[240px]">
                    <p className="label text-[#2A2622] leading-tight">{job.title}</p>
                    {job.description && (
                      <p className="mono text-xs text-[#8C7169] mt-0.5 truncate">{job.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusSelect
                      jobId={job.id}
                      current={job.status}
                      onChanged={status => handleStatusChange(job.id, status)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="label text-[#2A2622]">{job.worker_name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="label text-[#58423B]">{job.branch_name ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`mono text-sm ${job.status === 'atrasado' ? 'text-[#A32D2D] font-bold' : 'text-[#58423B]'}`}>
                      {fmtDate(job.due_date)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="label text-[#8C7169] hover:text-[#A32D2D] transition-colors"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewJobModal
          workers={workers}
          onClose={() => setShowModal(false)}
          onCreated={job => setJobs(prev => [job, ...prev])}
        />
      )}
    </div>
  )
}
