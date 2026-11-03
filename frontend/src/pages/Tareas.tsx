import { Bot, Check, MessageCircle, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JobData, JobStatus } from '../api/client'
import { approveJob, deleteJob, fetchJobs, rejectJob, remindJob, updateJob } from '../api/client'
import { NewJobModal } from '../components/NewJobModal'
import { PhotoLightbox, PhotoThumb, type LightboxEntry } from '../components/PhotoLightbox'
import { useWorkerDrawer } from '../components/WorkerDrawer'
import { fmtCuando, fmtDia, fmtHora, firstName, initials, parseDay, plural, waLink } from '../lib/format'

type Column = 'atrasadas' | 'por_revisar' | 'en_curso' | 'terminadas'

const COLUMNS: { key: Column; title: string; head: string; empty: string }[] = [
  { key: 'atrasadas',   title: 'Atrasadas',   head: 'bg-[#A32D2D]', empty: 'Nada atrasado.' },
  { key: 'por_revisar', title: 'Por revisar', head: 'bg-[#D85A30]', empty: 'Nada esperando tu visto bueno.' },
  { key: 'en_curso',    title: 'En curso',    head: 'bg-[#2A2622]', empty: 'No hay tareas abiertas.' },
  { key: 'terminadas',  title: 'Terminadas',  head: 'bg-[#4F7D1A]', empty: 'Ninguna cerrada en 7 días.' },
]

const DAY_MS = 86_400_000

function columnOf(j: JobData): Column {
  if (j.status === 'completado') return 'terminadas'
  if (j.status === 'por_revisar') return 'por_revisar'
  if (j.overdue) return 'atrasadas'
  return 'en_curso'
}

function closedOnTime(j: JobData): boolean {
  if (!j.closed_at || !j.due_date) return true
  return new Date(j.closed_at) <= new Date(parseDay(j.due_date).getTime() + DAY_MS / 2)
}

