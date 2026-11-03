import { MessageCircle, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { BranchOption, CrewData, WorkerDetail } from '../api/client'
import { createCrew, deleteCrew, updateCrew } from '../api/client'
import { firstName, initials, waLink } from '../lib/format'
import { NewJobModal } from './NewJobModal'
import { TodayStatus } from './TodayStatus'
import { useWorkerDrawer } from './WorkerDrawer'

/** Cuadrillas: equipos con encargado. El bot habla con el encargado sobre los trabajos. */
export function CrewsBoard({ crews, branches, workers, onChanged }: {
  crews: CrewData[]
  branches: BranchOption[]
  workers: WorkerDetail[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<CrewData | 'new' | null>(null)
  const [jobFor, setJobFor] = useState<string | null>(null)
  const active = workers.filter(w => w.active)
  const loose = active.filter(w => !w.crew_id)
  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mono max-w-[70ch] text-xs text-[#58423B]">
          A las cuadrillas les mandas trabajos. El bot le pregunta al <b>encargado</b> cómo va y él dice cuándo
          terminaron; cualquier integrante puede mandar fotos.
        </p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={13} /> Nueva cuadrilla</button>
      </div>

      {crews.length === 0 && (
        <div className="border-2 border-dashed border-[#C9B8AC] bg-[#FFF8F3] px-6 py-10 text-center">
          <p className="hl-sm text-[#8C7169]">Todavía no hay cuadrillas</p>
          <p className="mono mt-1 text-xs text-[#8C7169]">Arma la primera: ponle nombre, su obra y quién es el encargado.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {crews.map(c => {
          const members = active.filter(w => w.crew_id === c.id)
          const lead = workers.find(w => w.id === c.lead_worker_id)
          const here = members.filter(w => w.today_status === 'presente' || w.today_status === 'tarde').length
          return (
            <CrewCard
              key={c.id}
              crew={c}
              where={branchName(c.branch_id) ?? 'Se mueve entre obras'}
              lead={lead}
              members={members}
              here={here}
              onEdit={() => setEditing(c)}
              onNewJob={() => setJobFor(c.id)}
            />
          )
        })}
      </div>

      {loose.length > 0 && crews.length > 0 && (
        <section className="border-2 border-dashed border-[#8C7169] bg-[#FFF8F3] p-4">
          <h3 className="hl-sm text-[15px]">Sin cuadrilla · {loose.length}</h3>
          <p className="mono mb-2 text-xs text-[#8C7169]">Pícale a cada uno para asignarle cuadrilla desde su ficha.</p>
          <LooseList workers={loose} />
        </section>
      )}

      {editing && (
        <CrewModal
          crew={editing === 'new' ? null : editing}
          branches={branches}
          workers={active}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      )}
      {jobFor && <NewJobModal defaultCrewId={jobFor} onClose={() => setJobFor(null)} onCreated={onChanged} />}
    </div>
  )
}

function LooseList({ workers }: { workers: WorkerDetail[] }) {
  const { openWorker } = useWorkerDrawer()
  return (
    <div className="flex flex-wrap gap-2">
      {workers.map(w => (
        <button key={w.id} className="btn btn-sm" onClick={() => openWorker(w.id)}>{w.name}</button>
      ))}
    </div>
  )
}

function CrewCard({ crew, where, lead, members, here, onEdit, onNewJob }: {
  crew: CrewData
  where: string
  lead: WorkerDetail | undefined
  members: WorkerDetail[]
  here: number
  onEdit: () => void
  onNewJob: () => void
}) {
  const { openWorker } = useWorkerDrawer()
  const sorted = [...members].sort((a, b) => Number(b.id === crew.lead_worker_id) - Number(a.id === crew.lead_worker_id))

  return (
    <article className="flex flex-col border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">
      <header className="flex items-start justify-between gap-3 border-b-2 border-[#2A2622] px-4 py-3">
        <div className="min-w-0">
          <h3 className="hl-sm text-[18px] leading-tight">{crew.name}</h3>
          <p className="mono text-[11px] text-[#8C7169]">{where} · {here} de {members.length} llegaron</p>
        </div>
        <button className="btn btn-sm" onClick={onEdit} aria-label={`Editar ${crew.name}`}><Pencil size={12} /> Editar</button>
      </header>

      <div className="flex items-center justify-between gap-3 border-b-2 border-[#E0C0B6] bg-[#FDF2E4] px-4 py-2.5">
        {lead ? (
          <>
            <button className="min-w-0 text-left" onClick={() => openWorker(lead.id)}>
              <span className="label block text-[10px] text-[#A5360D]">Encargado</span>
              <span className="font-semibold hover:text-[#D85A30]">{lead.name}</span>
            </button>
            <a className="btn btn-wa btn-sm" href={waLink(lead.phone_number, `Hola ${firstName(lead.name)}, `)} target="_blank" rel="noreferrer">
              <MessageCircle size={12} /> Escribirle
            </a>
          </>
        ) : (
          <p className="mono text-xs text-[#A32D2D]">Sin encargado: el bot no tiene a quién preguntarle por los trabajos.</p>
        )}
      </div>

      <ul className="flex-1">
        {sorted.length === 0 && <li className="mono px-4 py-4 text-xs text-[#8C7169]">Sin integrantes. Asígnalos desde la ficha de cada uno.</li>}
        {sorted.map(w => (
          <li key={w.id} className="border-b border-[#E0C0B6] last:border-b-0">
            <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-[#FBEBDD]" onClick={() => openWorker(w.id)}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#2A2622] bg-[#ECE1D3] font-headline text-[10px] font-semibold">
                {initials(w.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{w.name}</span>
                <span className="mono block truncate text-[10.5px] text-[#8C7169]">{w.title ?? 'Sin puesto'}</span>
              </span>
              <TodayStatus status={w.today_status} checkinAt={w.checkin_at} />
            </button>
          </li>
        ))}
      </ul>

      <footer className="border-t-2 border-[#2A2622] px-4 py-2.5">
        <button className="btn btn-sm w-full" onClick={onNewJob}><Plus size={12} /> Mandarles un trabajo</button>
      </footer>
    </article>
  )
}

function CrewModal({ crew, branches, workers, onClose, onSaved }: {
  crew: CrewData | null
  branches: BranchOption[]
  workers: WorkerDetail[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(crew?.name ?? '')
  const [branchId, setBranchId] = useState(crew?.branch_id ?? '')
  const [leadId, setLeadId] = useState(crew?.lead_worker_id ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn: () => Promise<unknown>) {
    setSaving(true)
    setErr(null)
    try {
      await fn()
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = { name: name.trim(), branch_id: branchId || null, lead_worker_id: leadId || null }
    run(() => (crew ? updateCrew(crew.id, data) : createCrew(data)))
  }

  const input = 'mt-1 w-full border-2 border-[#2A2622] bg-white px-3 py-2 mono text-sm text-[#2A2622] outline-none focus:border-[#D85A30]'
  const leadPick = workers.find(w => w.id === leadId)

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[#2A2622]/60" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mx-4 w-full max-w-md border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard">
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-5 py-3">
          <h2 className="hl-sm">{crew ? 'Editar cuadrilla' : 'Nueva cuadrilla'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] hover:bg-[#2A2622] hover:text-white"><X size={14} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <div>
            <label htmlFor="crew-name" className="label text-[#58423B]">Nombre *</label>
            <input id="crew-name" value={name} onChange={e => setName(e.target.value)} required autoFocus
              placeholder="Albañiles Altabrisa, Cuadrilla Norte, Instalaciones…" className={input} />
          </div>
          <div>
            <label htmlFor="crew-branch" className="label text-[#58423B]">Obra / sucursal</label>
            <select id="crew-branch" value={branchId} onChange={e => setBranchId(e.target.value)} className={input}>
              <option value="">Se mueve entre obras</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="crew-lead" className="label text-[#58423B]">Encargado</label>
            <select id="crew-lead" value={leadId} onChange={e => setLeadId(e.target.value)} className={input}>
              <option value="">Sin encargado</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}{w.crew_name && w.crew_id !== crew?.id ? ` · ahora en ${w.crew_name}` : ''}</option>)}
            </select>
            <p className="mono mt-1 text-xs text-[#8C7169]">
              {leadPick?.crew_id && leadPick.crew_id !== crew?.id
                ? `${leadPick.name} se cambia a esta cuadrilla.`
                : 'Es con quien habla el bot sobre los trabajos de la cuadrilla.'}
            </p>
          </div>

          {err && <p className="mono text-sm text-[#A32D2D]">{err}</p>}

          {confirmDelete ? (
            <div className="space-y-2 border-2 border-[#A32D2D] p-3">
              <p className="text-sm">¿Borrar <b>{crew?.name}</b>? Sus integrantes y trabajos se quedan, pero sin cuadrilla.</p>
              <div className="flex gap-2">
                <button type="button" className="btn bg-[#A32D2D] text-white hover:bg-[#7F2020]" disabled={saving}
                  onClick={() => crew && run(() => deleteCrew(crew.id))}>Sí, borrar</button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 border-t-2 border-[#E0C0B6] pt-4">
              <button type="submit" className="btn btn-primary flex-1 py-2" disabled={saving || !name.trim()}>
                {saving ? 'Guardando…' : crew ? 'Guardar' : 'Crear cuadrilla'}
              </button>
              {crew && <button type="button" className="btn py-2 text-[#A32D2D]" onClick={() => setConfirmDelete(true)}>Borrar</button>}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
