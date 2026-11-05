import { MessageCircle, Plus, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WorkerSummary } from '../api/client'
import type { BranchOption, CrewData } from '../api/client'
import { deactivateWorker, fetchBranches, fetchCrews, fetchWorkerSummary, updateWorker, updateWorkerTitle } from '../api/client'
import { compareWith, fmtDia, fmtHace, fmtHora, firstName, waLink } from '../lib/format'
import { AttendanceCalendar } from './Attendance'
import { NewJobModal } from './NewJobModal'
import { PhotoLightbox, PhotoThumb, type LightboxEntry } from './PhotoLightbox'
import { EditableAvatar } from './Avatar'
import { LocationChip, TodayStatus } from './TodayStatus'
import { usePolling } from '../lib/usePolling'
import { useSite } from '../lib/site'

// ─── Contexto: cualquier pantalla puede abrir la ficha ───────────────────────

interface DrawerCtx {
  openWorker: (id: string) => void
  /** Cambia cada vez que algo se modifica desde la ficha; las páginas recargan con él. */
  version: number
  bump: () => void
}

const Ctx = createContext<DrawerCtx>({ openWorker: () => {}, version: 0, bump: () => {} })

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkerDrawer = () => useContext(Ctx)

export function WorkerDrawerProvider({ children }: { children: ReactNode }) {
  const [workerId, setWorkerId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion(v => v + 1), [])

  return (
    <Ctx.Provider value={{ openWorker: setWorkerId, version, bump }}>
      {children}
      {workerId && <WorkerDrawer workerId={workerId} onClose={() => setWorkerId(null)} onChanged={bump} />}
    </Ctx.Provider>
  )
}

// ─── Ficha ────────────────────────────────────────────────────────────────────

const JOB_CHIP: Record<string, { cls: string; label: string }> = {
  por_revisar: { cls: 'chip chip-orange', label: 'Por revisar' },
  en_progreso: { cls: 'chip chip-gray',   label: 'En curso'    },
  pendiente:   { cls: 'chip chip-gray',   label: 'Pendiente'   },
  atrasado:    { cls: 'chip chip-red',    label: 'Con problema' },
}

const TIMELINE_LABEL: Record<string, string> = {
  checkin: 'Mandó "presente"', photo: 'Mandó foto', audio: 'Audio', location: 'Mandó ubicación',
  text: 'Mensaje', unknown: 'Mensaje',
}