export function Tareas() {
  const [jobs, setJobs]       = useState<JobData[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState<string | null>(null)
  const [branch, setBranch]   = useState<string>('')
  const [showModal, setShowModal] = useState(false)
  const [showAllDone, setShowAllDone] = useState(false)
  const [photo, setPhoto]     = useState<LightboxEntry | null>(null)
  const [now, setNow]         = useState(() => Date.now())
  const { version, bump } = useWorkerDrawer()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setJobs((await fetchJobs()).jobs)
      setNow(Date.now())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, version])

  const branches = useMemo(
    () => [...new Set(jobs.map(j => j.branch_name).filter((b): b is string => !!b))].sort(),
    [jobs],
  )
  const filtered = branch ? jobs.filter(j => j.branch_name === branch) : jobs

  const weekAgo = now - 7 * DAY_MS
  const byColumn = useMemo(() => {
    const out: Record<Column, JobData[]> = { atrasadas: [], por_revisar: [], en_curso: [], terminadas: [] }
    for (const j of filtered) {
      const col = columnOf(j)
      if (col === 'terminadas' && !showAllDone && (!j.closed_at || new Date(j.closed_at).getTime() < weekAgo)) continue
      out[col].push(j)
    }
    const due = (j: JobData) => j.due_date ?? '9999'
    out.atrasadas.sort((a, b) => due(a).localeCompare(due(b)))
    out.por_revisar.sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
    out.en_curso.sort((a, b) => due(a).localeCompare(due(b)))
    out.terminadas.sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
    return out
  }, [filtered, showAllDone, weekAgo])

  const summary = useMemo(() => {
    const closedWeek = filtered.filter(j => j.closed_at && new Date(j.closed_at).getTime() >= weekAgo)
    const onTime = closedWeek.filter(closedOnTime).length
    const monthAgo = now - 30 * DAY_MS
    const durations = filtered
      .filter(j => j.closed_at && new Date(j.closed_at).getTime() >= monthAgo)
      .map(j => (new Date(j.closed_at!).getTime() - new Date(j.created_at).getTime()) / DAY_MS)
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null
    const overdueBy = new Map<string, number>()
    for (const j of filtered) if (j.overdue && j.worker_name) overdueBy.set(j.worker_name, (overdueBy.get(j.worker_name) ?? 0) + 1)
    const worst = [...overdueBy.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
    return { closedWeek: closedWeek.length, onTime, avg, worst }
  }, [filtered, weekAgo, now])

  function afterChange() { load(); bump() }

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3 shadow-[4px_4px_0_0_#2A2622] md:px-8 md:py-4">
        <div>
          <h1 className="hl-md text-[#2A2622]">Tareas</h1>
          <p className="label text-[#8C7169]">
            {byColumn.atrasadas.length + byColumn.por_revisar.length + byColumn.en_curso.length} abiertas
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowModal(true)} className="btn btn-primary">+ Nueva tarea</button>
          <button onClick={load} disabled={loading} className="btn" aria-label="Actualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 md:px-8 md:py-6">
        {err && <p className="mono border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3 text-[#A32D2D]">No se pudo cargar — {err}</p>}

        {/* Resumen */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 border-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#58423B]">Cerradas a tiempo · 7 días</span>
            <div className="mono flex items-baseline justify-between text-[11px] text-[#58423B]">
              <span className="font-headline text-2xl font-semibold text-[#2A2622]">{summary.onTime} de {summary.closedWeek}</span>
              <span>{summary.closedWeek ? `${Math.round((100 * summary.onTime) / summary.closedWeek)}%` : '—'}</span>
            </div>
            <div className="relative h-2 border border-[#8C7169] bg-[#E5DFD3]">
              <div className="absolute inset-y-0 left-0 bg-[#2A2622]" style={{ width: `${summary.closedWeek ? (100 * summary.onTime) / summary.closedWeek : 0}%` }} />
            </div>
          </div>
          <div className="space-y-1 border-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#58423B]">Tardan en cerrarse</span>
            <p className="font-headline text-2xl font-semibold">
              {summary.avg === null ? '—' : `${summary.avg.toFixed(1)} días`}
            </p>
            <p className="mono text-[11px] text-[#8C7169]">promedio de los últimos 30 días</p>
          </div>
          <div className="space-y-1 border-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#58423B]">Más atrasos</span>
            {summary.worst ? (
              <>
                <p className="text-[15px]"><b>{summary.worst[0]}</b></p>
                <p className="mono text-[11px] text-[#A32D2D]">{plural(summary.worst[1], 'tarea atrasada', 'tareas atrasadas')}</p>
              </>
            ) : (
              <p className="mono pt-1 text-sm text-[#4F7D1A]">Nadie trae atrasos.</p>
            )}
          </div>
        </div>

        {branches.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por sucursal">
            {['', ...branches].map(b => (
              <button
                key={b || 'todas'}
                onClick={() => setBranch(b)}
                aria-pressed={branch === b}
                className={`label border-2 border-[#2A2622] px-2.5 py-1.5 ${branch === b ? 'bg-[#2A2622] text-white' : 'bg-[#FFF8F3] hover:bg-[#ECE1D3]'}`}
              >
                {b || 'Todas las sucursales'}
              </button>
            ))}
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <div className="h-72 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map(c => (
              <section key={c.key} className="flex flex-col gap-2" aria-labelledby={`col-${c.key}`}>
                <div className={`flex items-center justify-between border-2 border-[#2A2622] px-3 py-2 text-white ${c.head}`}>
                  <h2 id={`col-${c.key}`} className="hl-sm text-[15px]">{c.title}</h2>
                  <span className="mono text-sm font-bold">{byColumn[c.key].length}</span>
                </div>
                {byColumn[c.key].length === 0 && (
                  <p className="mono border-2 border-dashed border-[#C9B8AC] px-3 py-5 text-center text-xs text-[#8C7169]">{c.empty}</p>
                )}
                {byColumn[c.key].map(j => (
                  <JobCard key={j.id} job={j} column={c.key} onChanged={afterChange} onPhoto={setPhoto} />
                ))}
                {c.key === 'terminadas' && (
                  <button className="mono py-1 text-xs text-[#58423B] underline underline-offset-2" onClick={() => setShowAllDone(v => !v)}>
                    {showAllDone ? 'Ver solo los últimos 7 días' : 'Ver todas las terminadas'}
                  </button>
                )}
              </section>
            ))}
          </div>
        )}
      </main>

      {showModal && <NewJobModal onClose={() => setShowModal(false)} onCreated={afterChange} />}
      {photo && <PhotoLightbox entry={photo} onClose={() => setPhoto(null)} />}
    </div>
  )
}

