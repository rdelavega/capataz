import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WorkerDetail } from '../api/client'
import { createJob, fetchWorkers } from '../api/client'

export function NewJobModal({ workers: given, defaultWorkerId, onClose, onCreated }: {
  workers?: WorkerDetail[]
  defaultWorkerId?: string
  onClose: () => void
  onCreated: () => void
}) {
  const [workers, setWorkers]   = useState<WorkerDetail[]>(given ?? [])
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [workerId, setWorkerId] = useState(defaultWorkerId ?? '')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  useEffect(() => {
    if (!given) fetchWorkers().then(r => setWorkers(r.workers)).catch(() => setErr('No se pudo cargar el equipo'))
  }, [given])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setErr(null)
    try {
      await createJob({
        title: title.trim(),
        description: desc.trim() || undefined,
        worker_id: workerId || undefined,
        due_date: dueDate || undefined,
      })
      onCreated()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const input = 'mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 mono text-sm text-[#2A2622] focus:outline-none focus:border-[#D85A30]'

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[#2A2622]/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mx-4 w-full max-w-md border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#D85A30] px-5 py-3">
          <h2 className="hl-sm text-white">Nueva tarea</h2>
          <button onClick={onClose} className="text-white hover:opacity-70" aria-label="Cerrar"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label htmlFor="job-title" className="label text-[#58423B]">Qué hay que hacer *</label>
            <input id="job-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="Ej. Colado de losa 2º piso" className={input} required />
          </div>
          <div>
            <label htmlFor="job-desc" className="label text-[#58423B]">Detalles</label>
            <textarea id="job-desc" value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className={`${input} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-worker" className="label text-[#58423B]">Quién</label>
              <select id="job-worker" value={workerId} onChange={e => setWorkerId(e.target.value)} className={input}>
                <option value="">Sin asignar</option>
                {workers.filter(w => w.active).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="job-due" className="label text-[#58423B]">Para cuándo</label>
              <input id="job-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={input} />
            </div>
          </div>
          <p className="mono text-xs text-[#8C7169]">
            Cuando el trabajador diga que terminó, el bot le pide foto y la tarea queda esperando tu visto bueno.
          </p>

          {err && <p className="label text-[#A32D2D]">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving || !title.trim()} className="btn btn-primary flex-1 py-2">
              {saving ? 'Guardando…' : 'Crear tarea'}
            </button>
            <button type="button" onClick={onClose} className="btn py-2">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
