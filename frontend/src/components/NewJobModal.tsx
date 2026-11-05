import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BranchOption, CrewData, WorkerDetail } from '../api/client'
import { createJob, fetchBranches, fetchCrews, fetchWorkers } from '../api/client'
import { useSite } from '../lib/site'

type Target = 'crew' | 'person'

/**
 * Nuevo trabajo. Lo normal es mandárselo a una cuadrilla: su encargado reporta
 * y cualquier integrante puede mandar fotos. A una persona es la excepción.
 */
export function NewJobModal({ defaultWorkerId, defaultCrewId, onClose, onCreated }: {
  defaultWorkerId?: string
  defaultCrewId?: string
  onClose: () => void
  /** notice: resultado del aviso por WhatsApp, para mostrarlo en la pantalla de origen. */
  onCreated: (notice?: string) => void
}) {
  const site = useSite()
  const [workers, setWorkers]   = useState<WorkerDetail[]>([])
  const [crews, setCrews]       = useState<CrewData[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [target, setTarget]     = useState<Target>(defaultWorkerId && !defaultCrewId ? 'person' : 'crew')
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [crewId, setCrewId]     = useState(defaultCrewId ?? '')
  const [workerId, setWorkerId] = useState(defaultWorkerId ?? '')
  const [branchId, setBranchId] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)
  const [loaded, setLoaded]     = useState(false)
  const [notifyLead, setNotify] = useState(true)
  const [warning, setWarning]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchWorkers(), fetchCrews(), fetchBranches()])
      .then(([w, c, b]) => {
        setWorkers(w.workers)
        setCrews(c.crews)
        setBranches(b.branches)
        setLoaded(true)
        // Sin cuadrillas todavía: arranca en "Una persona" (se puede regresar).
        if (c.crews.length === 0 && !defaultCrewId) setTarget('person')
      })
      .catch(() => setErr('No se pudo cargar el equipo'))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const crew = crews.find(c => c.id === crewId)
  const lead = workers.find(w => w.id === crew?.lead_worker_id)
  const crewBranch = branches.find(b => b.id === crew?.branch_id)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setErr(null)
    try {
      const res = await createJob({
        title: title.trim(),
        description: desc.trim() || undefined,
        crew_id: target === 'crew' ? crewId || undefined : undefined,
        worker_id: target === 'person' ? workerId || undefined : undefined,
        branch_id: branchId || undefined,
        due_date: dueDate || undefined,
        notify: notifyLead,
      })
      if (notifyLead && !res.notified && res.notice) {
        // El trabajo sí se creó; solo falló el aviso. Que el dueño lo sepa antes de cerrar.
        onCreated()
        setWarning(res.notice)
        return
      }
      onCreated(res.notice ?? undefined)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const input = 'mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 mono text-sm text-[#2A2622] focus:outline-none focus:border-[#D85A30]'
  const tab = (on: boolean) =>
    `label flex-1 border-2 border-[#2A2622] px-3 py-1.5 ${on ? 'bg-[#2A2622] text-white' : 'bg-white text-[#2A2622] hover:bg-[#ECE1D3]'}`

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-[#2A2622]/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="mx-4 max-h-[92vh] w-full max-w-md overflow-y-auto border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#D85A30] px-5 py-3">
          <h2 className="hl-sm text-white">Nuevo trabajo</h2>
          <button onClick={onClose} className="text-white hover:opacity-70" aria-label="Cerrar"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label htmlFor="job-title" className="label text-[#58423B]">Qué hay que hacer *</label>
            <input id="job-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder="Ej. Fumigar casa García · Colado de losa nivel 3" className={input} required />
          </div>

          <fieldset>
            <legend className="label text-[#58423B]">Quién lo hace</legend>
            <div className="mt-1 flex gap-1.5" role="group">
              <button type="button" className={tab(target === 'crew')} aria-pressed={target === 'crew'}
                onClick={() => setTarget('crew')}>Una cuadrilla</button>
              <button type="button" className={tab(target === 'person')} aria-pressed={target === 'person'}
                onClick={() => setTarget('person')}>Una persona</button>
            </div>
            {target === 'crew' && loaded && crews.length === 0 ? (
              <p className="mono mt-2 border-2 border-dashed border-[#8C7169] bg-[#F2EDE4] px-3 py-2 text-xs text-[#58423B]">
                Todavía no tienes cuadrillas. Ármalas en <b>Equipo → Cuadrillas</b> (nombre, {site.one} y encargado),
                o asígnale este trabajo a una persona.
              </p>
            ) : target === 'crew' ? (
              <>
                <label htmlFor="job-crew" className="sr-only">Cuadrilla</label>
                <select id="job-crew" value={crewId} onChange={e => setCrewId(e.target.value)} className={input}>
                  <option value="">Elige la cuadrilla…</option>
                  {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {crew && (
                  <p className="mono mt-1 text-xs text-[#58423B]">
                    {lead ? <>El bot le pregunta a <b>{lead.name}</b> (encargado). </> : <span className="text-[#A32D2D]">Esta cuadrilla no tiene encargado: el bot no tendrá a quién preguntarle. </span>}
                    Cualquiera de la cuadrilla puede mandar fotos.
                  </p>
                )}
              </>
            ) : (
              <>
                <label htmlFor="job-worker" className="sr-only">Persona</label>
                <select id="job-worker" value={workerId} onChange={e => setWorkerId(e.target.value)} className={input}>
                  <option value="">Sin asignar</option>
                  {workers.filter(w => w.active).map(w => (
                    <option key={w.id} value={w.id}>{w.name}{w.crew_name ? ` · ${w.crew_name}` : ''}</option>
                  ))}
                </select>
              </>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-branch" className="label text-[#58423B]">Dónde</label>
              <select id="job-branch" value={branchId} onChange={e => setBranchId(e.target.value)} className={input}>
                <option value="">{crewBranch && target === 'crew' ? `${crewBranch.name} (de la cuadrilla)` : 'Según quién lo hace'}</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="job-due" className="label text-[#58423B]">Para cuándo</label>
              <input id="job-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <label htmlFor="job-desc" className="label text-[#58423B]">Detalles</label>
            <textarea id="job-desc" value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="Dirección, materiales, lo que deba saber la cuadrilla…" className={`${input} resize-none`} />
          </div>

          {(() => {
            const who = target === 'crew' ? lead?.name : workers.find(w => w.id === workerId)?.name
            return (
              <label className="flex cursor-pointer items-start gap-2.5 border-2 border-[#2A2622] bg-white px-3 py-2.5">
                <input type="checkbox" checked={notifyLead} onChange={e => setNotify(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#D85A30]" />
                <span className="text-sm leading-snug">
                  <b>Avisarle por WhatsApp</b>{who ? ` a ${who}` : ''}
                  <span className="mono block text-[11px] text-[#8C7169]">
                    Le llega el trabajo con botones: Enterado / Ya terminé / Tengo un problema.
                  </span>
                </span>
              </label>
            )
          })()}

          <p className="mono text-xs text-[#8C7169]">
            Cuando digan que terminaron, el bot pide foto y el trabajo queda esperando tu visto bueno.
          </p>

          {err && <p className="label text-[#A32D2D]">{err}</p>}

          {warning ? (
            <div className="space-y-2 border-2 border-[#BA7517] bg-[#FDF2E4] p-3">
              <p className="text-sm"><b>El trabajo se creó.</b> {warning}</p>
              <button type="button" className="btn btn-primary" onClick={onClose}>Entendido</button>
            </div>
          ) : (
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !title.trim() || (target === 'crew' && !crewId)}
              className="btn btn-primary flex-1 py-2"
            >
              {saving ? 'Guardando…' : 'Crear trabajo'}
            </button>
            <button type="button" onClick={onClose} className="btn py-2">Cancelar</button>
          </div>
          )}
        </form>
      </div>
    </div>
  )
}