// ─── Tarjeta ──────────────────────────────────────────────────────────────────

const MOVE_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_progreso', label: 'En curso' },
  { value: 'atrasado', label: 'Con problema' },
  { value: 'completado', label: 'Terminada (sin revisar)' },
]

function JobCard({ job: j, column, onChanged, onPhoto }: {
  job: JobData
  column: Column
  onChanged: () => void
  onPhoto: (e: LightboxEntry) => void
}) {
  const { openWorker } = useWorkerDrawer()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg(ok)
      onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo')
    } finally {
      setBusy(false)
    }
  }

  const photos = j.photos
  const shown = column === 'por_revisar' ? photos.slice(-2) : []
  const n = firstName(j.worker_name)

  return (
    <article className={`space-y-2 border-2 border-[#2A2622] bg-[#FFF8F3] p-3 ${column === 'terminadas' ? 'opacity-90' : ''}`}>
      <p className="font-semibold leading-snug">{j.title}</p>

      {j.worker_name ? (
        <button className="group flex items-center gap-2 text-left" onClick={() => j.worker_id && openWorker(j.worker_id)}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#2A2622] bg-[#ECE1D3] font-headline text-[10px] font-semibold">
            {initials(j.worker_name)}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13px] font-medium group-hover:text-[#D85A30]">{j.worker_name}</span>
            {j.branch_name && <span className="mono block truncate text-[10.5px] text-[#8C7169]">{j.branch_name}</span>}
          </span>
        </button>
      ) : (
        <p className="mono text-xs text-[#8C7169]">Sin asignar</p>
      )}

      {shown.length > 0 && (
        <div className={`grid gap-1 ${shown.length > 1 ? 'grid-cols-2' : ''}`}>
          {shown.map((p, i) => (
            <PhotoThumb
              key={p.id}
              url={p.url}
              label={shown.length > 1 ? `${i === 0 ? 'Antes' : 'Después'} · ${fmtDia(p.received_at)}` : fmtCuando(p.received_at)}
              onOpen={() => onPhoto({ url: p.url, title: j.title, subtitle: `${j.worker_name ?? ''} · ${fmtCuando(p.received_at)}` })}
            />
          ))}
        </div>
      )}
      {column === 'por_revisar' && photos.length === 0 && (
        <p className="mono border border-dashed border-[#8C7169] bg-[#F2EDE4] px-2 py-1 text-[11px] text-[#58423B]">
          Todavía no manda la foto. El bot ya se la pidió.
        </p>
      )}

      <div className="mono flex flex-wrap justify-between gap-x-2 text-[11px] text-[#8C7169]">
        <span className={column === 'atrasadas' ? 'font-bold text-[#A32D2D]' : ''}>
          {column === 'por_revisar' && j.completed_at
            ? `Terminó ${fmtCuando(j.completed_at)}`
            : column === 'terminadas' && j.closed_at
              ? `Cerrada ${fmtDia(j.closed_at)}${closedOnTime(j) ? '' : ' (tarde)'}`
              : j.status === 'atrasado' && (!j.due_date || !j.overdue)
                ? 'Reportó un problema'
                : j.due_date
                  ? `${column === 'atrasadas' ? 'Venció' : 'Vence'} ${fmtDia(j.due_date)}`
                  : 'Sin fecha'}
        </span>
        <span>{plural(j.photo_count, 'foto', 'fotos')}</span>
      </div>

      {j.review_note && column !== 'terminadas' && (
        <p className="border-l-[3px] border-[#D85A30] pl-2 text-xs text-[#58423B]">
          <b>Regresada:</b> {j.review_note}
        </p>
      )}
      {j.bot_asked_at && column !== 'terminadas' && (
        <p className="mono flex items-center gap-1 border border-dashed border-[#8C7169] bg-[#F2EDE4] px-2 py-1 text-[11px] text-[#58423B]">
          <Bot size={12} aria-hidden="true" /> El bot le preguntó a las {fmtHora(j.bot_asked_at)}
        </p>
      )}

      {/* Acciones */}
      {column === 'por_revisar' && !rejecting && (
        <div className="flex gap-1.5">
          <button className="btn btn-primary btn-sm flex-1" disabled={busy} onClick={() => run(() => approveJob(j.id))}>
            <Check size={12} /> Aprobar
          </button>
          <button className="btn btn-sm flex-1" disabled={busy} onClick={() => setRejecting(true)}>
            <Undo2 size={12} /> Regresar
          </button>
        </div>
      )}
      {rejecting && (
        <form
          className="space-y-1.5"
          onSubmit={e => {
            e.preventDefault()
            if (note.trim()) run(() => rejectJob(j.id, note.trim()), `Le avisamos a ${n} por WhatsApp.`).then(() => setRejecting(false))
          }}
        >
          <label htmlFor={`note-${j.id}`} className="label text-[#58423B]">¿Qué falta?</label>
          <textarea
            id={`note-${j.id}`}
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Ej. Falta limpiar el área y retirar la cimbra"
            className="mono w-full resize-none border-2 border-[#2A2622] bg-white px-2 py-1 text-xs outline-none focus:border-[#D85A30]"
          />
          <div className="flex gap-1.5">
            <button type="submit" className="btn btn-primary btn-sm flex-1" disabled={busy || !note.trim()}>Regresar a {n || 'trabajador'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setRejecting(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {(column === 'atrasadas' || column === 'en_curso') && (
        <div className="flex flex-wrap gap-1.5">
          {j.worker_phone && (
            <a className="btn btn-wa btn-sm" href={waLink(j.worker_phone, `Hola ${n}, ¿cómo va *${j.title}*? Mándame foto del avance.`)} target="_blank" rel="noreferrer">
              <MessageCircle size={12} /> Escribirle
            </a>
          )}
          {j.worker_id && (
            <button
              className="btn btn-sm"
              disabled={busy}
              title="El bot le manda la tarea con botones: Ya terminé / Sigo en eso / Tengo un problema"
              onClick={() => run(() => remindJob(j.id), 'El bot ya le preguntó.')}
            >
              <Bot size={12} /> Que el bot pregunte
            </button>
          )}
          <label className="sr-only" htmlFor={`move-${j.id}`}>Mover tarea</label>
          <select
            id={`move-${j.id}`}
            value=""
            disabled={busy}
            onChange={e => { const v = e.target.value as JobStatus; if (v) run(() => updateJob(j.id, { status: v })) }}
            className="label border-2 border-[#2A2622] bg-[#FFF8F3] px-1.5 py-1 text-[10px]"
          >
            <option value="">Mover a…</option>
            {MOVE_OPTIONS.filter(o => o.value !== j.status).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!confirmDelete ? (
            <button className="ml-auto text-[#8C7169] hover:text-[#A32D2D]" title="Eliminar tarea" aria-label="Eliminar tarea" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
            </button>
          ) : (
            <span className="ml-auto flex items-center gap-1">
              <button className="btn btn-sm bg-[#A32D2D] text-white hover:bg-[#7F2020]" onClick={() => run(() => deleteJob(j.id))}>Eliminar</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          )}
        </div>
      )}

      {msg && <p className="mono text-[11px] text-[#58423B]">{msg}</p>}
    </article>
  )
}