function WorkerDrawer({ workerId, onClose, onChanged }: {
  workerId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<WorkerSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<LightboxEntry | null>(null)
  const [newJob, setNewJob] = useState(false)

  const load = useCallback(() => {
    fetchWorkerSummary(workerId)
      .then(r => { setData(r); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
  }, [workerId])

  useEffect(() => { setData(null); load() }, [load])
  usePolling(load)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !photo && !newJob) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, photo, newJob])

  const w = data?.worker

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#2A2622]/40" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside
        className="drawer-in flex h-full w-full max-w-[480px] flex-col overflow-y-auto border-l-2 border-[#2A2622] bg-[#FFF8F3] shadow-[-6px_0_0_0_rgba(42,38,34,0.15)]"
        aria-label={w ? `Ficha de ${w.name}` : 'Ficha del trabajador'}
      >
        {/* Encabezado */}
        <div className="sticky top-0 z-10 space-y-3 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            {w ? (
              <EditableAvatar workerId={w.id} name={w.name} photoUrl={w.photo_url} onChanged={() => { load(); onChanged() }} />
            ) : (
              <div className="h-14 w-14 shrink-0 border-2 border-[#2A2622] bg-[#ECE1D3]" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="hl-md leading-tight text-[#2A2622]">{w?.name ?? 'Cargando…'}</h2>
              {w && (
                <>
                  <p className="text-xs text-[#58423B]">
                    {[w.title, w.branch_name].filter(Boolean).join(' · ') || 'Sin puesto'}
                  </p>
                  {w.crew_name && (
                    <p className="text-xs text-[#58423B]">
                      Cuadrilla {w.crew_name}
                      {w.is_lead && <span className="chip chip-orange ml-1.5 align-middle">Encargado</span>}
                    </p>
                  )}
                  <p className="mono text-xs text-[#8C7169]">{w.phone_number}</p>
                </>
              )}
            </div>
            <button onClick={onClose} className="btn btn-sm h-8 w-8 p-0" aria-label="Cerrar ficha"><X size={14} /></button>
          </div>
          {w && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <TodayStatus status={w.today_status} checkinAt={w.checkin_at} />
                <LocationChip location={w.location} />
                <span className="label ml-auto text-[#8C7169]">
                  último reporte {w.last_event ? fmtHace(w.last_event.received_at) : 'nunca'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-wa" href={waLink(w.phone_number, `Hola ${firstName(w.name)}, `)} target="_blank" rel="noreferrer">
                  <MessageCircle size={13} /> Escribirle por WhatsApp
                </a>
                {w.active && (
                  <button className="btn" onClick={() => setNewJob(true)}><Plus size={13} /> Asignar tarea</button>
                )}
              </div>
            </>
          )}
        </div>

        {error && <p className="text-sm px-5 py-6 text-[#A32D2D]">{error}</p>}
        {!data && !error && <div className="m-5 h-64 animate-pulse border-2 border-[#E0C0B6]" />}

        {data && w && (
          <>
            {/* Últimos 30 días */}
            <Section title="Últimos 30 días" aside={`${fmtDia(data.month.from)} – hoy`}>
              <div className="grid grid-cols-2 border-2 border-[#2A2622] sm:grid-cols-4">
                <Kpi value={`${data.month.days_worked}/${data.month.days_expected}`} label="Días que vino" />
                <Kpi value={data.month.avg_checkin ?? '—'} label="Llega en promedio" small />
                <Kpi value={String(data.month.jobs_done)} label="Tareas cerradas" />
                <Kpi
                  value={String(data.month.jobs_overdue)}
                  label="Atrasadas hoy"
                  tone={data.month.jobs_overdue > 0 ? 'bad' : 'good'}
                />
              </div>
              <AttendanceCalendar days={data.calendar} />
              {(data.month.days_late > 0 || data.month.days_absent > 0) && (
                <p className="text-xs text-[#58423B]">
                  {[
                    data.month.days_late > 0 && `Llegó tarde ${data.month.days_late} ${data.month.days_late === 1 ? 'vez' : 'veces'}`,
                    data.month.days_absent > 0 && `faltó ${data.month.days_absent} ${data.month.days_absent === 1 ? 'día' : 'días'}`,
                  ].filter(Boolean).join(' y ')}.
                </p>
              )}
            </Section>

            {/* Hoy */}
            <Section title="Hoy" aside={`${data.today.length} ${data.today.length === 1 ? 'reporte' : 'reportes'}`}>
              {data.today.length === 0 ? (
                <p className="text-sm text-[#8C7169]">Hoy no ha mandado nada.</p>
              ) : (
                <ol className="space-y-0">
                  {data.today.map((e, i) => (
                    <li key={e.id} className="grid grid-cols-[52px_14px_1fr] gap-2 pb-3">
                      <span className="mono text-xs font-bold">{fmtHora(e.received_at)}</span>
                      <span className="relative">
                        <span className={`mt-1 block h-3 w-3 border-2 border-[#2A2622] ${e.type === 'checkin' ? 'bg-[#639922]' : e.type === 'photo' ? 'bg-[#D85A30]' : 'bg-[#FFF8F3]'}`} />
                        {i < data.today.length - 1 && <span className="absolute bottom-[-12px] left-[5px] top-4 w-0.5 bg-[#E0C0B6]" />}
                      </span>
                      <div className="min-w-0 text-sm">
                        <p>
                          {TIMELINE_LABEL[e.type] ?? 'Mensaje'}
                          {e.job_title && <> · <b className="font-semibold">{e.job_title}</b></>}
                        </p>
                        {e.text && e.type !== 'checkin' && (
                          <q className="mt-0.5 block border-l-[3px] border-[#E0C0B6] pl-2 text-[13px] italic text-[#58423B]">{e.text}</q>
                        )}
                        {e.media_url && e.type === 'photo' && (
                          <PhotoThumb
                            url={e.media_url}
                            className="mt-1.5 w-28"
                            duplicate={!!e.duplicate_of}
                            onOpen={() => setPhoto({ url: e.media_url!, title: w.name, subtitle: fmtHora(e.received_at), compare: compareWith(e.duplicate_of) })}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* Tareas */}
            <Section title="Sus trabajos" aside={`${data.jobs.length} ${data.jobs.length === 1 ? 'abierto' : 'abiertos'}`}>
              {data.jobs.length === 0 ? (
                <p className="text-sm text-[#8C7169]">Ni él ni su cuadrilla tienen trabajos abiertos.</p>
              ) : (
                <ul className="space-y-2">
                  {data.jobs.map(j => {
                    const chip = j.overdue && j.status !== 'por_revisar'
                      ? { cls: 'chip chip-red', label: 'Atrasada' }
                      : JOB_CHIP[j.status] ?? JOB_CHIP.pendiente
                    const border = j.status === 'por_revisar' ? 'border-l-[#D85A30]' : j.overdue ? 'border-l-[#A32D2D]' : 'border-l-[#2A2622]'
                    return (
                      <li key={j.id} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-2 border-l-[6px] border-[#2A2622] ${border} px-3 py-2`}>
                        <b className="text-sm font-semibold">{j.title}</b>
                        <span className={chip.cls}>{chip.label}</span>
                        <small className="text-xs text-[#8C7169]">
                          {j.status === 'por_revisar' && j.completed_at
                            ? `Terminó ${fmtDia(j.completed_at)} ${fmtHora(j.completed_at)}`
                            : j.due_date ? `Vence ${fmtDia(j.due_date)}` : 'Sin fecha'}
                          {' · '}{j.photo_count} {j.photo_count === 1 ? 'foto' : 'fotos'}
                          {j.crew_name && ` · ${j.crew_name}`}
                        </small>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>

            {/* Fotos */}
            {data.photos.length > 0 && (
              <Section title="Fotos recientes" aside={`${data.photo_total} en total`}>
                <div className="grid grid-cols-3 gap-2">
                  {data.photos.map(p => (
                    <PhotoThumb
                      key={p.id}
                      url={p.url}
                      label={`${p.job_title ?? 'Foto'} · ${fmtDia(p.received_at)}`}
                      duplicate={!!p.duplicate_of}
                      onOpen={() => setPhoto({ url: p.url, title: p.job_title ?? w.name, subtitle: `${fmtDia(p.received_at)} ${fmtHora(p.received_at)}`, compare: compareWith(p.duplicate_of) })}
                    />
                  ))}
                </div>
              </Section>
            )}

            {/* Administrar */}
            <AdminSection
              crewId={w.crew_id}
              branchId={w.branch_id}
              workerId={w.id}
              name={w.name}
              title={w.title}
              active={w.active}
              onChanged={() => { load(); onChanged() }}
              onDeactivated={() => { onChanged(); onClose() }}
            />
          </>
        )}
      </aside>

      {photo && <PhotoLightbox entry={photo} onClose={() => setPhoto(null)} />}
      {newJob && w && (
        <NewJobModal defaultWorkerId={w.id} onClose={() => setNewJob(false)} onCreated={() => { load(); onChanged() }} />
      )}
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b-2 border-[#E0C0B6] px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="hl-sm text-[15px] text-[#2A2622]">{title}</h3>
        {aside && <span className="label text-[#8C7169]">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

function Kpi({ value, label, tone, small }: { value: string; label: string; tone?: 'good' | 'bad'; small?: boolean }) {
  const color = tone === 'bad' ? 'text-[#A32D2D]' : tone === 'good' ? 'text-[#4F7D1A]' : 'text-[#2A2622]'
  return (
    <div className="border-b-2 border-r-2 border-[#E0C0B6] px-3 py-2 last:border-r-0 sm:border-b-0 [&:nth-child(2)]:border-r-0 sm:[&:nth-child(2)]:border-r-2">
      <b className={`block font-headline font-semibold leading-tight tabular-nums ${small ? 'text-lg' : 'text-[22px]'} ${color}`}>{value}</b>
      <span className="mono text-[10px] uppercase leading-tight tracking-wide text-[#8C7169]">{label}</span>
    </div>
  )
}

function AdminSection({ crewId, branchId, workerId, name, title, active, onChanged, onDeactivated }: {
  crewId: string | null
  branchId: string | null
  workerId: string
  name: string
  title: string | null
  active: boolean
  onChanged: () => void
  onDeactivated: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title ?? '')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function saveTitle() {
    setBusy(true)
    setErr(null)
    try {
      await updateWorkerTitle(workerId, value.trim() || null)
      setEditing(false)
      onChanged()
    } catch {
      setErr('No se pudo guardar el puesto')
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    setBusy(true)
    try {
      await deactivateWorker(workerId)
      onDeactivated()
    } catch {
      setErr('No se pudo dar de baja')
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 px-5 py-4">
      <h3 className="label text-[#8C7169]">Administrar</h3>
      {editing ? (
        <div className="flex gap-2">
          <label htmlFor="worker-title" className="sr-only">Puesto</label>
          <input
            id="worker-title"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditing(false) }}
            autoFocus
            placeholder="Albañil, Electricista…"
            className="flex-1 border-2 border-[#D85A30] bg-white px-2 py-1 text-sm outline-none"
          />
          <button className="btn btn-primary" disabled={busy} onClick={saveTitle}>Guardar</button>
          <button className="btn" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => { setValue(title ?? ''); setEditing(true) }}>Cambiar puesto</button>
          {active && !confirming && (
            <button className="btn text-[#A32D2D]" onClick={() => setConfirming(true)}>Dar de baja</button>
          )}
        </div>
      )}
      {active && <Placement workerId={workerId} crewId={crewId} branchId={branchId} onChanged={onChanged} />}
      {confirming && (
        <div className="space-y-2 border-2 border-[#A32D2D] bg-[#FFF8F3] p-3">
          <p className="text-sm">¿Dar de baja a <b>{name}</b>? Ya no podrá registrarse por WhatsApp. Su historial se queda.</p>
          <div className="flex gap-2">
            <button className="btn bg-[#A32D2D] text-white hover:bg-[#7F2020]" disabled={busy} onClick={deactivate}>Sí, dar de baja</button>
            <button className="btn" onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-[#A32D2D]">{err}</p>}
    </section>
  )
}

/** Cuadrilla y obra del trabajador, editables desde la ficha. */
function Placement({ workerId, crewId, branchId, onChanged }: {
  workerId: string
  crewId: string | null
  branchId: string | null
  onChanged: () => void
}) {
  const site = useSite()
  const [crews, setCrews] = useState<CrewData[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchCrews(), fetchBranches()])
      .then(([c, b]) => { setCrews(c.crews); setBranches(b.branches) })
      .catch(() => setErr(`No se pudieron cargar cuadrillas y ${site.many}`))
  }, [])

  async function save(data: { crew_id?: string | null; branch_id?: string | null }) {
    setBusy(true)
    setErr(null)
    try {
      await updateWorker(workerId, data)
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const sel = 'mt-1 w-full border-2 border-[#2A2622] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#D85A30] disabled:opacity-50'
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor="worker-crew" className="label text-[#58423B]">Cuadrilla</label>
        <select id="worker-crew" className={sel} disabled={busy} value={crewId ?? ''}
          onChange={e => save({ crew_id: e.target.value || null })}>
          <option value="">Sin cuadrilla</option>
          {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="worker-branch" className="label text-[#58423B]">{site.One}</label>
        <select id="worker-branch" className={sel} disabled={busy} value={branchId ?? ''}
          onChange={e => save({ branch_id: e.target.value || null })}>
          <option value="">Sin {site.one}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {err && <p className="col-span-2 text-xs text-[#A32D2D]">{err}</p>}
    </div>
  )
}
